// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'failover',
    title: "Failover Recursivo (Múltiples WAN)",
    description: "Monitoreo constante de Internet real mediante pings a hosts externos públicos. Si la línea principal cae, se conmuta automáticamente entre las líneas disponibles (2 a 5 WANs).",
    fileName: "mikrotik_failover.rsc",
    inputs: [
        { 
            id: "wan_count", 
            label: "Cantidad de Líneas WAN", 
            type: "select", 
            options: [
                { value: "2", label: "2 WANs" },
                { value: "3", label: "3 WANs" },
                { value: "4", label: "4 WANs" },
                { value: "5", label: "5 WANs" }
            ], 
            default: "2",
            hint: "Número de interfaces WAN a monitorear"
        },
        {
            id: "wan_mode",
            label: "Tipo de Enrutamiento / IPs",
            type: "select",
            options: [
                { value: "static", label: "IPs Estáticas o Modems Bridge (Gateway Fijo)" },
                { value: "dhcp", label: "DHCP Client (IPs y Gateways Dinámicos)" }
            ],
            default: "static",
            hint: "Selecciona DHCP para autogenerar scripts de actualización de gateways dinámicos."
        }
    ]
};

    function generate(inputs, version) {
        const isV7 = version === 'v7';
        const N = parseInt(inputs.wan_count || 2);
        const isDhcp = inputs.wan_mode === 'dhcp';
        const hostDefaults = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222", "8.8.4.4"];
    
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Failover Recursivo con Múltiples WAN (${N} WANs)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Modo WAN: ${isDhcp ? 'DHCP Client (Dinámico)' : 'IP Estática (Fijo)'}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Compatible con cualquier Routerboard\n`;
        code += `# ====================================================\n\n`;
    
        code += `# 1. Configurar rutas principales condicionadas por hosts de internet\n`;
        code += `/ip route\n`;
    
        code += `# Rutas virtuales recursivas que comprueban conexión real (target-scope=11 para resolver el gateway por la ruta de control scope=10)\n`;
        for (let i = 1; i <= N; i++) {
            const pingHost = inputs[`ping_host${i}`] || hostDefaults[i - 1] || "8.8.8.8";
            code += `add dst-address=0.0.0.0/0 gateway=${pingHost} check-gateway=ping target-scope=11 distance=${i} comment="WAN${i} Recursivo Primario"\n`;
        }
        code += `\n`;
    
        code += `# Rutas físicas fijas (scope=10) para forzar el ping a los hosts de prueba por la WAN correcta\n`;
        for (let i = 1; i <= N; i++) {
            const pingHost = inputs[`ping_host${i}`] || hostDefaults[i - 1] || "8.8.8.8";
            const wanGateway = inputs[`wan${i}_gateway`] || `192.168.${i}.1`;
            if (isDhcp) {
                code += `add dst-address=${pingHost}/32 gateway=127.0.0.1 scope=10 disabled=yes comment="Control recursivo WAN${i}"\n`;
            } else {
                code += `add dst-address=${pingHost}/32 gateway=${wanGateway} scope=10 comment="Control recursivo WAN${i}"\n`;
            }
        }
    
        code += `\n# 2. Configurar NAT Masquerade para todas las interfaces WAN\n`;
        code += `/ip firewall nat\n`;
        for (let i = 1; i <= N; i++) {
            const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
            code += `add chain=srcnat out-interface=${wanInterface} action=masquerade comment="Masquerade WAN${i}"\n`;
        }
        
        if (isDhcp) {
            code += `\n# 3. Configurar DHCP Client en las interfaces WAN con script de actualización\n`;
            code += `/ip dhcp-client\n`;
            for (let i = 1; i <= N; i++) {
                const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
                code += `add interface=${wanInterface} add-default-route=no use-peer-dns=yes use-peer-ntp=yes disabled=no script=":if (\\$bound = 1) do={\\n    /ip route set [find comment=\\\"Control recursivo WAN${i}\\\"] gateway=\\$\\\"gateway-address\\\" disabled=no\\n} else={\\n    /ip route set [find comment=\\\"Control recursivo WAN${i}\\\"] disabled=yes\\n}"\n`;
            }
        }
    
        return code;
    }

    window.MTB.register(definition, generate);
})();
