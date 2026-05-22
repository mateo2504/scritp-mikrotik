// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'dhcp',
    title: "Servidor DHCP + Reservas Estáticas",
    description: "Configura un servidor DHCP completo: pool, network, gateway, DNS y bindings MAC→IP para asignar IPs fijas a dispositivos por su dirección MAC.",
    fileName: "mikrotik_dhcp.rsc",
    inputs: [
        { id: "dhcp_interface", label: "Interfaz LAN/Bridge", type: "text", default: "bridge-lan", hint: "Interfaz donde escuchará el DHCP server" },
        { id: "dhcp_network", label: "Red LAN (CIDR)", type: "text", default: "192.168.88.0/24" },
        { id: "dhcp_gateway", label: "Gateway de la red", type: "text", default: "192.168.88.1", hint: "IP del router en la LAN" },
        { id: "pool_start", label: "Inicio del Pool", type: "text", default: "192.168.88.10" },
        { id: "pool_end", label: "Fin del Pool", type: "text", default: "192.168.88.254" },
        { id: "dns_servers", label: "Servidores DNS", type: "text", default: "192.168.88.1,1.1.1.1", hint: "Separados por coma. Usa la IP del router para usar su DNS cache" },
        { id: "lease_time", label: "Tiempo de Lease", type: "text", default: "1d", hint: "Ej: 10m, 1h, 1d, 1w" },
        { id: "pool_name", label: "Nombre del Pool", type: "text", default: "dhcp-pool" },
        { id: "server_name", label: "Nombre del Servidor DHCP", type: "text", default: "dhcp1" },
        { id: "static_leases", label: "Reservas Estáticas (MAC|IP|Comentario por línea)", type: "textarea", default: "AA:BB:CC:11:22:33|192.168.88.50|Servidor NAS\nAA:BB:CC:44:55:66|192.168.88.51|Impresora", hint: "Una por línea. Deja vacío si no quieres reservas." }
    ]
};

    function generate(inputs, version) {
        const network = inputs.dhcp_network || "192.168.88.0/24";
        const netParts = network.split('/');
        const netmaskBits = netParts[1] || "24";
    
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Servidor DHCP + Reservas Estáticas\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;
    
        code += `# 1. Pool de direcciones para entregar a los clientes\n`;
        code += `/ip pool\n`;
        code += `add name=${inputs.pool_name} ranges=${inputs.pool_start}-${inputs.pool_end}\n\n`;
    
        code += `# 2. Servidor DHCP escuchando en la interfaz LAN\n`;
        code += `/ip dhcp-server\n`;
        code += `add name=${inputs.server_name} interface=${inputs.dhcp_interface} address-pool=${inputs.pool_name} lease-time=${inputs.lease_time} disabled=no\n\n`;
    
        code += `# 3. Parámetros que se entregan al cliente (gateway, DNS, máscara)\n`;
        code += `/ip dhcp-server network\n`;
        code += `add address=${network} gateway=${inputs.dhcp_gateway} dns-server=${inputs.dns_servers} netmask=${netmaskBits} comment="LAN DHCP Network"\n\n`;
    
        const staticLeases = (inputs.static_leases || "").split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (staticLeases.length > 0) {
            code += `# 4. Reservas estáticas (binding MAC -> IP). El dispositivo siempre recibirá la misma IP.\n`;
            code += `/ip dhcp-server lease\n`;
            staticLeases.forEach(line => {
                const parts = line.split('|').map(p => p.trim());
                if (parts.length >= 2) {
                    const mac = parts[0];
                    const ip = parts[1];
                    const comment = parts[2] || "Reserva";
                    code += `add address=${ip} mac-address=${mac} server=${inputs.server_name} comment="${comment}"\n`;
                }
            });
            code += `\n`;
        }
    
        code += `# NOTA: Asegúrate de tener IP asignada a la interfaz ${inputs.dhcp_interface}:\n`;
        code += `# /ip address add interface=${inputs.dhcp_interface} address=${inputs.dhcp_gateway}/${netmaskBits}\n`;
    
        return code;
    }

    window.MTB.register(definition, generate);
})();
