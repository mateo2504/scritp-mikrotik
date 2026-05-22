// EoIP / GRE Tunnel con IPsec opcional. Auto-registra vía window.MTB.
(function () {
    const definition = {
        key: 'eoip-tunnel',
        title: "Túnel EoIP / GRE (Site-to-Site)",
        description: "Túnel para unir dos routers MikroTik. EoIP extiende la LAN a nivel 2 (mismo broadcast domain). GRE es de capa 3 (subredes separadas, ruteo). Cifrado IPsec opcional.",
        fileName: "mikrotik_eoip_gre_tunnel.rsc",
        inputs: [
            {
                id: "tunnel_type",
                label: "Tipo de Túnel",
                type: "select",
                options: [
                    { value: "eoip", label: "EoIP (Capa 2 - mismo broadcast domain)" },
                    { value: "gre", label: "GRE (Capa 3 - subredes separadas)" }
                ],
                default: "eoip",
                hint: "EoIP = MikroTik propietario. GRE = estándar IETF."
            },
            { id: "tunnel_name", label: "Nombre del Túnel", type: "text", default: "tunnel-to-siteB" },
            { id: "remote_public_ip", label: "IP Pública del Router Remoto", type: "text", default: "203.0.113.50" },
            { id: "tunnel_id", label: "Tunnel ID (solo EoIP)", type: "text", default: "1", hint: "Debe ser idéntico en ambos extremos (1-65535)" },
            { id: "bridge_name", label: "Bridge donde añadir el EoIP (solo EoIP)", type: "text", default: "bridge-lan", hint: "El túnel se agrega como puerto del bridge para extender la LAN" },
            { id: "local_tunnel_ip", label: "IP Túnel Local (solo GRE)", type: "text", default: "10.99.99.1/30", hint: "Red /30 dedicada al túnel GRE" },
            { id: "remote_tunnel_ip", label: "IP Túnel Remota (solo GRE)", type: "text", default: "10.99.99.2", hint: "Gateway hacia el sitio remoto" },
            { id: "remote_lan_network", label: "Red LAN Remota (solo GRE)", type: "text", default: "192.168.20.0/24", hint: "Subred del sitio remoto a la que hay que rutear" },
            { id: "use_ipsec", label: "Cifrar con IPsec (Recomendado en Internet)", type: "checkbox", default: true },
            { id: "ipsec_secret", label: "Clave Pre-Compartida IPsec", type: "text", default: "TunnelIPsecKey_2024", hint: "Solo se usa si se activa el cifrado" }
        ]
    };

    function generate(inputs, version) {
        const type = inputs.tunnel_type || 'eoip';
        const name = inputs.tunnel_name || 'tunnel-to-siteB';

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Túnel ${type.toUpperCase()} ${inputs.use_ipsec ? '+ IPsec' : '(sin cifrar)'}\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Remote peer: ${inputs.remote_public_ip}\n`;
        code += `# ====================================================\n\n`;

        if (type === 'eoip') {
            code += `# 1. Crear el túnel EoIP (Layer 2)\n`;
            code += `# IMPORTANTE: tunnel-id DEBE ser idéntico en ambos extremos.\n`;
            code += `/interface eoip\n`;
            const ipsecPart = inputs.use_ipsec ? ` ipsec-secret="${inputs.ipsec_secret}" allow-fast-path=no` : '';
            code += `add name=${name} remote-address=${inputs.remote_public_ip} tunnel-id=${inputs.tunnel_id}${ipsecPart} comment="EoIP a ${inputs.remote_public_ip}"\n\n`;

            code += `# 2. Agregar el túnel al bridge LAN (extiende la red local al sitio remoto)\n`;
            code += `# ADVERTENCIA: el sitio remoto verá broadcast/DHCP/ARP de esta LAN. NO bridgear si\n`;
            code += `# ya hay un DHCP server activo en el otro extremo (causa conflicto de IPs).\n`;
            code += `/interface bridge port\n`;
            code += `add bridge=${inputs.bridge_name} interface=${name} comment="EoIP extension"\n\n`;

            code += `# 3. Firewall: aceptar protocolo GRE (EoIP corre sobre GRE)\n`;
            code += `/ip firewall filter\n`;
            code += `add chain=input action=accept protocol=gre src-address=${inputs.remote_public_ip} comment="EoIP/GRE - ${name}" place-before=0\n`;

        } else {
            code += `# 1. Crear el túnel GRE (Layer 3, subredes separadas)\n`;
            code += `/interface gre\n`;
            const ipsecPart = inputs.use_ipsec ? ` ipsec-secret="${inputs.ipsec_secret}" allow-fast-path=no` : '';
            code += `add name=${name} remote-address=${inputs.remote_public_ip} keepalive=10s,3${ipsecPart} comment="GRE a ${inputs.remote_public_ip}"\n\n`;

            code += `# 2. Asignar IP a la interfaz GRE (red /30 dedicada al túnel)\n`;
            code += `/ip address\n`;
            code += `add address=${inputs.local_tunnel_ip} interface=${name} comment="GRE local IP"\n\n`;

            code += `# 3. Ruta hacia la LAN remota a través del túnel\n`;
            code += `/ip route\n`;
            code += `add dst-address=${inputs.remote_lan_network} gateway=${inputs.remote_tunnel_ip} comment="LAN remota vía ${name}"\n\n`;

            code += `# 4. Firewall: aceptar GRE y el tráfico forward de las LANs\n`;
            code += `/ip firewall filter\n`;
            code += `add chain=input action=accept protocol=gre src-address=${inputs.remote_public_ip} comment="GRE - ${name}" place-before=0\n`;
            code += `add chain=forward action=accept in-interface=${name} comment="Forward IN ${name}"\n`;
            code += `add chain=forward action=accept out-interface=${name} comment="Forward OUT ${name}"\n\n`;

            code += `# 5. NAT: NO enmascarar tráfico que va por el túnel\n`;
            code += `/ip firewall nat\n`;
            code += `add chain=srcnat action=accept dst-address=${inputs.remote_lan_network} comment="No NAT a LAN remota ${name}" place-before=0\n`;
        }
        code += `\n`;

        if (inputs.use_ipsec) {
            code += `# CIFRADO IPSEC: RouterOS configura automáticamente los peers/proposals\n`;
            code += `# cuando defines ipsec-secret en el túnel. Verifica con:\n`;
            code += `#   /ip ipsec active-peers print\n`;
            code += `#   /ip ipsec installed-sa print\n\n`;
        }

        code += `# ====================================================\n`;
        code += `# CONFIGURACIÓN DEL OTRO EXTREMO\n`;
        code += `# Aplica este mismo script invertido:\n`;
        code += `#   - remote-address = IP_PUBLICA_DE_ESTE_ROUTER\n`;
        if (type === 'eoip') {
            code += `#   - MISMO tunnel-id (${inputs.tunnel_id})\n`;
            code += `#   - bridge LAN de su lado\n`;
        } else {
            code += `#   - local_tunnel_ip = ${inputs.remote_tunnel_ip}/30 (invertido)\n`;
            code += `#   - remote_tunnel_ip = ${inputs.local_tunnel_ip.split('/')[0]}\n`;
            code += `#   - remote_lan_network = LA RED LOCAL DE ESTE SITIO\n`;
        }
        if (inputs.use_ipsec) {
            code += `#   - MISMO ipsec-secret\n`;
        }
        code += `# ====================================================\n\n`;

        code += `# VERIFICAR:\n`;
        code += `#   /interface ${type} print stats           (running=yes, paquetes RX/TX)\n`;
        code += `#   /ping <IP_REMOTA_DEL_TUNEL>              (debe responder)\n`;
        if (type === 'eoip') {
            code += `#   /interface bridge host print            (deben aparecer MACs del sitio remoto)\n`;
        } else {
            code += `#   /ping desde un cliente LAN a ${inputs.remote_lan_network.split('/')[0].replace(/(\d+)$/, '1')} (LAN remota)\n`;
        }

        return code;
    }

    window.MTB.register(definition, generate);
})();
