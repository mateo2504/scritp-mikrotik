// Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
        key: 'anti-blacklist',
        title: "Anti-Blacklist ISP / WISP (IP Pública)",
        description: "Protege tu rango de IPs públicas de caer en listas negras (Spamhaus, DNSBL, listas anti-DDoS). Bloquea spambots, reflexión/amplificación, spoofing, resolvers DNS abiertos y clientes infectados. Incluye firewall básico opcional.",
        fileName: "mikrotik_anti_blacklist.rsc",
        inputs: [
            { id: "interface_mode", label: "Modo de Interfaz", type: "select", options: [
                { value: "single", label: "Interfaz única (ej: ether1)" },
                { value: "list", label: "Lista de interfaces WAN/LAN (recomendado, soporta múltiples)" }
            ], default: "single", hint: "Las listas WAN/LAN permiten varias WAN o varias LAN. Es el modelo oficial de MikroTik" },
            { id: "wan_interface", label: "Interfaz WAN (Salida a Internet)", type: "text", default: "ether1", hint: "Interfaz de salida (ej: ether1). En modo lista: separa varias con coma (ej: ether1,ether2)" },
            { id: "lan_subnet", label: "Rango de Clientes (LAN / Pool Público)", type: "text", default: "192.168.0.0/16", hint: "Subred CIDR de tus clientes. Si entregas IP pública directa, pon ese rango (ej: 45.10.20.0/24)" },
            { id: "include_firewall", label: "Incluir Firewall Básico recomendado", type: "checkbox", default: true, hint: "Agrega las reglas base (input/forward seguros + NAT masquerade) ya integradas en el orden correcto" },
            { id: "lan_interface", label: "Interfaz LAN (para Firewall Básico)", type: "text", default: "bridge-lan", hint: "Interfaz de tu red local. En modo lista: separa varias con coma (ej: bridge-lan,vlan10)" },
            { id: "enable_fasttrack", label: "Activar FastTrack (Firewall Básico)", type: "checkbox", default: true, hint: "Acelera el tráfico TCP. ¡Desactívalo si usas PCC o Simple Queues!" },
            { id: "icmp_ratelimit", label: "Limitar ICMP por tasa (anti-flood)", type: "checkbox", default: true, hint: "En vez de aceptar todo ICMP, lo limita para mitigar floods (modelo Advanced Firewall). Solo con Firewall Básico" },
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
            { id: "raw_mode", label: "Modo alto rendimiento (filtrar en RAW)", type: "checkbox", default: false, hint: "Mueve los drops sin estado (SMTP, amplificación, DNS, anti-spoofing) a /ip firewall raw y deja el forward mínimo. Reduce carga de CPU. Ideal para WISP de alto tráfico. Con NAT el conntrack sigue activo" },
            { id: "notify_log", label: "Registrar eventos en el log del router", type: "checkbox", default: true }
        ]
    };

    function generate(inputs, version) {
        const wan = inputs.wan_interface || "ether1";
        const lan = inputs.lan_subnet || "192.168.0.0/16";
        const lanIf = inputs.lan_interface || "bridge-lan";
        const mail = (inputs.mail_server || "").trim();

        // Modo de interfaz: única vs interface-list (modelo oficial MikroTik)
        const useList = inputs.interface_mode === 'list';
        const inWan = useList ? `in-interface-list=WAN` : `in-interface=${wan}`;
        const outWan = useList ? `out-interface-list=WAN` : `out-interface=${wan}`;
        const inLan = useList ? `in-interface-list=LAN` : `in-interface=${lanIf}`;
        const connLimit = inputs.conn_limit || "100";
        const banTime = inputs.ban_time || "1h";
        const fw = inputs.include_firewall;
        const rawMode = inputs.raw_mode;
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

        // Interface-lists WAN/LAN (modelo oficial MikroTik: soporta múltiples WAN/LAN)
        if (useList) {
            code += `# Listas de interfaces WAN/LAN (agrega aquí todas tus interfaces)\n`;
            code += `/interface list\n`;
            code += `add name=WAN comment="Anti-BL: interfaces de salida a Internet"\n`;
            code += `add name=LAN comment="Anti-BL: interfaces de red local"\n`;
            code += `/interface list member\n`;
            wan.split(',').forEach(i => { const t = i.trim(); if (t) code += `add list=WAN interface=${t}\n`; });
            lanIf.split(',').forEach(i => { const t = i.trim(); if (t) code += `add list=LAN interface=${t}\n`; });
            code += `\n`;
        }

        // Anti-spoofing: RFC6890 address-lists + RAW prerouting (modelo "Building Advanced Firewall")
        if (inputs.anti_spoof) {
            code += `# Listas RFC6890 (modelo oficial "Building Advanced Firewall" de MikroTik)\n`;
            code += `/ip firewall address-list\n`;
            // No válidas ni como origen ni como destino
            const badIpv4 = ["127.0.0.0/8", "192.0.0.0/24", "192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4"];
            badIpv4.forEach(a => { code += `add list=bad_ipv4 address=${a} comment="RFC6890"\n`; });
            // No válidas como ORIGEN
            ["0.0.0.0/8", "255.255.255.255/32"].forEach(a => { code += `add list=bad_src_ipv4 address=${a} comment="RFC6890"\n`; });
            // No válidas como DESTINO
            ["0.0.0.0/8", "224.0.0.0/4"].forEach(a => { code += `add list=bad_dst_ipv4 address=${a} comment="RFC6890"\n`; });
            // No enrutables globalmente (spoofing si llegan como origen desde la WAN)
            const notGlobal = ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "169.254.0.0/16", "172.16.0.0/12",
                "192.0.0.0/24", "192.0.2.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "255.255.255.255/32"];
            notGlobal.forEach(a => { code += `add list=not_global_ipv4 address=${a} comment="RFC6890"\n`; });
            code += `\n`;

            code += `# ====================================================\n`;
            code += `# TABLA RAW (prerouting): descarta bogons/spoofing ANTES del connection\n`;
            code += `# tracking. Más eficiente y protege la CPU/conntrack bajo ataque.\n`;
            code += `# ====================================================\n`;
            code += `/ip firewall raw\n`;
            code += `add chain=prerouting action=drop src-address-list=bad_ipv4 comment="Anti-BL: drop bogon (origen)"\n`;
            code += `add chain=prerouting action=drop dst-address-list=bad_ipv4 comment="Anti-BL: drop bogon (destino)"\n`;
            code += `add chain=prerouting action=drop src-address-list=bad_src_ipv4 comment="Anti-BL: origen inválido"\n`;
            code += `add chain=prerouting action=drop dst-address-list=bad_dst_ipv4 comment="Anti-BL: destino inválido"\n`;
            code += `add chain=prerouting action=drop ${inWan} src-address-list=not_global_ipv4 comment="Anti-BL: drop no-global desde WAN (spoofing entrante)"\n`;
            code += `\n`;
        }

        // Modo alto rendimiento: drops SIN ESTADO en RAW (no requieren conntrack -> menos CPU)
        if (rawMode) {
            code += `# ====================================================\n`;
            code += `# RAW ALTO RENDIMIENTO: filtrado sin estado antes del conntrack.\n`;
            code += `# Mantiene la cadena forward mínima para no cargar la CPU.\n`;
            code += `# ====================================================\n`;
            code += `/ip firewall raw\n`;
            if (inputs.anti_spoof) {
                code += `# Egress anti-spoofing (BCP38): el cliente solo puede salir con su propio rango\n`;
                code += `add chain=prerouting action=drop ${inLan} src-address=!${lan} comment="Anti-BL: drop spoofed source (saliente)"\n`;
            }
            if (inputs.block_smtp) {
                if (mail) {
                    code += `add chain=prerouting action=accept protocol=tcp dst-port=25 src-address=${mail} comment="Anti-BL: permitir servidor de correo autorizado"\n`;
                }
                code += `add chain=prerouting action=drop protocol=tcp dst-port=25 src-address=${lan}${logSpam} comment="Anti-BL: bloquear SMTP saliente (spambots)"\n`;
            }
            if (inputs.block_amplification) {
                code += `add chain=prerouting action=drop protocol=udp ${inWan} dst-port=19,123,161,389,1900,11211,1434,137 comment="Anti-BL: drop reflexión/amplificación"\n`;
            }
            if (inputs.block_openresolver) {
                code += `add chain=prerouting action=drop protocol=udp ${inWan} dst-port=53 comment="Anti-BL: drop DNS abierto (UDP)"\n`;
                code += `add chain=prerouting action=drop protocol=tcp ${inWan} dst-port=53 comment="Anti-BL: drop DNS abierto (TCP)"\n`;
            }
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
            if (inputs.icmp_ratelimit) {
                code += `add chain=input action=accept protocol=icmp limit=50/5s,5:packet comment="Permitir ICMP con límite de tasa (anti-flood)"\n`;
                code += `add chain=input action=drop protocol=icmp comment="Descartar exceso de ICMP"\n`;
            } else {
                code += `add chain=input action=accept protocol=icmp comment="Permitir ICMP (ping)"\n`;
            }
        }
        if (inputs.block_amplification && !rawMode) {
            code += `add chain=input action=drop protocol=udp ${inWan} dst-port=19,123,161,389,1900,11211,1434,137 comment="Anti-BL: drop reflexión (router)"\n`;
        }
        if (inputs.block_openresolver && !rawMode) {
            code += `add chain=input action=drop protocol=udp ${inWan} dst-port=53 comment="Anti-BL: drop DNS entrante (router)"\n`;
            code += `add chain=input action=drop protocol=tcp ${inWan} dst-port=53 comment="Anti-BL: drop DNS entrante TCP (router)"\n`;
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
            code += `add chain=input action=accept ${inLan} comment="Permitir acceso completo desde LAN"\n`;
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
        if (inputs.anti_spoof && !rawMode) {
            code += `# Egress anti-spoofing (BCP38): un cliente solo puede salir con su propio rango\n`;
            code += `add chain=forward action=drop ${outWan} src-address=!${lan} comment="Anti-BL: drop spoofed source (saliente)"\n`;
        }
        if (inputs.block_smtp && !rawMode) {
            if (mail) {
                code += `add chain=forward action=accept protocol=tcp dst-port=25 src-address=${mail} ${outWan} comment="Anti-BL: permitir servidor de correo autorizado"\n`;
            }
            code += `add chain=forward action=drop protocol=tcp dst-port=25 src-address=${lan} ${outWan}${logSpam} comment="Anti-BL: bloquear SMTP saliente (spambots)"\n`;
        }
        if (inputs.block_amplification && !rawMode) {
            code += `add chain=forward action=drop protocol=udp ${inWan} dst-port=19,123,161,389,1900,11211,1434,137 comment="Anti-BL: drop reflexión hacia clientes"\n`;
        }
        if (inputs.block_openresolver && !rawMode) {
            code += `add chain=forward action=drop protocol=udp ${inWan} dst-port=53 comment="Anti-BL: drop open resolver hacia clientes"\n`;
            code += `add chain=forward action=drop protocol=tcp ${inWan} dst-port=53 comment="Anti-BL: drop open resolver TCP hacia clientes"\n`;
        }
        if (inputs.detect_flood) {
            const rate = parseInt(connLimit) > 0 ? parseInt(connLimit) : 50;
            const burst = rate * 2;
            code += `# Detección de bots/escáneres por TASA de conexiones nuevas/seg (NO por total abierto:\n`;
            code += `# así un hogar con cientos de conexiones simultáneas legítimas NO se banea)\n`;
            code += `add chain=forward action=drop src-address-list=infectados comment="Anti-BL: bloquear clientes ya detectados (saliente)"\n`;
            code += `add chain=forward action=accept connection-state=new protocol=tcp src-address=${lan} ${outWan} limit=${rate},${burst}:packet comment="Anti-BL: tasa normal de conexiones nuevas (deja pasar)"\n`;
            code += `add chain=forward action=add-src-to-address-list connection-state=new protocol=tcp src-address=${lan} ${outWan} address-list=infectados address-list-timeout=${banTime}${logFlood} comment="Anti-BL: exceso de tasa = posible bot/escáner"\n`;
        }
        if (fw) {
            code += `add chain=forward action=accept ${inLan} comment="Permitir salida de LAN a Internet"\n`;
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
            code += `add chain=srcnat ${outWan} action=masquerade comment="Masquerade WAN"\n\n`;
        }

        // ============ Notes ============
        if (rawMode) {
            code += `# MODO ALTO RENDIMIENTO: los drops sin estado están en RAW (prerouting),\n`;
            code += `# que no usa connection tracking, por lo que la cadena forward queda\n`;
            code += `# mínima y consume menos CPU.\n`;
            code += `# NOTA NAT: si usas masquerade, el conntrack sigue ACTIVO (el NAT lo exige),\n`;
            code += `# así que no se alcanza la Fast Path pura. El mayor acelerador sería\n`;
            code += `# FastTrack, pero es incompatible con Simple Queues/Mangle.\n`;
            code += `# La detección de flood permanece en filter porque requiere conntrack.\n`;
        }
        if (inputs.anti_spoof) {
            code += `# El filtrado de bogons se hace en RAW (prerouting), antes del conntrack.\n`;
            code += `# Refuerzo adicional (RouterOS): activa Reverse Path Filtering\n`;
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
