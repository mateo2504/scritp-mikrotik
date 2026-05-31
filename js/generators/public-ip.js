// Public IP Assignment (Server and Client sides)
(function () {
    const definition = {
        key: 'public-ip',
        title: "Asignación de IPs Públicas",
        description: "Genera los scripts de configuración para asignar direcciones IP públicas a clientes, tanto del lado del servidor (proveedor) como del cliente (NAT 1:1, ruteo /30, o túnel PPPoE).",
        fileName: "asignacion_ip_publica.rsc",
        inputs: [
            { id: "method", label: "Método de Asignación", type: "select", default: "nat11", options: [
                { value: "nat11", label: "NAT 1:1 (Mapeo IP Pública -> IP Privada)" },
                { value: "routed", label: "Ruteo de Subred / Bloque P2P (ej. /30)" },
                { value: "pppoe", label: "Entrega mediante Túnel PPPoE (IP Estática)" }
            ] },
            { id: "client_name", label: "Nombre del Cliente", type: "text", default: "Cliente-VIP-1", hint: "Identificador para los comentarios en las reglas" },
            { id: "public_ip", label: "Dirección IP Pública", type: "text", default: "200.50.100.10", hint: "La IP pública dedicada asignada al cliente" },
            
            // Campos específicos para NAT 1:1
            { id: "client_private_ip", label: "IP Privada del Cliente", type: "text", default: "192.168.88.50", hint: "La dirección IP local del equipo o router del cliente" },
            { id: "server_wan", label: "Interfaz WAN del Servidor", type: "text", default: "ether1", hint: "Interfaz de salida a Internet del Servidor / ISP" },
            
            // Campos específicos para Ruteo
            { id: "subnet_mask", label: "Máscara / Prefijo de Red", type: "text", default: "/30", hint: "Prefijo del bloque (ej: /30 para punto a punto, /29, /32)" },
            { id: "gateway_ip", label: "IP Gateway del Servidor", type: "text", default: "200.50.100.9", hint: "Dirección IP del servidor en el segmento de red pública" },
            
            // Campos específicos para PPPoE
            { id: "pppoe_user", label: "Usuario PPPoE", type: "text", default: "cliente_vip1", hint: "Usuario para la autenticación PPP" },
            { id: "pppoe_pass", label: "Contraseña PPPoE", type: "text", default: "P@ssw0rdV1p", hint: "Clave de acceso para la sesión PPP" },
            { id: "pppoe_service", label: "Servicio PPPoE (Opcional)", type: "text", default: "pppoe-service", hint: "Nombre del servicio configurado en el servidor PPPoE" }
        ]
    };

    function generate(inputs, version) {
        const method = inputs.method || 'nat11';
        const clientName = inputs.client_name || 'Cliente-VIP-1';
        const publicIp = inputs.public_ip || '200.50.100.10';
        
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Asignación de IP Pública (${method === 'nat11' ? 'NAT 1:1' : method === 'routed' ? 'Ruteo de Subred' : 'PPPoE tunnel'})\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;

        if (method === 'nat11') {
            const privateIp = inputs.client_private_ip || '192.168.88.50';
            const serverWan = inputs.server_wan || 'ether1';

            code += `# ----------------------------------------------------\n`;
            code += `# CONFIGURACIÓN DEL SERVIDOR (PROVEEDOR)\n`;
            code += `# ----------------------------------------------------\n`;
            code += `# 1. Agregar la IP pública a la interfaz WAN física del Servidor\n`;
            code += `/ip address\n`;
            code += `add address=${publicIp}/32 interface=${serverWan} comment="IP Publica dedicada para ${clientName}"\n\n`;

            code += `# 2. Regla DST-NAT: Redirige todo el tráfico que entra a la IP pública hacia la IP privada del cliente\n`;
            code += `/ip firewall nat\n`;
            code += `add chain=dst-nat dst-address=${publicIp} action=dst-nat to-addresses=${privateIp} \\\n`;
            code += `    comment="NAT 1:1 ${clientName} - Trafico Entrante"\n\n`;

            code += `# 3. Regla SRC-NAT: Mapea la IP privada del cliente para que navegue con su IP pública dedicada\n`;
            code += `# ATENCIÓN: Esta regla debe estar antes/arriba de la regla general de masquerade LAN de tu Servidor.\n`;
            code += `add chain=src-nat src-address=${privateIp} action=src-nat to-addresses=${publicIp} \\\n`;
            code += `    comment="NAT 1:1 ${clientName} - Trafico Saliente"\n\n`;

            code += `# ----------------------------------------------------\n`;
            code += `# CONFIGURACIÓN DEL CLIENTE\n`;
            code += `# ----------------------------------------------------\n`;
            code += `# El cliente no requiere configurar la IP pública en su equipo.\n`;
            code += `# Solo debe configurar en su WAN la dirección IP privada asignada:\n`;
            code += `#   Direccion IP: ${privateIp}\n`;
            code += `#   Mascara de Red: La de tu red local (ej: /24)\n`;
            code += `#   Gateway/Puerta de Enlace: La IP LAN del Servidor\n`;
        } 
        else if (method === 'routed') {
            const mask = inputs.subnet_mask || '/30';
            const gatewayIp = inputs.gateway_ip || '200.50.100.9';

            code += `# ----------------------------------------------------\n`;
            code += `# CONFIGURACIÓN DEL SERVIDOR (PROVEEDOR)\n`;
            code += `# ----------------------------------------------------\n`;
            code += `# 1. Asignar la IP del extremo del servidor en la interfaz del cliente\n`;
            code += `/ip address\n`;
            code += `add address=${gatewayIp}${mask} interface=${inputs.server_wan || 'ether1'} comment="IP Gateway P2P para ${clientName}"\n\n`;

            code += `# Nota: Si estás ruteando un bloque adicional de IPs públicas (ej: un /29) usando una IP de transporte:\n`;
            code += `# /ip route add dst-address=${publicIp}${mask} gateway=[IP_Transporte_Cliente] comment="Ruta bloque publico a ${clientName}"\n\n`;

            code += `# ----------------------------------------------------\n`;
            code += `# CONFIGURACIÓN DEL CLIENTE\n`;
            code += `# ----------------------------------------------------\n`;
            code += `# 1. Asignar la IP pública dedicada en la interfaz WAN física del cliente\n`;
            code += `/ip address\n`;
            code += `add address=${publicIp}${mask} interface=ether1 comment="WAN IP Publica Dedicada"\n\n`;

            code += `# 2. Configurar la ruta por defecto apuntando a la IP Gateway del Servidor\n`;
            code += `/ip route\n`;
            if (version === 'v7') {
                code += `add dst-address=0.0.0.0/0 gateway=${gatewayIp} comment="Ruta por defecto al Servidor ISP"\n`;
            } else {
                code += `add gateway=${gatewayIp} comment="Ruta por defecto al Servidor ISP"\n`;
            }
        } 
        else if (method === 'pppoe') {
            const user = inputs.pppoe_user || 'cliente_vip1';
            const pass = inputs.pppoe_pass || 'P@ssw0rdV1p';
            const service = inputs.pppoe_service || 'pppoe-service';

            code += `# ----------------------------------------------------\n`;
            code += `# CONFIGURACIÓN DEL SERVIDOR (PROVEEDOR)\n`;
            code += `# ----------------------------------------------------\n`;
            code += `# Crear el usuario PPPoE Secret asociando de manera fija la IP pública en remote-address\n`;
            code += `# NOTA: local-address puede ser una IP local/enlace del servidor (ej. 10.0.0.1)\n`;
            code += `/ppp secret\n`;
            code += `add name="${user}" password="${pass}" service=pppoe local-address=10.0.0.1 remote-address=${publicIp} \\\n`;
            code += `    comment="PPPoE IP Publica Estatica para ${clientName}"\n\n`;

            code += `# ----------------------------------------------------\n`;
            code += `# CONFIGURACIÓN DEL CLIENTE\n`;
            code += `# ----------------------------------------------------\n`;
            code += `# Crear la interfaz PPPoE-Client en la interfaz WAN física conectada al Servidor\n`;
            code += `/interface pppoe-client\n`;
            code += `add name="pppoe-out1" interface=ether1 user="${user}" password="${pass}" \\\n`;
            code += `    service-name="${service}" use-peer-dns=yes add-default-route=yes disabled=no \\\n`;
            code += `    comment="Conexion WAN PPPoE con IP Publica Estatica"\n`;
        }

        return code;
    }

    window.MTB.register(definition, generate);
})();
