// Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
        key: 'anti-blacklist',
        title: "Anti-Blacklist ISP / WISP (IP Pública)",
        description: "Protege tu rango de IPs públicas de caer en listas negras (Spamhaus, DNSBL, listas anti-DDoS). Bloquea spambots, reflexión/amplificación, spoofing, resolvers DNS abiertos y clientes infectados.",
        fileName: "mikrotik_anti_blacklist.rsc",
        inputs: [
            { id: "wan_interface", label: "Interfaz / Lista WAN (Salida a Internet)", type: "text", default: "ether1", hint: "Interfaz o interface-list de salida (ej: ether1 o WAN)" },
            { id: "lan_subnet", label: "Rango de Clientes (LAN / Pool Público)", type: "text", default: "192.168.0.0/16", hint: "Subred CIDR de tus clientes. Si entregas IP pública directa, pon ese rango (ej: 45.10.20.0/24)" },
            { id: "block_smtp", label: "Bloquear SMTP saliente (Puerto 25) — Anti-Spam", type: "checkbox", default: true, hint: "Causa #1 de blacklist DNSBL: spambots de clientes infectados enviando correo directo" },
            { id: "mail_server", label: "IP de Servidor de Correo Autorizado (opcional)", type: "text", default: "", hint: "Esta IP sí podrá usar el puerto 25. Déjalo vacío si ningún cliente envía correo directo" },
            { id: "block_amplification", label: "Bloquear puertos de amplificación / reflexión DDoS", type: "checkbox", default: true, hint: "NTP, SSDP, SNMP, Chargen, CLDAP, Memcached: evita que tu red sea usada como reflector en ataques" },
            { id: "block_openresolver", label: "Bloquear DNS abierto / amplificación DNS (Puerto 53)", type: "checkbox", default: true, hint: "Impide que tus clientes sean usados como open resolvers (listas DDoS)" },
            { id: "anti_spoof", label: "Anti-Spoofing (descartar IPs de origen falsas / bogon)", type: "checkbox", default: true, hint: "Evita tráfico con IP de origen falsificada (spoofing) en ambos sentidos" },
            { id: "detect_flood", label: "Detectar y banear clientes infectados (flood de conexiones)", type: "checkbox", default: true, hint: "Cuenta conexiones simultáneas por cliente y banea temporalmente a los que se disparan" },
            { id: "conn_limit", label: "Límite de conexiones simultáneas por cliente", type: "text", default: "100", hint: "Si un cliente supera este número se considera infectado (bot/scanner)" },
            { id: "ban_time", label: "Tiempo de baneo del cliente infectado", type: "text", default: "1h" },
            { id: "notify_log", label: "Registrar eventos en el log del router", type: "checkbox", default: true }
        ]
    };

    function generate(inputs, version) {
        const wan = inputs.wan_interface || "ether1";
        const lan = inputs.lan_subnet || "192.168.0.0/16";
        const mail = (inputs.mail_server || "").trim();
        const connLimit = inputs.conn_limit || "100";
        const banTime = inputs.ban_time || "1h";
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
        code += `# ====================================================\n\n`;

        // 1. Bogons address-list (used by anti-spoofing)
        if (inputs.anti_spoof) {
            code += `# 1. Lista de redes BOGON / reservadas (origen ilegítimo = spoofing)\n`;
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

        // 2. Anti-spoofing
        if (inputs.anti_spoof) {
            code += `# 2. Anti-Spoofing: descartar paquetes con IP de origen bogon\n`;
            code += `add chain=input  action=drop in-interface=${wan} src-address-list=BOGONS comment="Anti-BL: drop bogon source (router)"\n`;
            code += `add chain=forward action=drop in-interface=${wan} src-address-list=BOGONS comment="Anti-BL: drop bogon source (entrante)"\n`;
            code += `# Saliente: un cliente solo puede usar IP de origen de su propio rango\n`;
            code += `add chain=forward action=drop out-interface=${wan} src-address=!${lan} comment="Anti-BL: drop spoofed source (saliente)"\n`;
            code += `# Refuerzo recomendado (RouterOS): activa Reverse Path Filtering\n`;
            code += `# /ip settings set rp-filter=loose\n\n`;
        }

        // 3. Anti-Spam SMTP
        if (inputs.block_smtp) {
            code += `# 3. Anti-Spam: bloquear SMTP directo (puerto 25) de clientes infectados\n`;
            if (mail) {
                code += `add chain=forward action=accept protocol=tcp dst-port=25 src-address=${mail} out-interface=${wan} comment="Anti-BL: permitir servidor de correo autorizado"\n`;
            }
            code += `add chain=forward action=drop protocol=tcp dst-port=25 src-address=${lan} out-interface=${wan}${logSpam} comment="Anti-BL: bloquear SMTP saliente (spambots)"\n`;
            code += `# Nota: los puertos 587 (submission) y 465 (SMTPS) NO se bloquean: son\n`;
            code += `# correo legítimo autenticado de clientes. Solo el 25 dispara DNSBL.\n\n`;
        }

        // 4. Amplification / reflection
        if (inputs.block_amplification) {
            code += `# 4. Anti-Amplificación / Reflexión: cerrar puertos usados en ataques DDoS\n`;
            code += `#    (Chargen 19, NTP 123, SNMP 161, CLDAP 389, SSDP 1900, Memcached 11211, MSSQL 1434, NetBIOS 137)\n`;
            code += `add chain=input  action=drop protocol=udp in-interface=${wan} dst-port=19,123,161,389,1900,11211,1434,137 comment="Anti-BL: drop reflexión (router)"\n`;
            code += `add chain=forward action=drop protocol=udp in-interface=${wan} dst-port=19,123,161,389,1900,11211,1434,137 comment="Anti-BL: drop reflexión hacia clientes"\n\n`;
        }

        // 5. Open DNS resolver
        if (inputs.block_openresolver) {
            code += `# 5. Anti DNS abierto / amplificación DNS: bloquear consultas DNS entrantes desde Internet\n`;
            code += `add chain=input  action=drop protocol=udp in-interface=${wan} dst-port=53 comment="Anti-BL: drop DNS entrante (router)"\n`;
            code += `add chain=input  action=drop protocol=tcp in-interface=${wan} dst-port=53 comment="Anti-BL: drop DNS entrante TCP (router)"\n`;
            code += `add chain=forward action=drop protocol=udp in-interface=${wan} dst-port=53 comment="Anti-BL: drop open resolver hacia clientes"\n`;
            code += `add chain=forward action=drop protocol=tcp in-interface=${wan} dst-port=53 comment="Anti-BL: drop open resolver TCP hacia clientes"\n`;
            code += `# Si algún cliente opera un DNS autoritativo legítimo, agrega una regla accept\n`;
            code += `# por encima de estas con su dst-address específico.\n\n`;
        }

        // 6. Infected client / flood detection
        if (inputs.detect_flood) {
            code += `# 6. Detección de clientes infectados (botnets / scanners por exceso de conexiones)\n`;
            code += `add chain=forward action=add-src-to-address-list connection-state=new src-address=${lan} out-interface=${wan} \\\n`;
            code += `    connection-limit=${connLimit},32 address-list=infectados address-list-timeout=${banTime}${logFlood} comment="Anti-BL: marcar cliente con flood de conexiones"\n`;
            code += `add chain=forward action=drop src-address-list=infectados comment="Anti-BL: bloquear clientes infectados (saliente)"\n`;
            code += `add chain=input  action=drop src-address-list=infectados comment="Anti-BL: bloquear clientes infectados (router)"\n\n`;
        }

        code += `# ====================================================\n`;
        code += `# RECOMENDACIONES:\n`;
        code += `#  - Coloca estas reglas ANTES de tu regla final de accept/drop por defecto.\n`;
        code += `#  - Verifica tu IP pública en: https://check.spamhaus.org y https://mxtoolbox.com/blacklists.aspx\n`;
        code += `#  - Mantén también una blocklist entrante (FireHOL/Spamhaus) y Anti Brute-Force.\n`;
        if (inputs.detect_flood) {
            code += `#  - Revisa los clientes detectados con: /ip firewall address-list print where list=infectados\n`;
        }
        code += `# ====================================================\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
