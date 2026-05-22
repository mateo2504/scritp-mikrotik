// WireGuard Client (router se conecta a un VPN comercial). Auto-registra vía window.MTB.
(function () {
    const definition = {
        key: 'wireguard-client',
        title: "WireGuard Client (a VPN externo)",
        description: "Conecta el router como cliente WireGuard a un VPN comercial (Mullvad, ProtonVPN, IVPN, etc.) y enruta el tráfico de la LAN a través del túnel.",
        fileName: "mikrotik_wireguard_client.rsc",
        isV7Only: true,
        inputs: [
            { id: "wg_interface", label: "Nombre de la Interfaz", type: "text", default: "wg-client", hint: "Interfaz local que representa el túnel" },
            { id: "listen_port", label: "Puerto UDP Local (Listen)", type: "text", default: "51820" },
            { id: "private_key", label: "Clave Privada Local", type: "text", default: "<PEGA_AQUI_TU_CLAVE_PRIVADA>", hint: "La que generaste en el portal del proveedor o con 'wg genkey'" },
            { id: "local_address", label: "IP Asignada al Router (CIDR)", type: "text", default: "10.66.66.2/32", hint: "Te la asigna el proveedor (Mullvad ej: 10.66.66.x/32)" },
            { id: "dns_server", label: "Servidor DNS del Túnel", type: "text", default: "10.64.0.1", hint: "Mullvad: 10.64.0.1 | ProtonVPN: 10.2.0.1 | IVPN: 172.16.0.1" },
            { id: "peer_public_key", label: "Clave Pública del Servidor", type: "text", default: "<PEGA_AQUI_LA_PUBLIC_KEY_DEL_SERVIDOR>" },
            { id: "endpoint_address", label: "Endpoint (Hostname/IP del Servidor)", type: "text", default: "vpn.provider.example", hint: "Ej: madrid-wg.mullvad.net" },
            { id: "endpoint_port", label: "Puerto UDP del Servidor", type: "text", default: "51820" },
            { id: "allowed_address", label: "AllowedIPs (qué tráfico viaja por el túnel)", type: "text", default: "0.0.0.0/0,::/0", hint: "0.0.0.0/0 = TODO el tráfico. Lista específica para split-tunnel." },
            { id: "keepalive", label: "Persistent Keepalive", type: "text", default: "25", hint: "Segundos. Necesario si el router está detrás de NAT." },
            {
                id: "route_mode",
                label: "Modo de Enrutamiento de la LAN",
                type: "select",
                options: [
                    { value: "all-lan", label: "Toda la LAN sale por el VPN" },
                    { value: "selective", label: "Solo clientes en address-list 'via-vpn'" },
                    { value: "router-only", label: "Solo el router (no la LAN)" }
                ],
                default: "all-lan"
            },
            { id: "lan_network", label: "Red LAN", type: "text", default: "192.168.88.0/24", hint: "Para 'all-lan' o 'selective'" }
        ]
    };

    function generate(inputs, version) {
        if (version === 'v6') {
            return `# ====================================================\n# ERROR: WireGuard solo está disponible en RouterOS v7+\n# ====================================================\n# Cambia el selector arriba a la derecha a 'v7'.\n`;
        }

        let code = `# ====================================================\n`;
        code += `# SCRIPT: WireGuard Client (router -> VPN comercial)\n`;
        code += `# RouterOS Version: v7\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Modo: ${inputs.route_mode}\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Crear la interfaz WireGuard con la clave privada del proveedor\n`;
        code += `/interface wireguard\n`;
        code += `add name=${inputs.wg_interface} listen-port=${inputs.listen_port} private-key="${inputs.private_key}" comment="WireGuard Client"\n\n`;

        code += `# 2. Asignar la IP que el proveedor te dio para este peer\n`;
        code += `/ip address\n`;
        code += `add address=${inputs.local_address} interface=${inputs.wg_interface} comment="WG Client IP"\n\n`;

        code += `# 3. Registrar el peer (el servidor VPN remoto)\n`;
        code += `/interface wireguard peers\n`;
        code += `add interface=${inputs.wg_interface} public-key="${inputs.peer_public_key}" endpoint-address=${inputs.endpoint_address} endpoint-port=${inputs.endpoint_port} allowed-address=${inputs.allowed_address} persistent-keepalive=${inputs.keepalive}s comment="VPN Server Endpoint"\n\n`;

        if (inputs.route_mode === 'all-lan' || inputs.route_mode === 'selective') {
            code += `# 4. Mangle: marcar el tráfico a enrutar por el túnel\n`;
            code += `/ip firewall mangle\n`;
            if (inputs.route_mode === 'all-lan') {
                code += `add chain=prerouting action=mark-routing new-routing-mark=via-wg passthrough=no src-address=${inputs.lan_network} comment="Marcar tráfico LAN para WireGuard"\n\n`;
            } else {
                code += `# Address-list 'via-vpn' selectiva (agrega manualmente los clientes que deben salir por VPN)\n`;
                code += `add chain=prerouting action=mark-routing new-routing-mark=via-wg passthrough=no src-address-list=via-vpn comment="Marcar tráfico de la lista via-vpn"\n\n`;
            }

            code += `# 5. Tabla de routing dedicada\n`;
            code += `/routing table\n`;
            code += `add name=via-wg fib\n\n`;

            code += `# 6. Ruta default por el túnel WireGuard\n`;
            code += `/ip route\n`;
            code += `add dst-address=0.0.0.0/0 gateway=${inputs.wg_interface} routing-table=via-wg distance=1 comment="Default via WireGuard"\n\n`;
        } else {
            code += `# 4. Solo el router: ruta default por el túnel en la tabla main\n`;
            code += `/ip route\n`;
            code += `add dst-address=0.0.0.0/0 gateway=${inputs.wg_interface} distance=1 comment="Default via WireGuard (solo router)"\n\n`;
        }

        code += `# 7. NAT para masquerade del tráfico que sale por WireGuard\n`;
        code += `/ip firewall nat\n`;
        code += `add chain=srcnat out-interface=${inputs.wg_interface} action=masquerade comment="Masquerade WireGuard"\n\n`;

        code += `# 8. Firewall: permitir el tráfico forward por el túnel\n`;
        code += `/ip firewall filter\n`;
        code += `add chain=forward action=accept out-interface=${inputs.wg_interface} comment="LAN -> WG" place-before=0\n`;
        code += `add chain=forward action=accept in-interface=${inputs.wg_interface} connection-state=established,related comment="WG -> LAN return" place-before=0\n\n`;

        code += `# 9. Forzar DNS del proveedor para evitar leaks\n`;
        code += `/ip dns\n`;
        code += `set servers=${inputs.dns_server} allow-remote-requests=yes\n\n`;

        if (inputs.route_mode === 'selective') {
            code += `# Para enrutar un cliente específico por el VPN, agrégalo a la lista:\n`;
            code += `# /ip firewall address-list add list=via-vpn address=192.168.88.50 comment="Cliente con VPN"\n\n`;
        }

        code += `# VERIFICAR conexión:\n`;
        code += `#   /interface wireguard peers print  (latest-handshake debe ser reciente)\n`;
        code += `#   /tool fetch url="https://ipinfo.io/ip" mode=https keep-result=no\n`;
        code += `# Si latest-handshake nunca aparece: revisa endpoint, keys y que UDP/${inputs.endpoint_port} pueda salir.\n`;
        code += `# IMPORTANTE: la clave privada en este script ES SECRETA. No la subas a git.\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
