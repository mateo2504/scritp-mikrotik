// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'hotspot',
    title: "Hotspot WiFi (Portal Cautivo)",
    description: "Crea un portal cautivo para invitados con autenticación por usuario y contraseña, perfiles de velocidad, timeouts y NAT automático.",
    fileName: "mikrotik_hotspot.rsc",
    inputs: [
        { id: "hotspot_interface", label: "Interfaz del Hotspot", type: "text", default: "bridge-hotspot", hint: "Bridge o interfaz dedicada al hotspot" },
        { id: "hotspot_address", label: "IP del Router en Hotspot (CIDR)", type: "text", default: "10.5.50.1/24" },
        { id: "hotspot_network", label: "Red Hotspot (CIDR)", type: "text", default: "10.5.50.0/24" },
        { id: "pool_start", label: "Inicio Pool IPs Clientes", type: "text", default: "10.5.50.2" },
        { id: "pool_end", label: "Fin Pool IPs Clientes", type: "text", default: "10.5.50.254" },
        { id: "dns_servers", label: "Servidores DNS", type: "text", default: "1.1.1.1,8.8.8.8" },
        { id: "dns_name", label: "DNS Name del Portal", type: "text", default: "login.local", hint: "Dominio que verá el cliente en el portal" },
        { id: "hotspot_name", label: "Nombre del Hotspot", type: "text", default: "hotspot-guest" },
        { id: "rate_limit", label: "Límite de Velocidad por Cliente (subida/bajada)", type: "text", default: "2M/5M", hint: "Ej: 2M/5M. Vacío = sin límite" },
        { id: "session_timeout", label: "Session Timeout", type: "text", default: "1h", hint: "Tiempo total de la sesión" },
        { id: "idle_timeout", label: "Idle Timeout", type: "text", default: "5m", hint: "Inactividad antes de desconexión" },
        { id: "admin_user", label: "Usuario de Prueba", type: "text", default: "invitado" },
        { id: "admin_pass", label: "Contraseña de Prueba", type: "text", default: "wifi123" }
    ]
};

    function generate(inputs, version) {
        const network = inputs.hotspot_network || "10.5.50.0/24";
        const netmaskBits = (network.split('/')[1]) || "24";
        const addressOnly = (inputs.hotspot_address || "10.5.50.1/24").split('/')[0];
    
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Hotspot WiFi con Portal Cautivo\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# NOTA: La interfaz '${inputs.hotspot_interface}' debe existir previamente.\n`;
        code += `# ====================================================\n\n`;
    
        code += `# 1. Asignar IP del router en la red del hotspot\n`;
        code += `/ip address\n`;
        code += `add address=${inputs.hotspot_address} interface=${inputs.hotspot_interface} comment="Hotspot Gateway"\n\n`;
    
        code += `# 2. Pool de IPs que se entregarán a los clientes\n`;
        code += `/ip pool\n`;
        code += `add name=hs-pool-${inputs.hotspot_name} ranges=${inputs.pool_start}-${inputs.pool_end}\n\n`;
    
        code += `# 3. DHCP server dentro de la red del hotspot\n`;
        code += `/ip dhcp-server\n`;
        code += `add name=dhcp-${inputs.hotspot_name} interface=${inputs.hotspot_interface} address-pool=hs-pool-${inputs.hotspot_name} lease-time=${inputs.session_timeout} disabled=no\n`;
        code += `/ip dhcp-server network\n`;
        code += `add address=${network} gateway=${addressOnly} dns-server=${inputs.dns_servers} netmask=${netmaskBits} comment="Hotspot DHCP"\n\n`;
    
        code += `# 4. Perfil del Hotspot (configuración global del portal)\n`;
        code += `/ip hotspot profile\n`;
        code += `add name=hsprof-${inputs.hotspot_name} hotspot-address=${addressOnly} dns-name=${inputs.dns_name} html-directory=hotspot login-by=http-chap,http-pap use-radius=no\n\n`;
    
        code += `# 5. Perfil de usuario (velocidad, timeouts)\n`;
        code += `/ip hotspot user profile\n`;
        const rateLimitPart = inputs.rate_limit && inputs.rate_limit.trim() ? `rate-limit=${inputs.rate_limit} ` : '';
        code += `add name=uprof-${inputs.hotspot_name} ${rateLimitPart}session-timeout=${inputs.session_timeout} idle-timeout=${inputs.idle_timeout} shared-users=1\n\n`;
    
        code += `# 6. Activar el Hotspot sobre la interfaz\n`;
        code += `/ip hotspot\n`;
        code += `add name=${inputs.hotspot_name} interface=${inputs.hotspot_interface} address-pool=hs-pool-${inputs.hotspot_name} profile=hsprof-${inputs.hotspot_name} addresses-per-mac=1 disabled=no\n\n`;
    
        code += `# 7. Crear usuario de prueba\n`;
        code += `/ip hotspot user\n`;
        code += `add name="${inputs.admin_user}" password="${inputs.admin_pass}" profile=uprof-${inputs.hotspot_name} comment="Usuario inicial"\n\n`;
    
        code += `# 8. NAT para que los clientes salgan a Internet\n`;
        code += `/ip firewall nat\n`;
        code += `add chain=srcnat src-address=${network} action=masquerade comment="Masquerade Hotspot ${inputs.hotspot_name}"\n\n`;
    
        code += `# 9. DNS estático para que el dns-name resuelva al router\n`;
        code += `/ip dns static\n`;
        code += `add name=${inputs.dns_name} address=${addressOnly} comment="Hotspot portal redirect"\n`;
    
        return code;
    }

    window.MTB.register(definition, generate);
})();
