// Generador de Policy-Based Routing (PBR / Ruteo por Políticas)
(function () {
    const definition = {
        key: 'pbr',
        title: "Policy Based Routing (PBR)",
        description: "Desvía tráfico específico (por IPs, subredes, interfaces o puertos) a través de una WAN o puerta de enlace (gateway) específica.",
        fileName: "mikrotik_pbr.rsc",
        inputs: [
            {
                id: "target_type",
                label: "Tipo de Clasificación (¿Qué desviar?)",
                type: "select",
                options: [
                    { value: "src-address", label: "IP o Subred de Origen (src-address)" },
                    { value: "in-interface", label: "Interfaz de Entrada LAN (in-interface)" },
                    { value: "port-protocol", label: "Puerto y Protocolo de Destino" }
                ],
                default: "src-address",
                hint: "Método para identificar los paquetes que se van a desviar."
            },
            { id: "src_address", label: "Dirección IP o Subred Origen", type: "text", default: "192.168.88.50", hint: "Ej: 192.168.88.50 o rango CIDR 192.168.88.0/24" },
            { id: "in_interface", label: "Interfaz LAN de Entrada", type: "text", default: "bridge-lan", hint: "Ej: bridge-lan o vlan10-guest" },
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
            { id: "dst_port", label: "Puerto(s) de Destino", type: "text", default: "80,443", hint: "Ej: 80,443 para Web, o 25,465,587 para SMTP. Separados por comas." },
            { id: "wan_gateway", label: "Gateway de Salida (ISP o VPN)", type: "text", default: "192.168.1.1", hint: "Gateway del proveedor destino por donde saldrá este tráfico." },
            { id: "wan_interface", label: "Interfaz WAN de Salida", type: "text", default: "ether1", hint: "Interfaz física (ej: ether1, pppoe-out1 o wg-vpn) por donde sale el tráfico." },
            {
                id: "fallback_action",
                label: "¿Conmutar a WAN principal si esta cae?",
                type: "select",
                options: [
                    { value: "lookup", label: "Sí (Conmutación por failover a tabla principal)" },
                    { value: "lookup-only-in-table", label: "No (Bloquear tráfico para máxima seguridad)" }
                ],
                default: "lookup",
                hint: "Determina si el tráfico puede salir por el resto de WANs si la WAN elegida se desconecta."
            },
            {
                id: "method_v7",
                label: "Método de Implementación (RouterOS v7)",
                type: "select",
                options: [
                    { value: "routing-rule", label: "Routing Rules (Recomendado, ligero y no interfiere con FastTrack)" },
                    { value: "mangle", label: "Mangle Rules (Requerido si filtras por puerto/protocolo)" }
                ],
                default: "routing-rule",
                hint: "Routing Rules son más eficientes. Nota: Si seleccionas filtrar por Puertos, se forzará Mangle automáticamente."
            }
        ]
    };

    function generate(inputs, version) {
        const isV7 = version === 'v7';
        const type = inputs.target_type || 'src-address';
        const gateway = inputs.wan_gateway || '192.168.1.1';
        const wanInt = inputs.wan_interface || 'ether1';
        const fallback = inputs.fallback_action || 'lookup';
        let method = inputs.method_v7 || 'routing-rule';

        // Si se filtra por puertos/protocolo, en v7 DEBEMOS usar Mangle obligatoriamente
        if (type === 'port-protocol') {
            method = 'mangle';
        }

        const tableName = `to_${wanInt}`;
        const tableParam = isV7 ? 'routing-table' : 'routing-mark';
        const gwStr = isV7 ? `${gateway}@main` : gateway;

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Policy-Based Routing (PBR / Ruteo por Políticas)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Tipo de Desvío: ${type.toUpperCase()}\n`;
        code += `# Destino: WAN ${wanInt} (Gateway: ${gateway})\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;

        if (isV7) {
            code += `# 1. Crear la Tabla de Enrutamiento dedicada con FIB en v7\n`;
            code += `/routing table\n`;
            code += `add name=${tableName} fib\n\n`;
        }

        code += `# 2. Configurar la Ruta de Salida en la tabla dedicada\n`;
        code += `/ip route\n`;
        code += `add dst-address=0.0.0.0/0 gateway=${gwStr} check-gateway=ping distance=1 ${tableParam}=${tableName} comment="Ruta PBR dedicada para ${wanInt}"\n\n`;

        if (isV7 && method === 'routing-rule') {
            code += `# 3. Regla de Enrutamiento (Routing Rule) - Más rápido y compatible con FastTrack\n`;
            code += `/routing rule\n`;
            
            let ruleCmd = `add `;
            if (type === 'src-address') {
                ruleCmd += `src-address=${inputs.src_address || '192.168.88.50'} `;
            } else if (type === 'in-interface') {
                ruleCmd += `interface=${inputs.in_interface || 'bridge-lan'} `;
            }
            
            ruleCmd += `action=${fallback}-in-table table=${tableName} comment="Desviar trafico PBR"`;
            code += `${ruleCmd}\n`;
        } else {
            code += `# 3. MANGLE (Firewall): marcar conexiones y rutas para aplicar el PBR\n`;
            if (isV7) {
                code += `# NOTA: Recuerda que para Mangle en v7 debes deshabilitar FastTrack para este tráfico.\n`;
            }
            code += `/ip firewall mangle\n`;

            let matchParams = '';
            if (type === 'src-address') {
                matchParams = `src-address=${inputs.src_address || '192.168.88.50'}`;
            } else if (type === 'in-interface') {
                matchParams = `in-interface=${inputs.in_interface || 'bridge-lan'}`;
            } else if (type === 'port-protocol') {
                const proto = inputs.protocol || 'tcp';
                const ports = inputs.dst_port || '80,443';
                matchParams = `protocol=${proto} dst-port=${ports} in-interface=${inputs.in_interface || 'bridge-lan'}`;
            }

            code += `add chain=prerouting ${matchParams} dst-address-type=!local connection-mark=no-mark action=mark-connection new-connection-mark=${tableName}_conn passthrough=yes comment="PBR Connection Mark"\n`;
            code += `add chain=prerouting connection-mark=${tableName}_conn action=mark-routing new-routing-mark=${tableName} passthrough=no comment="PBR Routing Mark"\n`;
        }

        code += `\n# ====================================================\n`;
        code += `# NOTAS DE IMPLEMENTACIÓN:\n`;
        if (isV7 && method === 'routing-rule') {
            code += `# - Este script utiliza 'Routing Rules' en v7, que procesa el tráfico muy rápido\n`;
            code += `#   y no entra en conflicto con las reglas de FastTrack.\n`;
        } else {
            code += `# - Este script utiliza marcas de ruta Mangle.\n`;
            code += `# - IMPORTANTE: Si usas FastTrack, debes crear una regla de aceptación (Bypass) en\n`;
            code += `#   '/ip firewall filter' antes de la regla de FastTrack para las conexiones marcadas:\n`;
            code += `#   add chain=forward action=accept connection-state=established,related connection-mark=${tableName}_conn\n`;
        }
        code += `# - Acción '${fallback}':\n`;
        if (fallback === 'lookup') {
            code += `#   Permite conmutar a la tabla 'main' si la WAN cae. El tráfico no se cortará.\n`;
        } else {
            code += `#   Obliga a buscar ÚNICAMENTE en la tabla dedicada. Si la WAN cae, el tráfico se bloquea.\n`;
        }
        code += `# ====================================================\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
