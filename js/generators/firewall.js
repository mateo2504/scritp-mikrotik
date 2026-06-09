// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'firewall',
    title: "Firewall Básico Recomendado",
    description: "Reglas esenciales de seguridad para bloquear accesos indebidos desde Internet y proteger el router y tu red interna.",
    fileName: "mikrotik_firewall.rsc",
    inputs: [
        { id: "wan1_interface", label: "Interfaz WAN 1", type: "text", default: "ether1" },
        { id: "wan2_interface", label: "Interfaz WAN 2 (Opcional)", type: "text", default: "", hint: "Dejar en blanco si es una sola WAN" },
        { id: "lan_interface", label: "Interfaz LAN", type: "text", default: "bridge-lan" },
        { id: "enable_fasttrack", label: "Activar FastTrack Connection", type: "checkbox", default: true, hint: "Optimiza tráfico TCP. ¡Desactívalo si usas PCC o Simple Queues!" },
        { id: "protect_winbox", label: "Permitir Acceso Winbox desde WAN", type: "checkbox", default: false, hint: "Abre puerto para administración remota" },
        { id: "winbox_port", label: "Puerto Winbox", type: "text", default: "8291" }
    ]
};

    function generate(inputs, version) {
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Firewall Básico y Seguridad\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Compatible con cualquier hardware\n`;
        code += `# ====================================================\n\n`;
    
        code += `/ip firewall filter\n`;
        code += `# ====================================================\n`;
        code += `# 1. CADENA INPUT (Tráfico hacia el propio Router)\n`;
        code += `# ====================================================\n`;
        code += `add chain=input action=accept connection-state=established,related,untracked comment="Aceptar conexiones establecidas y relacionadas"\n`;
        code += `add chain=input action=drop connection-state=invalid comment="Descartar conexiones invalidas"\n`;
        code += `add chain=input action=accept protocol=icmp comment="Permitir ping (ICMP)"\n`;
        
        if (inputs.protect_winbox) {
            code += `# ADVERTENCIA: Winbox queda expuesto a Internet. Se recomienda restringir por IP con address-list:\n`;
            code += `# /ip firewall address-list add list=allowed-admins address=TU_IP_PUBLICA\n`;
            code += `# Y luego usar: src-address-list=allowed-admins en la siguiente regla\n`;
            code += `add chain=input action=accept protocol=tcp dst-port=${inputs.winbox_port} comment="Permitir Winbox desde internet"\n`;
        }
        
        code += `add chain=input action=accept in-interface=${inputs.lan_interface} comment="Permitir acceso completo desde LAN"\n`;
        code += `add chain=input action=drop comment="Bloquear todos los demas accesos desde el exterior"\n\n`;
    
        code += `# ====================================================\n`;
        code += `# 2. CADENA FORWARD (Tráfico que cruza el Router de una red a otra)\n`;
        code += `# ====================================================\n`;
        
        if (inputs.enable_fasttrack) {
            code += `# Acelera navegación TCP de paquetes establecidos. ADVERTENCIA: Evita Mangle (rompe PCC y Queues simple).\n`;
            code += `add chain=forward action=fasttrack-connection connection-state=established,related comment="FastTrack para maximizar rendimiento"\n`;
        }
        
        code += `add chain=forward action=accept connection-state=established,related,untracked comment="Aceptar conexiones establecidas y relacionadas"\n`;
        code += `add chain=forward action=drop connection-state=invalid comment="Descartar conexiones invalidas"\n`;
        code += `add chain=forward action=accept in-interface=${inputs.lan_interface} comment="Permitir salida de LAN a internet"\n`;
        code += `add chain=forward action=accept connection-state=new connection-nat-state=dstnat comment="Permitir reenvio de puertos (DST-NAT)"\n`;
        code += `add chain=forward action=drop comment="Bloquear todo lo demas en Forward (Seguridad total)"\n\n`;
    
        code += `# ====================================================\n`;
        code += `# 3. ENMASCARAMIENTO NAT (Masquerade)\n`;
        code += `# ====================================================\n`;
        code += `/ip firewall nat\n`;
        code += `add chain=srcnat out-interface=${inputs.wan1_interface} action=masquerade comment="Masquerade WAN1"\n`;
        
        if (inputs.wan2_interface && inputs.wan2_interface.trim() !== '') {
            code += `add chain=srcnat out-interface=${inputs.wan2_interface} action=masquerade comment="Masquerade WAN2"\n`;
        }
    
        return code;
    }

    window.MTB.register(definition, generate);
})();
