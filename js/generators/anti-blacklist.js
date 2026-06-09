// Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
        key: 'anti-blacklist',
        title: "Anti-Blacklist ISP / WISP (IP Pública)",
        description: "Protege tu rango de IPs públicas de caer en listas negras (Spamhaus, DNSBL, listas anti-DDoS). Bloquea spambots, reflexión/amplificación, spoofing, resolvers DNS abiertos y clientes infectados. Incluye firewall básico opcional.",
        fileName: "mikrotik_anti_blacklist.rsc",
        inputs: [
            { id: "wan_interface", label: "Interfaz / Lista WAN (Salida a Internet)", type: "text", default: "ether1", hint: "Interfaz o interface-list de salida (ej: ether1 o WAN)" },
            { id: "lan_subnet", label: "Rango de Clientes (LAN / Pool Público)", type: "text", default: "192.168.0.0/16", hint: "Subred CIDR de tus clientes. Si entregas IP pública directa, pon ese rango (ej: 45.10.20.0/24)" },
            { id: "include_firewall", label: "Incluir Firewall Básico recomendado", type: "checkbox", default: true, hint: "Agrega las reglas base (input/forward seguros + NAT masquerade) ya integradas en el orden correcto" },
            { id: "lan_interface", label: "Interfaz LAN (para Firewall Básico)", type: "text", default: "bridge-lan", hint: "Solo se usa si activas el Firewall Básico. Interfaz o lista de tu red local" },
            { id: "enable_fasttrack", label: "Activar FastTrack (Firewall Básico)", type: "checkbox", default: true, hint: "Acelera el tráfico TCP. ¡Desactívalo si usas PCC o Simple Queues!" },
            { id: "allow_winbox", label: "Permitir Winbox desde WAN (Firewall Básico)", type: "checkbox", default: false, hint: "Abre el puerto de administración a Internet. Se recomienda restringir por address-list" },
            { id: "winbox_port", label: "Puerto Winbox", type: "text", default: "8291" },
            { id: "block_smtp", label: "Bloquear SMTP saliente (Puerto 25) — Anti-Spam", type: "checkbox", default: true, hint: "Causa #1 de blacklist DNSBL: spambots de clientes infectados enviando correo directo" },
            { id: "mail_server", label: "IP de Servidor de Correo Autorizado (opcional)", type: "text", default: "", hint: "Esta IP sí podrá usar el puerto 25. Déjalo vacío si ningún cliente envía correo directo" },
            { id: "block_amplification", label: "Bloquear puertos de amplificación / reflexión DDoS", type: "checkbox", default: true, hint: "NTP, SSDP, SNMP, Chargen, CLDAP, Memcached: evita que tu red sea usada como reflector en ataques" },
            { id: "block_openresolver", label: "Bloquear DNS abierto / amplificación DNS (Puerto 53)", type: "checkbox", default: true, hint: "Impide que tus clientes sean usados como open resolvers (listas DDoS)" },
            { id: "anti_spoof", label: "Anti-Spoofing (descartar IPs de origen falsas / bogon)", type: "checkbox", default: true, hint: "Evita tráfico con IP de origen falsificada (spoofing) en ambos sentidos" },
            { id: "detect_flood", label: "Detectar y banear clientes infectados (flood de conexiones)", type: "checkbox", default: true, hint: "Detecta bots/escáneres por TASA de conexiones nuevas por segundo (no por total abierto) para no banear hogares normales" },
            { id: "conn_limit", label: "Conexiones nuevas por segundo por cliente (umbral)", type: "text", default: "50", hint: "Tasa sostenida que delata un bot/escáner. Un hogar normal rara vez supera 50/seg; un host infectado abre cientos/seg" },
            { id: "ban_time", label: "Tiempo de baneo del cliente infectado", type: "text", default: "1h" },
            { id: "notify_log", label: "Registrar eventos en el log del router", type: "checkbox", default: true }
        ]
    };

    function generate(inputs, version) {
        const wan = inputs.wan_interface || "ether1";
        const lan = inputs.lan_subnet || "192.168.0.0/16";
        const lanIf = inputs.lan_interface || "bridge-lan";
        const mail = (inputs.mail_server || "").trim();
        const connLimit = inputs.conn_limit || "100";
        const banTime = inputs.ban_time || "1h";
        const fw = inputs.include_firewall;
        const logYes = inputs.notify_log;
        const logFlood = logYes ? ` log=yes log-prefix="ANTI-BL-FLOOD"` : "";
        const logSpam = logYes ? ` log=yes log-prefix="ANTI-BL-SMTP"` : "";

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Anti-Blacklist ISP / WISP (Protección de IP Pública)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# WAN: ${wan}  |  Clientes: ${lan}\n`;
        code += `# Objetivo: evitar que tu rango público caiga en listas negras\n`;
        code += `#           (Spamhaus, DNSBL, listas anti-DDoS por reflexión).\n`;
        if (fw) {
            code += `# Incluye Firewall Básico: reglas anti-blacklist ya intercaladas en el\n`;
            code += `# orden correcto (antes del accept de LAN y del drop final).\n`;
        }
        code += `# ====================================================\n\n`;

        // Bogons address-list (used by anti-spoofing)
        if (inputs.anti_spoof) {
            code += `# Lista de redes BOGON / reservadas (origen ilegítimo = spoofing)\n`;
            code += `/ip firewall address-list\n`;
            const bogons = [
                "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
                "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
                "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24",
                "224.0.0.0/4", "240.0.0.0/4"
            ];
            bogons.forEach(b => {
                code += `add list=BOGONS address=${b} comment="Anti-Blacklist bogon"\n`;
            });
            code += `\n`;
        }

        code += `/ip firewall filter\n\n`;

        // ============ INPUT CHAIN ============
        code += `# ====================================================\n`;
        code += `# CADENA INPUT (tráfico hacia el propio router)\n`;
        code += `# ====================================================\n`;
        if (fw) {
            code += `add chain=input action=accept connection-state=established,related,untracked comment="Aceptar establecidas/relacionadas"\n`;
            code += `add chain=input action=drop connection-state=invalid comment="Descartar inválidas"\n`;
            code += `add chain=input action=accept protocol=icmp comment="Permitir ICMP (ping)"\n`;
        }
        if (inputs.anti_spoof) {
            code += `add chain=input action=drop in-interface=${wan} src-address-list=BOGONS comment="Anti-BL: drop bogon source (router)"\n`;
        }
        if (inputs.block_amplification) {
            code += `add chain=input action=drop protocol=udp in-interface=${wan} dst-port=19,123,161,389,1900,11211,1434,137 comment="Anti-BL: drop reflexión (router)"\n`;
        }
        if (inputs.block_openresolver) {
            code += `add chain=input action=drop protocol=udp in-interface=${wan} dst-port=53 comment="Anti-BL: drop DNS entrante (router)"\n`;
            code += `add chain=input action=drop protocol=tcp in-interface=${wan} dst-port=53 comment="Anti-BL: drop DNS entrante TCP (router)"\n`;
        }
        if (inputs.detect_flood) {
            code += `add chain=input action=drop src-address-list=infectados comment="Anti-BL: bloquear clientes infectados (router)"\n`;
        }
        if (fw) {
            if (inputs.allow_winbox) {
                code += `# ADVERTENCIA: Winbox queda expuesto a Internet. Restríngelo por IP:\n`;
                code += `# /ip firewall address-list add list=allowed-admins address=TU_IP_PUBLICA\n`;
                code += `# y añade src-address-list=allowed-admins a la siguiente regla.\n`;
                code += `add chain=input action=accept protocol=tcp dst-port=${inputs.winbox_port || "8291"} comment="Permitir Winbox desde Internet"\n`;
            }
            code += `add chain=input action=accept in-interface=${lanIf} comment="Permitir acceso completo desde LAN"\n`;
            code += `add chain=input action=drop comment="Bloquear el resto del tráfico hacia el router"\n`;
        }
        code += `\n`;

        // ============ FORWARD CHAIN ============
        code += `# ====================================================\n`;
        code += `# CADENA FORWARD (tráfico que cruza el router)\n`;
        code += `# ====================================================\n`;
        if (fw) {
            if (inputs.enable_fasttrack) {
                code += `# FastTrack acelera TCP establecido. ADVERTENCIA: evita Mangle (rompe PCC/Queues simples).\n`;
                code += `add chain=forward action=fasttrack-connection connection-state=established,related comment="FastTrack para rendimiento"\n`;
            }
            code += `add chain=forward action=accept connection-state=established,related,untracked comment="Aceptar establecidas/relacionadas"\n`;
            code += `add chain=forward action=drop connection-state=invalid comment="Descartar inválidas"\n`;
        }
        if (inputs.anti_spoof) {
            code += `add chain=forward action=drop in-interface=${wan} src-address-list=BOGONS comment="Anti-BL: drop bogon source (entrante)"\n`;
            code += `add chain=forward action=drop out-interface=${wan} src-address=!${lan} comment="Anti-BL: drop spoofed source (saliente)"\n`;
        }
        if (inputs.block_smtp) {
            if (mail) {
                code += `add chain=forward action=accept protocol=tcp dst-port=25 src-address=${mail} out-interface=${wan} comment="Anti-BL: permitir servidor de correo autorizado"\n`;
            }
            code += `add chain=forward action=drop protocol=tcp dst-port=25 src-address=${lan} out-interface=${wan}${logSpam} comment="Anti-BL: bloquear SMTP saliente (spambots)"\n`;
        }
        if (inputs.block_amplification) {
            code += `add chain=forward action=drop protocol=udp in-interface=${wan} dst-port=19,123,161,389,1900,11211,1434,137 comment="Anti-BL: drop reflexión hacia clientes"\n`;
        }
        if (inputs.block_openresolver) {
            code += `add chain=forward action=drop protocol=udp in-interface=${wan} dst-port=53 comment="Anti-BL: drop open resolver hacia clientes"\n`;
            code += `add chain=forward action=drop protocol=tcp in-interface=${wan} dst-port=53 comment="Anti-BL: drop open resolver TCP hacia clientes"\n`;
        }
        if (inputs.detect_flood) {
            const rate = parseInt(connLimit) > 0 ? parseInt(connLimit) : 50;
            const burst = rate * 2;
            code += `# Detección de bots/escáneres por TASA de conexiones nuevas/seg (NO por total abierto:\n`;
            code += `# así un hogar con cientos de conexiones simultáneas legítimas NO se banea)\n`;
            code += `add chain=forward action=drop src-address-list=infectados comment="Anti-BL: bloquear clientes ya detectados (saliente)"\n`;
            code += `add chain=forward action=accept connection-state=new protocol=tcp src-address=${lan} out-interface=${wan} limit=${rate},${burst}:packet comment="Anti-BL: tasa normal de conexiones nuevas (deja pasar)"\n`;
            code += `add chain=forward action=add-src-to-address-list connection-state=new protocol=tcp src-address=${lan} out-interface=${wan} address-list=infectados address-list-timeout=${banTime}${logFlood} comment="Anti-BL: exceso de tasa = posible bot/escáner"\n`;
        }
        if (fw) {
            code += `add chain=forward action=accept in-interface=${lanIf} comment="Permitir salida de LAN a Internet"\n`;
            code += `add chain=forward action=accept connection-state=new connection-nat-state=dstnat comment="Permitir reenvío de puertos (DST-NAT)"\n`;
            code += `add chain=forward action=drop comment="Bloquear todo lo demás en Forward"\n`;
        }
        code += `\n`;

        // ============ NAT ============
        if (fw) {
            code += `# ====================================================\n`;
            code += `# NAT (Enmascaramiento de salida)\n`;
            code += `# ====================================================\n`;
            code += `/ip firewall nat\n`;
            code += `add chain=srcnat out-interface=${wan} action=masquerade comment="Masquerade WAN"\n\n`;
        }

        // ============ Notes ============
        if (inputs.anti_spoof) {
            code += `# Refuerzo recomendado (RouterOS): activa Reverse Path Filtering\n`;
            code += `# /ip settings set rp-filter=loose\n`;
        }
        code += `# ====================================================\n`;
        code += `# RECOMENDACIONES:\n`;
        if (!fw) {
            code += `#  - Coloca estas reglas ANTES de tu regla final de accept/drop por defecto.\n`;
        }
        if (inputs.block_smtp) {
            code += `#  - Los puertos 587 (submission) y 465 (SMTPS) NO se bloquean: son correo legítimo autenticado.\n`;
        }
        code += `#  - Verifica tu IP pública en: https://check.spamhaus.org y https://mxtoolbox.com/blacklists.aspx\n`;
        code += `#  - Mantén también una blocklist entrante (FireHOL/Spamhaus) y Anti Brute-Force.\n`;
        if (fw && inputs.enable_fasttrack) {
            code += `#  - RENDIMIENTO: si la velocidad baja, confirma que FastTrack tiene tráfico:\n`;
            code += `#    /ip firewall filter print stats where action=fasttrack-connection\n`;
            code += `#    Recuerda: FastTrack se rompe si activas Mangle/PCC/Simple Queues.\n`;
        }
        if (inputs.detect_flood) {
            code += `#  - La detección usa TASA de conexiones nuevas/seg, no total abierto: no banea hogares normales.\n`;
            code += `#  - Revisa/limpia detectados con: /ip firewall address-list print where list=infectados\n`;
            code += `#    Si aparece un cliente legítimo, sube el umbral de conexiones nuevas/seg.\n`;
        }
        code += `# ====================================================\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
