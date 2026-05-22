// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'port-forward',
    title: "Redirección de Puertos (DST-NAT)",
    description: "Abre y redirige un puerto externo de la WAN hacia un servidor interno en la LAN.",
    fileName: "mikrotik_port_forward.rsc",
    inputs: [
        { id: "wan_interface", label: "Interfaz WAN de Entrada", type: "text", default: "ether1" },
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
        { id: "dst_port", label: "Puerto Externo", type: "text", default: "80", hint: "Puerto visible desde Internet" },
        { id: "to_address", label: "IP Servidor Interno", type: "text", default: "192.168.88.10" },
        { id: "to_port", label: "Puerto Interno", type: "text", default: "80", hint: "Puerto local en el servidor" },
        { id: "comment", label: "Comentario", type: "text", default: "Web Server" }
    ]
};

    function generate(inputs, version) {
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Redirección de Puertos (DST-NAT)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;
    
        code += `/ip firewall nat\n`;
        code += `add chain=dstnat action=dst-nat to-addresses=${inputs.to_address} to-ports=${inputs.to_port} protocol=${inputs.protocol} in-interface=${inputs.wan_interface} dst-port=${inputs.dst_port} comment="${inputs.comment}"\n\n`;
        
        code += `# NOTA: Asegúrate de tener una regla en '/ip firewall filter' que permita reenviar tráfico NAT en forward:\n`;
        code += `# /ip firewall filter add chain=forward action=accept connection-nat-state=dstnat comment="Permitir trafico redireccionado"\n`;
        
        return code;
    }

    window.MTB.register(definition, generate);
})();
