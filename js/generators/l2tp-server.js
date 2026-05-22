// L2TP/IPSec VPN Server. Auto-registra vía window.MTB.
(function () {
    const definition = {
        key: 'l2tp-server',
        title: "Servidor VPN L2TP/IPSec",
        description: "Servidor VPN con cifrado IPSec y autenticación L2TP. Compatible nativo con Windows, macOS, iOS y Android sin instalar apps adicionales.",
        fileName: "mikrotik_l2tp_server.rsc",
        inputs: [
            { id: "vpn_network", label: "Red VPN (CIDR)", type: "text", default: "10.20.20.0/24", hint: "Subred interna para clientes VPN" },
            { id: "local_address", label: "IP del Router en VPN", type: "text", default: "10.20.20.1", hint: "Gateway de la red VPN" },
            { id: "pool_start", label: "Inicio Pool Clientes", type: "text", default: "10.20.20.10" },
            { id: "pool_end", label: "Fin Pool Clientes", type: "text", default: "10.20.20.50" },
            { id: "dns_servers", label: "DNS para Clientes", type: "text", default: "1.1.1.1,8.8.8.8" },
            { id: "lan_network", label: "Red LAN del Router (para acceder por VPN)", type: "text", default: "192.168.88.0/24", hint: "Subred local que los clientes podrán alcanzar" },
            { id: "ipsec_secret", label: "Clave Pre-Compartida IPSec (PSK)", type: "text", default: "SuperSecretPSK_2024", hint: "Mínimo 12 caracteres. Se comparte con todos los clientes." },
            { id: "user_name", label: "Usuario de Prueba", type: "text", default: "vpnuser1" },
            { id: "user_password", label: "Contraseña", type: "text", default: "vpnpass2024" },
            {
                id: "enc_algorithm",
                label: "Algoritmo de Cifrado IPSec",
                type: "select",
                options: [
                    { value: "aes-256-cbc", label: "AES-256-CBC (recomendado)" },
                    { value: "aes-128-cbc", label: "AES-128-CBC" },
                    { value: "3des", label: "3DES (compatibilidad legacy)" }
                ],
                default: "aes-256-cbc"
            }
        ]
    };

    function generate(inputs, version) {
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Servidor VPN L2TP/IPSec\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Compatible con Windows, macOS, iOS, Android (sin app extra)\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Pool de IPs para los clientes VPN\n`;
        code += `/ip pool\n`;
        code += `add name=l2tp-pool ranges=${inputs.pool_start}-${inputs.pool_end}\n\n`;

        code += `# 2. Perfil PPP para conexiones L2TP\n`;
        code += `/ppp profile\n`;
        code += `add name=l2tp-profile local-address=${inputs.local_address} remote-address=l2tp-pool dns-server=${inputs.dns_servers} use-encryption=yes change-tcp-mss=yes only-one=default comment="Perfil L2TP/IPSec"\n\n`;

        code += `# 3. Crear usuario inicial\n`;
        code += `/ppp secret\n`;
        code += `add name="${inputs.user_name}" password="${inputs.user_password}" profile=l2tp-profile service=l2tp comment="Cliente VPN L2TP"\n\n`;

        code += `# 4. Activar servidor L2TP con IPSec habilitado\n`;
        code += `/interface l2tp-server server\n`;
        code += `set enabled=yes default-profile=l2tp-profile use-ipsec=yes ipsec-secret="${inputs.ipsec_secret}" authentication=mschap2 max-mtu=1450 max-mru=1450\n\n`;

        if (version === 'v7') {
            code += `# 5. (v7) Ajustar proposal/peer IPSec para mayor compatibilidad y seguridad\n`;
            code += `/ip ipsec proposal\n`;
            code += `set [find default=yes] enc-algorithms=${inputs.enc_algorithm} auth-algorithms=sha256,sha1 pfs-group=modp2048\n\n`;
        } else {
            code += `# 5. (v6) Ajustar proposal IPSec\n`;
            code += `/ip ipsec proposal\n`;
            code += `set [find default=yes] enc-algorithms=${inputs.enc_algorithm} auth-algorithms=sha256,sha1 pfs-group=modp2048\n\n`;
        }

        code += `# 6. Reglas de firewall para permitir las conexiones VPN\n`;
        code += `/ip firewall filter\n`;
        code += `add chain=input action=accept protocol=udp dst-port=500 comment="L2TP/IPSec - IKE" place-before=0\n`;
        code += `add chain=input action=accept protocol=udp dst-port=4500 comment="L2TP/IPSec - NAT-T" place-before=0\n`;
        code += `add chain=input action=accept protocol=ipsec-esp comment="L2TP/IPSec - ESP" place-before=0\n`;
        code += `add chain=input action=accept protocol=udp dst-port=1701 comment="L2TP" place-before=0\n`;
        code += `# Permitir tráfico entre clientes VPN y la LAN\n`;
        code += `add chain=forward action=accept src-address=${inputs.vpn_network} dst-address=${inputs.lan_network} comment="VPN -> LAN"\n`;
        code += `add chain=forward action=accept src-address=${inputs.lan_network} dst-address=${inputs.vpn_network} comment="LAN -> VPN"\n\n`;

        code += `# 7. NAT: NO enmascarar tráfico entre VPN y LAN (debe ir antes del masquerade general)\n`;
        code += `/ip firewall nat\n`;
        code += `add chain=srcnat action=accept src-address=${inputs.vpn_network} dst-address=${inputs.lan_network} comment="No NAT VPN-LAN" place-before=0\n\n`;

        code += `# ====================================================\n`;
        code += `# CONFIGURACIÓN EN EL CLIENTE\n`;
        code += `# ====================================================\n`;
        code += `# Windows: VPN tipo 'L2TP/IPSec con clave pre-compartida'\n`;
        code += `#   Servidor: <IP_PUBLICA_DEL_ROUTER>\n`;
        code += `#   Usuario:  ${inputs.user_name}\n`;
        code += `#   Pass:     ${inputs.user_password}\n`;
        code += `#   PSK:      ${inputs.ipsec_secret}\n`;
        code += `#\n`;
        code += `# iOS/Android: VPN tipo 'L2TP/IPSec PSK'\n`;
        code += `# macOS: Preferencias > Red > + > VPN > L2TP sobre IPSec\n`;
        code += `#\n`;
        code += `# Si el router está detrás de NAT, abre 500/UDP, 4500/UDP y protocolo ESP (50)\n`;
        code += `# en el router superior. NUNCA expongas el PSK en redes públicas.\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
