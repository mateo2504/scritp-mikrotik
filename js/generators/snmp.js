// SNMP Monitoring (v1/v2c/v3). Auto-registra vía window.MTB.
(function () {
    const definition = {
        key: 'snmp',
        title: "SNMP (Monitoreo Externo)",
        description: "Habilita SNMP para integrar el router con sistemas de monitoreo como LibreNMS, Zabbix, PRTG, Cacti, Grafana. Soporta v2c (simple) y v3 (cifrado).",
        fileName: "mikrotik_snmp.rsc",
        inputs: [
            {
                id: "snmp_version",
                label: "Versión SNMP",
                type: "select",
                options: [
                    { value: "v2c", label: "v2c (simple, comunidad como password)" },
                    { value: "v3", label: "v3 (autenticación + cifrado - recomendado)" },
                    { value: "both", label: "Ambas (legacy + v3)" }
                ],
                default: "v2c"
            },
            { id: "community_name", label: "Community (v1/v2c)", type: "text", default: "miorganizacion_ro", hint: "Equivale a contraseña en v2c. NO uses 'public'." },
            { id: "allowed_networks", label: "Redes Autorizadas a Consultar (CIDR, coma)", type: "text", default: "192.168.88.0/24,10.0.0.0/24", hint: "IPs del sistema de monitoreo (LibreNMS/Zabbix). NO 0.0.0.0/0." },
            { id: "v3_username", label: "Usuario SNMPv3", type: "text", default: "monitor", hint: "Solo si seleccionaste v3 o both" },
            {
                id: "v3_auth_protocol",
                label: "Protocolo de Autenticación v3",
                type: "select",
                options: [
                    { value: "SHA1", label: "SHA-1 (compatible amplio)" },
                    { value: "SHA256", label: "SHA-256 (recomendado)" },
                    { value: "MD5", label: "MD5 (legacy - inseguro)" }
                ],
                default: "SHA256"
            },
            { id: "v3_auth_password", label: "Contraseña de Autenticación", type: "text", default: "AuthPass2024_LargaYSegura", hint: "Mínimo 8 caracteres" },
            {
                id: "v3_priv_protocol",
                label: "Protocolo de Cifrado v3",
                type: "select",
                options: [
                    { value: "AES", label: "AES-128 (recomendado)" },
                    { value: "DES", label: "DES (legacy - inseguro)" }
                ],
                default: "AES"
            },
            { id: "v3_priv_password", label: "Contraseña de Cifrado", type: "text", default: "PrivPass2024_LargaYSegura" },
            { id: "snmp_contact", label: "Contacto Administrativo", type: "text", default: "admin@miempresa.com" },
            { id: "snmp_location", label: "Ubicación Física", type: "text", default: "Datacenter Principal - Rack 3" },
            { id: "trap_target", label: "IP del SNMP Trap Receiver (opcional)", type: "text", default: "", hint: "Si tu monitoreo recibe traps, pon aquí su IP. Vacío = deshabilitar traps." }
        ]
    };

    function generate(inputs, version) {
        const v = inputs.snmp_version || 'v2c';
        const useV2 = v === 'v2c' || v === 'both';
        const useV3 = v === 'v3' || v === 'both';

        let code = `# ====================================================\n`;
        code += `# SCRIPT: SNMP Monitoring\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Versión SNMP: ${v}\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Configurar communities (define quién puede consultar y con qué credenciales)\n`;
        code += `/snmp community\n`;
        code += `# Eliminar la community 'public' por defecto (PELIGROSA)\n`;
        code += `remove [find name=public]\n\n`;

        if (useV2) {
            code += `# Community v2c (lectura solamente, restringida a las redes autorizadas)\n`;
            code += `add name=${inputs.community_name} addresses=${inputs.allowed_networks} read-access=yes write-access=no security=none comment="SNMP v2c read-only"\n\n`;
        }

        if (useV3) {
            code += `# Usuario SNMPv3 con autenticación + cifrado\n`;
            code += `add name=${inputs.v3_username} addresses=${inputs.allowed_networks} read-access=yes write-access=no \\\n`;
            code += `    authentication-protocol=${inputs.v3_auth_protocol} authentication-password="${inputs.v3_auth_password}" \\\n`;
            code += `    encryption-protocol=${inputs.v3_priv_protocol} encryption-password="${inputs.v3_priv_password}" \\\n`;
            code += `    security=private comment="SNMPv3 ${inputs.v3_username} con AuthPriv"\n\n`;
        }

        code += `# 2. Habilitar el servicio SNMP\n`;
        code += `/snmp\n`;
        code += `set enabled=yes contact="${inputs.snmp_contact}" location="${inputs.snmp_location}" engine-id="${(inputs.community_name || 'router').toLowerCase().replace(/[^a-z0-9]/g, '-')}"`;
        if (inputs.trap_target && inputs.trap_target.trim()) {
            code += ` trap-target=${inputs.trap_target} trap-version=2 trap-community=${useV2 ? inputs.community_name : 'public'} trap-generators=interfaces`;
        }
        code += `\n\n`;

        code += `# 3. Firewall: permitir UDP/161 (queries) y opcionalmente UDP/162 (traps) desde el monitoreo\n`;
        code += `/ip firewall filter\n`;
        const nets = (inputs.allowed_networks || '').split(',').map(n => n.trim()).filter(Boolean);
        nets.forEach((net, i) => {
            code += `add chain=input action=accept protocol=udp dst-port=161 src-address=${net} comment="SNMP query from ${net}" place-before=0\n`;
        });
        if (inputs.trap_target && inputs.trap_target.trim()) {
            code += `# Permitir respuestas hacia el trap receiver (saliente, manejado por established/related normalmente)\n`;
        }
        code += `\n`;

        code += `# ====================================================\n`;
        code += `# CONFIGURAR EN EL SISTEMA DE MONITOREO\n`;
        code += `# ====================================================\n`;
        if (useV2) {
            code += `# SNMP v2c:\n`;
            code += `#   Community: ${inputs.community_name}\n`;
            code += `#   Versión:   2c\n`;
            code += `#   Puerto:    161 UDP\n`;
            code += `#\n`;
        }
        if (useV3) {
            code += `# SNMP v3:\n`;
            code += `#   Username:   ${inputs.v3_username}\n`;
            code += `#   Auth:       ${inputs.v3_auth_protocol} / ${inputs.v3_auth_password}\n`;
            code += `#   Priv:       ${inputs.v3_priv_protocol} / ${inputs.v3_priv_password}\n`;
            code += `#   Sec Level:  authPriv\n`;
            code += `#\n`;
        }
        code += `# ====================================================\n`;
        code += `# OIDs ÚTILES DE MIKROTIK\n`;
        code += `# - 1.3.6.1.2.1.1.5         System name\n`;
        code += `# - 1.3.6.1.2.1.2.2.1.10    ifInOctets (tráfico entrada por interfaz)\n`;
        code += `# - 1.3.6.1.2.1.2.2.1.16    ifOutOctets (tráfico salida por interfaz)\n`;
        code += `# - 1.3.6.1.4.1.14988.1.1.3.10  CPU load (MikroTik específico)\n`;
        code += `# - 1.3.6.1.4.1.14988.1.1.3.14  Total memory\n`;
        code += `# - 1.3.6.1.4.1.14988.1.1.3.15  Free memory\n`;
        code += `# - 1.3.6.1.4.1.14988.1.1.3.11  Temperature (RouterBoards con sensor)\n`;
        code += `# - 1.3.6.1.4.1.14988.1.1.3.100 Voltage (RouterBoards)\n`;
        code += `# ====================================================\n`;
        code += `# PROBAR DESDE LINUX:\n`;
        if (useV2) {
            code += `#   snmpwalk -v2c -c ${inputs.community_name} ROUTER_IP 1.3.6.1.2.1.1\n`;
        }
        if (useV3) {
            code += `#   snmpwalk -v3 -l authPriv -u ${inputs.v3_username} \\\n`;
            code += `#     -a ${inputs.v3_auth_protocol} -A "${inputs.v3_auth_password}" \\\n`;
            code += `#     -x ${inputs.v3_priv_protocol} -X "${inputs.v3_priv_password}" \\\n`;
            code += `#     ROUTER_IP 1.3.6.1.2.1.1\n`;
        }
        code += `# - LibreNMS: añadir device con sus credenciales\n`;
        code += `# - Zabbix: usa el template oficial 'MikroTik by SNMP'\n`;
        code += `# - Grafana: combina con Prometheus + mikrotik-exporter\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
