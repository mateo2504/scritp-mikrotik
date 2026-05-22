// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'hairpin-nat',
    title: "Hairpin NAT (NAT Loopback)",
    description: "Permite acceder a servicios internos (DST-NAT) desde la propia LAN usando la IP pública. Soluciona el problema clásico de 'no puedo acceder a mi servidor desde adentro'.",
    fileName: "mikrotik_hairpin_nat.rsc",
    inputs: [
        { id: "lan_network", label: "Red LAN Origen (CIDR)", type: "text", default: "192.168.88.0/24", hint: "Subred desde donde provienen los clientes" },
        { id: "internal_ip", label: "IP del Servidor Interno", type: "text", default: "192.168.88.10" },
        { id: "internal_port", label: "Puerto del Servidor Interno", type: "text", default: "80" },
        {
            id: "protocol",
            label: "Protocolo",
            type: "select",
            options: [
                { value: "tcp", label: "TCP" },
                { value: "udp", label: "UDP" }
            ],
            default: "tcp"
        },
        { id: "include_dstnat", label: "Incluir Regla DST-NAT (Port Forward)", type: "checkbox", default: true, hint: "Desactívalo si ya tienes el port forward configurado" },
        { id: "wan_interface", label: "Interfaz WAN (si incluyes DST-NAT)", type: "text", default: "ether1" },
        { id: "external_port", label: "Puerto Público Externo", type: "text", default: "80" },
        { id: "comment", label: "Comentario", type: "text", default: "Web Server Hairpin" }
    ]
};

    function generate(inputs, version) {
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Hairpin NAT (NAT Loopback)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Permite acceder al servidor interno usando la IP publica desde la propia LAN\n`;
        code += `# ====================================================\n\n`;
    
        code += `/ip firewall nat\n`;
    
        if (inputs.include_dstnat) {
            code += `# 1. DST-NAT: redirecciona el puerto publico al servidor interno (Port Forward)\n`;
            code += `add chain=dstnat protocol=${inputs.protocol} in-interface=${inputs.wan_interface} dst-port=${inputs.external_port} action=dst-nat to-addresses=${inputs.internal_ip} to-ports=${inputs.internal_port} comment="${inputs.comment} - DSTNAT"\n\n`;
        }
    
        code += `# 2. SRC-NAT (Hairpin): masquerade del tráfico LAN -> Servidor Interno\n`;
        code += `# Sin esta regla, el servidor responde directo al cliente LAN y este descarta el paquete.\n`;
        code += `add chain=srcnat src-address=${inputs.lan_network} dst-address=${inputs.internal_ip} protocol=${inputs.protocol} dst-port=${inputs.internal_port} action=masquerade comment="${inputs.comment} - Hairpin"\n\n`;
    
        code += `# RECOMENDACIÓN: Si tienes muchos servidores con port forward, usa esta regla universal en lugar de una por cada uno:\n`;
        code += `# add chain=srcnat src-address=${inputs.lan_network} dst-address=${inputs.lan_network} action=masquerade comment="Hairpin universal LAN-LAN via port forward"\n`;
    
        return code;
    }

    window.MTB.register(definition, generate);
})();
