// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'firewall',
    title: "Firewall Básico Recomendado",
    description: "Reglas esenciales de seguridad para bloquear accesos indebidos desde Internet y proteger el router y tu red interna.",
    fileName: "mikrotik_firewall.rsc",
    inputs: [
        { id: "interface_mode", label: "Modo de Interfaz", type: "select", options: [
            { value: "single", label: "Interfaz única" },
            { value: "list", label: "Lista de interfaces WAN/LAN (recomendado, soporta múltiples)" }
        ], default: "single", hint: "Las listas WAN/LAN permiten varias WAN o varias LAN. Es el modelo oficial de MikroTik" },
        { id: "wan1_interface", label: "Interfaz WAN 1", type: "text", default: "ether1", hint: "En modo lista puedes separar varias con coma (ej: ether1,ether2)" },
        { id: "wan2_interface", label: "Interfaz WAN 2 (Opcional)", type: "text", default: "", hint: "Dejar en blanco si es una sola WAN" },
        { id: "lan_interface", label: "Interfaz LAN", type: "text", default: "bridge-lan", hint: "En modo lista puedes separar varias con coma (ej: bridge-lan,vlan10)" },
        { id: "enable_fasttrack", label: "Activar FastTrack Connection", type: "checkbox", default: true, hint: "Optimiza tráfico TCP. ¡Desactívalo si usas PCC o Simple Queues!" },
        { id: "raw_bogon", label: "Filtrar bogons/spoofing en RAW (RFC6890)", type: "checkbox", default: true, hint: "Descarta direcciones reservadas/falsas antes del conntrack (modelo 'Building Advanced Firewall'). Más eficiente y protege la CPU" },
        { id: "icmp_ratelimit", label: "Limitar ICMP por tasa (anti-flood)", type: "checkbox", default: true, hint: "En vez de aceptar todo ICMP, lo limita para mitigar floods (modelo Advanced Firewall)" },
        { id: "protect_winbox", label: "Permitir Acceso Winbox desde WAN", type: "checkbox", default: false, hint: "Abre puerto para administración remota" },
        { id: "winbox_port", label: "Puerto Winbox", type: "text", default: "8291" }
    ]
};

    function generate(inputs, version) {
        const useList = inputs.interface_mode === 'list';
        const wans = [inputs.wan1_interface, inputs.wan2_interface]
            .flatMap(w => (w || '').split(','))
            .map(s => s.trim())
            .filter(Boolean);
        const lans = (inputs.lan_interface || 'bridge-lan')
            .split(',').map(s => s.trim()).filter(Boolean);
        if (wans.length === 0) wans.push('ether1');
        if (lans.length === 0) lans.push('bridge-lan');

        const inLan = useList ? `in-interface-list=LAN` : `in-interface=${lans[0]}`;

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Firewall Básico y Seguridad\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Compatible con cualquier hardware (RouterOS v6 y v7)\n`;
        code += `# ====================================================\n\n`;

        // Interface-lists WAN/LAN (modelo oficial MikroTik)
        if (useList) {
            code += `# ====================================================\n`;
            code += `# 0. LISTAS DE INTERFACES WAN/LAN\n`;
            code += `# ====================================================\n`;
            code += `/interface list\n`;
            code += `add name=WAN comment="Interfaces de salida a Internet"\n`;
            code += `add name=LAN comment="Interfaces de red local"\n`;
            code += `/interface list member\n`;
            wans.forEach(i => { code += `add list=WAN interface=${i}\n`; });
            lans.forEach(i => { code += `add list=LAN interface=${i}\n`; });
            code += `\n`;
        }

        // RAW: bogon / anti-spoofing (RFC6890) antes del connection tracking
        if (inputs.raw_bogon) {
            code += `# ====================================================\n`;
            code += `# 1. LISTAS RFC6890 + TABLA RAW (anti-bogon / anti-spoofing)\n`;
            code += `#    Descarta basura ANTES del conntrack: más eficiente y\n`;
            code += `#    protege la CPU/tabla de conexiones bajo ataque.\n`;
            code += `# ====================================================\n`;
            code += `/ip firewall address-list\n`;
            ["127.0.0.0/8", "192.0.0.0/24", "192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4"]
                .forEach(a => { code += `add list=bad_ipv4 address=${a} comment="RFC6890"\n`; });
            ["0.0.0.0/8", "255.255.255.255/32"].forEach(a => { code += `add list=bad_src_ipv4 address=${a} comment="RFC6890"\n`; });
            ["0.0.0.0/8", "224.0.0.0/4"].forEach(a => { code += `add list=bad_dst_ipv4 address=${a} comment="RFC6890"\n`; });
            ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24",
             "192.0.2.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "255.255.255.255/32"]
                .forEach(a => { code += `add list=not_global_ipv4 address=${a} comment="RFC6890"\n`; });
            code += `/ip firewall raw\n`;
            code += `add chain=prerouting action=drop src-address-list=bad_ipv4 comment="drop bogon (origen)"\n`;
            code += `add chain=prerouting action=drop dst-address-list=bad_ipv4 comment="drop bogon (destino)"\n`;
            code += `add chain=prerouting action=drop src-address-list=bad_src_ipv4 comment="origen invalido"\n`;
            code += `add chain=prerouting action=drop dst-address-list=bad_dst_ipv4 comment="destino invalido"\n`;
            code += `# ADVERTENCIA: Si tu WAN tiene IP privada o CGNAT (192.168.x.x, 10.x.x.x, 100.64.0.0/10,\n`;
            code += `# tipico detras de un modem ISP en modo router), las siguientes reglas descartaran TODO\n`;
            code += `# tu trafico WAN. En ese caso elimina estas reglas o quita tu subred de not_global_ipv4.\n`;
            if (useList) {
                code += `add chain=prerouting action=drop in-interface-list=WAN src-address-list=not_global_ipv4 comment="drop no-global desde WAN (spoofing)"\n`;
            } else {
                wans.forEach(w => { code += `add chain=prerouting action=drop in-interface=${w} src-address-list=not_global_ipv4 comment="drop no-global desde WAN (spoofing)"\n`; });
            }
            code += `\n`;
        }

        code += `/ip firewall filter\n`;
        code += `# ====================================================\n`;
        code += `# 2. CADENA INPUT (Tráfico hacia el propio Router)\n`;
        code += `# ====================================================\n`;
        code += `add chain=input action=accept connection-state=established,related,untracked comment="Aceptar conexiones establecidas y relacionadas"\n`;
        code += `add chain=input action=drop connection-state=invalid comment="Descartar conexiones invalidas"\n`;
        if (inputs.icmp_ratelimit) {
            code += `add chain=input action=accept protocol=icmp limit=50/5s,5:packet comment="Permitir ICMP con limite de tasa (anti-flood)"\n`;
            code += `add chain=input action=drop protocol=icmp comment="Descartar exceso de ICMP"\n`;
        } else {
            code += `add chain=input action=accept protocol=icmp comment="Permitir ping (ICMP)"\n`;
        }

        if (inputs.protect_winbox) {
            code += `# ADVERTENCIA: Winbox queda expuesto a Internet. Se recomienda restringir por IP con address-list:\n`;
            code += `# /ip firewall address-list add list=allowed-admins address=TU_IP_PUBLICA\n`;
            code += `# Y luego usar: src-address-list=allowed-admins en la siguiente regla\n`;
            code += `add chain=input action=accept protocol=tcp dst-port=${inputs.winbox_port} comment="Permitir Winbox desde internet"\n`;
        }

        code += `add chain=input action=accept ${inLan} comment="Permitir acceso completo desde LAN"\n`;
        code += `add chain=input action=drop comment="Bloquear todos los demas accesos desde el exterior"\n\n`;

        code += `# ====================================================\n`;
        code += `# 3. CADENA FORWARD (Tráfico que cruza el Router de una red a otra)\n`;
        code += `# ====================================================\n`;

        if (inputs.enable_fasttrack) {
            code += `# Acelera navegación TCP de paquetes establecidos. ADVERTENCIA: Evita Mangle (rompe PCC y Queues simple).\n`;
            code += `add chain=forward action=fasttrack-connection connection-state=established,related comment="FastTrack para maximizar rendimiento"\n`;
        }

        code += `add chain=forward action=accept connection-state=established,related,untracked comment="Aceptar conexiones establecidas y relacionadas"\n`;
        code += `add chain=forward action=drop connection-state=invalid comment="Descartar conexiones invalidas"\n`;
        code += `add chain=forward action=accept ${inLan} comment="Permitir salida de LAN a internet"\n`;
        code += `add chain=forward action=accept connection-state=new connection-nat-state=dstnat comment="Permitir reenvio de puertos (DST-NAT)"\n`;
        code += `add chain=forward action=drop comment="Bloquear todo lo demas en Forward (Seguridad total)"\n\n`;

        code += `# ====================================================\n`;
        code += `# 4. ENMASCARAMIENTO NAT (Masquerade)\n`;
        code += `# ====================================================\n`;
        code += `/ip firewall nat\n`;
        if (useList) {
            code += `add chain=srcnat out-interface-list=WAN action=masquerade comment="Masquerade WAN"\n`;
        } else {
            wans.forEach((w, idx) => {
                code += `add chain=srcnat out-interface=${w} action=masquerade comment="Masquerade WAN${idx + 1}"\n`;
            });
        }

        return code;
    }

    window.MTB.register(definition, generate);
})();
