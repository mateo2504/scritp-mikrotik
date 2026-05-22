// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'pppoe',
    title: "Servidor Concentrador PPPoE",
    description: "Permite autenticar dispositivos clientes a través de un túnel PPPoE con credenciales estáticas.",
    fileName: "mikrotik_pppoe_server.rsc",
    inputs: [
        { id: "pppoe_interface", label: "Interfaz del Servidor", type: "text", default: "bridge-lan", hint: "Puerto local donde escuchará PPPoE" },
        { id: "service_name", label: "Nombre de Servicio PPPoE", type: "text", default: "PPPoE-Server" },
        { id: "pool_name", label: "Nombre del Pool de IPs", type: "text", default: "pppoe-pool" },
        { id: "pool_range", label: "Rango de IPs a entregar", type: "text", default: "192.168.100.10-192.168.100.100" },
        { id: "local_ip", label: "IP del Router (Local Address)", type: "text", default: "192.168.100.1" },
        { id: "dns_servers", label: "Servidores DNS para PPPoE", type: "text", default: "8.8.8.8,1.1.1.1" },
        { id: "profile_name", label: "Nombre del Perfil PPP", type: "text", default: "pppoe-profile" },
        { id: "user_secret", label: "Usuario de Prueba", type: "text", default: "cliente1" },
        { id: "pass_secret", label: "Contraseña", type: "text", default: "contrasena123" }
    ]
};

    function generate(inputs, version) {
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Servidor Concentrador PPPoE\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;
    
        code += `# 1. Crear Pool de direcciones IP para la asignación de clientes\n`;
        code += `/ip pool\n`;
        code += `add name=${inputs.pool_name} ranges=${inputs.pool_range}\n\n`;
    
        code += `# 2. Configurar perfil PPP de navegación\n`;
        code += `/ppp profile\n`;
        code += `add name=${inputs.profile_name} local-address=${inputs.local_ip} remote-address=${inputs.pool_name} dns-server=${inputs.dns_servers} comment="Perfil Clientes PPPoE"\n\n`;
    
        code += `# 3. Activar el servicio PPPoE Server en la interfaz designada (LAN)\n`;
        code += `/interface pppoe-server server\n`;
        code += `add service-name=${inputs.service_name} interface=${inputs.pppoe_interface} max-mtu=1492 max-mru=1492 default-profile=${inputs.profile_name} one-session-per-host=yes disabled=no\n\n`;
    
        code += `# 4. Agregar cuenta de cliente (Secrets / Usuario y Contraseña)\n`;
        code += `/ppp secret\n`;
        code += `add name="${inputs.user_secret}" password="${inputs.pass_secret}" profile=${inputs.profile_name} service=pppoe comment="Cliente Inicial"\n`;
    
        return code;
    }

    window.MTB.register(definition, generate);
})();
