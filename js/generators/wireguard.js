// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'wireguard',
    title: "Servidor VPN WireGuard (ROS v7+)",
    description: "Protocolo VPN moderno y de alta velocidad. Nota: Solo disponible a partir de RouterOS v7.",
    fileName: "mikrotik_wireguard.rsc",
    isV7Only: true,
    inputs: [
        { id: "wg_interface", label: "Interfaz WireGuard", type: "text", default: "wg0" },
        { id: "wg_port", label: "Puerto de Escucha UDP", type: "text", default: "13231", hint: "Puerto externo del túnel" },
        { id: "server_ip", label: "IP Local VPN (Router)", type: "text", default: "10.0.0.1/24", hint: "Dirección de red interna de la VPN" },
        { id: "client_name", label: "Nombre de Cliente", type: "text", default: "Celular-Admin" },
        { id: "client_ip", label: "IP Asignada al Cliente", type: "text", default: "10.0.0.2", hint: "IP fija en la subred de la VPN" },
        { id: "client_public_key", label: "Clave Pública del Cliente (Opcional)", type: "text", default: "", hint: "Clave pública generada por el celular/PC" }
    ]
};

    function generate(inputs, version) {
        if (version === 'v6') {
            return `# ====================================================\n# ERROR: WIREGUARD NO DISPONIBLE EN RouterOS v6\n# ====================================================\n# WireGuard es un protocolo VPN nativo a partir de RouterOS v7.\n# Por favor, cambia el selector de RouterOS arriba a la derecha a 'v7' para generar el script.`;
        }
        
        const clientPub = inputs.client_public_key.trim() || "<CLAVE_PUBLICA_DEL_CLIENTE_AQUÍ>";
        
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Servidor VPN WireGuard (Solo RouterOS v7+)\n`;
        code += `# RouterOS Version: v7\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;
    
        code += `# 1. Crear la interfaz WireGuard en el Router (Genera llaves automáticas en el router)\n`;
        code += `/interface wireguard\n`;
        code += `add name=${inputs.wg_interface} listen-port=${inputs.wg_port} comment="Servidor VPN Principal Wireguard"\n\n`;
    
        code += `# 2. Asignar IP al Router dentro del túnel VPN\n`;
        code += `/ip address\n`;
        code += `add address=${inputs.server_ip} interface=${inputs.wg_interface} comment="Red IP del Tunel VPN"\n\n`;
    
        code += `# 3. Registrar al cliente (Peer) en el router\n`;
        code += `/interface wireguard peers\n`;
        code += `add interface=${inputs.wg_interface} public-key="${clientPub}" allowed-address=${inputs.client_ip}/32 comment="${inputs.client_name}"\n\n`;
    
        code += `# 4. Permitir el tráfico en el Firewall\n`;
        code += `/ip firewall filter\n`;
        code += `add chain=input action=accept protocol=udp dst-port=${inputs.wg_port} comment="Permitir conexion de entrada Wireguard"\n`;
        code += `add chain=forward action=accept in-interface=${inputs.wg_interface} comment="Permitir navegacion interna de clientes VPN"\n\n`;
    
        code += `# ====================================================\n`;
        code += `# CONFIGURACIÓN SUGERIDA PARA EL DISPOSITIVO CLIENTE (${inputs.client_name})\n`;
        code += `# Importa esto en la App cliente (iOS/Android/Windows/macOS)\n`;
        code += `# ====================================================\n`;
        code += `# [Interface]\n`;
        code += `# PrivateKey = <CLAVE_PRIVADA_DEL_CLIENTE_CELULAR_O_PC>\n`;
        code += `# Address = ${inputs.client_ip}/24\n`;
        code += `# DNS = 1.1.1.1, 8.8.8.8\n`;
        code += `# \n`;
        code += `# [Peer]\n`;
        code += `# PublicKey = <CLAVE_PUBLICA_QUE_GENERO_EL_ROUTER_MIKROTIK_EN_WG0>\n`;
        code += `# Endpoint = tu_ip_publica_o_ddns.net:${inputs.wg_port}\n`;
        code += `# AllowedIPs = 0.0.0.0/0 (Toda la navegación cifrada) o 10.0.0.0/24 (Solo tráfico al router)\n`;
        code += `# ====================================================\n`;
    
        return code;
    }

    window.MTB.register(definition, generate);
})();
