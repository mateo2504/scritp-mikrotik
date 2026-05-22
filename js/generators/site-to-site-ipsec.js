// Site-to-Site IPsec IKEv2. Auto-registra vía window.MTB.
(function () {
    const definition = {
        key: 'site-to-site-ipsec',
        title: "Site-to-Site IPsec (IKEv2)",
        description: "Túnel IPsec IKEv2 entre dos routers MikroTik para unir dos oficinas. Genera la configuración del 'Site A' (cambia los parámetros para configurar el Site B).",
        fileName: "mikrotik_site_to_site_ipsec.rsc",
        inputs: [
            { id: "site_name", label: "Identificador del Túnel", type: "text", default: "siteA-to-siteB", hint: "Solo identificativo (comentarios)" },
            { id: "local_lan", label: "Red LAN Local (Site A)", type: "text", default: "192.168.10.0/24" },
            { id: "remote_lan", label: "Red LAN Remota (Site B)", type: "text", default: "192.168.20.0/24" },
            { id: "remote_peer_ip", label: "IP Pública del Router Remoto", type: "text", default: "203.0.113.50", hint: "IP/Hostname del router del Site B" },
            { id: "shared_secret", label: "Clave Pre-Compartida (PSK)", type: "text", default: "Cl4v3SuperSecretaParaIPsec_2024", hint: "Mínimo 20 caracteres. Idéntica en ambos sitios." },
            {
                id: "enc_algorithm",
                label: "Cifrado",
                type: "select",
                options: [
                    { value: "aes-256-cbc", label: "AES-256-CBC (recomendado)" },
                    { value: "aes-128-cbc", label: "AES-128-CBC" },
                    { value: "aes-256-gcm", label: "AES-256-GCM (más rápido en hardware moderno)" }
                ],
                default: "aes-256-cbc"
            },
            {
                id: "hash_algorithm",
                label: "Hash / Integridad",
                type: "select",
                options: [
                    { value: "sha256", label: "SHA-256 (recomendado)" },
                    { value: "sha512", label: "SHA-512" },
                    { value: "sha1", label: "SHA-1 (legacy)" }
                ],
                default: "sha256"
            },
            {
                id: "dh_group",
                label: "DH Group (PFS)",
                type: "select",
                options: [
                    { value: "modp2048", label: "modp2048 (Grupo 14 - recomendado)" },
                    { value: "modp3072", label: "modp3072 (Grupo 15)" },
                    { value: "ecp256", label: "ecp256 (Grupo 19 - EC)" },
                    { value: "modp1024", label: "modp1024 (legacy)" }
                ],
                default: "modp2048"
            },
            { id: "lifetime_ike", label: "Lifetime IKE (Fase 1)", type: "text", default: "1d" },
            { id: "lifetime_ipsec", label: "Lifetime IPsec (Fase 2)", type: "text", default: "30m" }
        ]
    };

    function generate(inputs, version) {
        const profileName = `prof-${inputs.site_name}`;
        const proposalName = `prop-${inputs.site_name}`;
        const peerName = `peer-${inputs.site_name}`;

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Site-to-Site IPsec IKEv2 - Configuración para SITE A\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# LAN Local : ${inputs.local_lan}\n`;
        code += `# LAN Remota: ${inputs.remote_lan} (vía ${inputs.remote_peer_ip})\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Profile IKE (Fase 1)\n`;
        code += `/ip ipsec profile\n`;
        code += `add name=${profileName} dh-group=${inputs.dh_group} enc-algorithm=${inputs.enc_algorithm.replace('-cbc','').replace('-gcm','-gcm')} hash-algorithm=${inputs.hash_algorithm} lifetime=${inputs.lifetime_ike} comment="${inputs.site_name}"\n\n`;

        code += `# 2. Proposal IPsec (Fase 2)\n`;
        code += `/ip ipsec proposal\n`;
        code += `add name=${proposalName} auth-algorithms=${inputs.hash_algorithm} enc-algorithms=${inputs.enc_algorithm} lifetime=${inputs.lifetime_ipsec} pfs-group=${inputs.dh_group} comment="${inputs.site_name}"\n\n`;

        code += `# 3. Peer (el router remoto)\n`;
        code += `/ip ipsec peer\n`;
        code += `add name=${peerName} address=${inputs.remote_peer_ip} exchange-mode=ike2 profile=${profileName} comment="${inputs.site_name}"\n\n`;

        code += `# 4. Identity con autenticación por PSK\n`;
        code += `/ip ipsec identity\n`;
        code += `add peer=${peerName} auth-method=pre-shared-key secret="${inputs.shared_secret}" comment="${inputs.site_name}"\n\n`;

        code += `# 5. Policy: define qué tráfico viaja por el túnel\n`;
        code += `/ip ipsec policy\n`;
        code += `add src-address=${inputs.local_lan} dst-address=${inputs.remote_lan} peer=${peerName} tunnel=yes proposal=${proposalName} action=encrypt level=unique comment="${inputs.site_name}"\n\n`;

        code += `# 6. NAT: NO enmascarar el tráfico que va por el túnel (DEBE ir antes del masquerade general)\n`;
        code += `/ip firewall nat\n`;
        code += `add chain=srcnat action=accept src-address=${inputs.local_lan} dst-address=${inputs.remote_lan} comment="No NAT - ${inputs.site_name}" place-before=0\n\n`;

        code += `# 7. Firewall: aceptar protocolos IPsec en input\n`;
        code += `/ip firewall filter\n`;
        code += `add chain=input action=accept protocol=udp dst-port=500 src-address=${inputs.remote_peer_ip} comment="IPsec IKE - ${inputs.site_name}" place-before=0\n`;
        code += `add chain=input action=accept protocol=udp dst-port=4500 src-address=${inputs.remote_peer_ip} comment="IPsec NAT-T - ${inputs.site_name}" place-before=0\n`;
        code += `add chain=input action=accept protocol=ipsec-esp src-address=${inputs.remote_peer_ip} comment="IPsec ESP - ${inputs.site_name}" place-before=0\n`;
        code += `# Permitir el tráfico forward entre las LANs\n`;
        code += `add chain=forward action=accept src-address=${inputs.local_lan} dst-address=${inputs.remote_lan} comment="Local -> Remote - ${inputs.site_name}"\n`;
        code += `add chain=forward action=accept src-address=${inputs.remote_lan} dst-address=${inputs.local_lan} comment="Remote -> Local - ${inputs.site_name}"\n\n`;

        code += `# ====================================================\n`;
        code += `# CONFIGURACIÓN DEL SITE B (router remoto)\n`;
        code += `# Aplica un script casi idéntico pero invertido:\n`;
        code += `#   - src-address=${inputs.remote_lan}  (su LAN)\n`;
        code += `#   - dst-address=${inputs.local_lan}   (esta LAN)\n`;
        code += `#   - peer address=<IP_PUBLICA_DEL_SITE_A>\n`;
        code += `#   - MISMO shared_secret, enc-algorithm, hash-algorithm, dh-group y lifetimes\n`;
        code += `# ====================================================\n\n`;

        code += `# VERIFICAR:\n`;
        code += `#   /ip ipsec active-peers print     (estado debe ser 'established')\n`;
        code += `#   /ip ipsec installed-sa print     (debe haber SAs en ambas direcciones)\n`;
        code += `#   /ip ipsec policy print           (PH2 state=established)\n`;
        code += `# Si no levanta: revisa que PSK, algoritmos, lifetimes y dh-group sean IDÉNTICOS en ambos sitios.\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
