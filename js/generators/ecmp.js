// Balanceo ECMP multi-WAN con failover por check-gateway (opcionalmente recursivo).
(function () {
    const definition = {
        key: 'ecmp',
        title: "Balanceo ECMP (Multi-WAN con Failover)",
        description: "Balanceo de carga por rutas de igual costo (ECMP): una sola ruta por defecto con varios gateways reparte las conexiones entre 2 a 10 WANs, con pesos opcionales y failover automático. Más simple que PCC: sin reglas de mangle.",
        fileName: "mikrotik_ecmp.rsc",
        inputs: [
            {
                id: "recursive_routes",
                label: "Failover por Internet real (Rutas Recursivas)",
                type: "select",
                options: [
                    { value: "no", label: "No (check-gateway al gateway directo)" },
                    { value: "yes", label: "Sí (ping a host externo vía ruta recursiva)" }
                ],
                default: "no",
                hint: "Si se habilita, cada WAN monitorea un host público externo. Detecta caídas de Internet aunque el gateway siga activo."
            },
            {
                id: "wan_count",
                label: "Cantidad de Líneas WAN",
                type: "select",
                options: [
                    { value: "2", label: "2 WANs" },
                    { value: "3", label: "3 WANs" },
                    { value: "4", label: "4 WANs" },
                    { value: "5", label: "5 WANs" },
                    { value: "6", label: "6 WANs" },
                    { value: "7", label: "7 WANs" },
                    { value: "8", label: "8 WANs" },
                    { value: "9", label: "9 WANs" },
                    { value: "10", label: "10 WANs" }
                ],
                default: "2",
                hint: "Número de interfaces WAN a balancear"
            },
            { id: "wan_weights", label: "Pesos por WAN (opcional)", type: "text", default: "", hint: "Separados por coma, en orden (ej: 2,1 = WAN1 recibe el doble). Vacío = reparto igual. Máx 8 por WAN" },
            {
                id: "hash_policy",
                label: "Política de Hash (solo v7)",
                type: "select",
                options: [
                    { value: "l4", label: "L4 - por conexión (recomendado)" },
                    { value: "l3", label: "L3 - por par origen/destino (más estable)" }
                ],
                default: "l4",
                hint: "L4 reparte cada conexión (mejor distribución). L3 fija cada par IP origen-destino a una misma WAN. En v6 no aplica"
            },
            { id: "include_nat", label: "Incluir NAT Masquerade por WAN", type: "checkbox", default: true, hint: "Necesario si tus clientes usan IP privada. Desactívalo si ya tienes el NAT configurado" }
        ]
    };

    function generate(inputs, version) {
        const isV7 = version === 'v7';
        const N = parseInt(inputs.wan_count || 2);
        const recursive = inputs.recursive_routes === 'yes';
        const hostDefaults = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222", "8.8.4.4", "1.0.0.1", "4.2.2.1", "4.2.2.2", "208.67.220.220", "149.112.112.112"];

        // Pesos: cada gateway se repite según su peso dentro de la ruta ECMP
        const weights = (inputs.wan_weights || '').split(',').map(s => {
            const w = parseInt(s.trim());
            return (w >= 1 && w <= 8) ? w : 1;
        });

        const gwEntries = [];
        for (let i = 1; i <= N; i++) {
            const gw = inputs[`wan${i}_gateway`] || `192.168.${i}.1`;
            const host = inputs[`ping_host${i}`] || hostDefaults[i - 1] || "8.8.8.8";
            const target = recursive ? host : gw;
            const weight = weights[i - 1] || 1;
            for (let r = 0; r < weight; r++) gwEntries.push(target);
        }

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Balanceo ECMP (Equal Cost Multi-Path) - ${N} WANs\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n`;
        code += `# CÓMO FUNCIONA:\n`;
        code += `# - Una sola ruta por defecto con varios gateways reparte las conexiones\n`;
        code += `#   entre las WANs. No usa mangle (compatible con FastTrack).\n`;
        code += `# - FAILOVER AUTOMÁTICO: check-gateway saca de la lista al gateway caído\n`;
        code += `#   y el tráfico se reparte entre las WANs vivas. Al volver, se reintegra.\n`;
        if (recursive) {
            code += `# - MODO RECURSIVO: cada WAN se valida haciendo ping a un host externo\n`;
            code += `#   (detecta caídas de Internet aunque el gateway local siga vivo).\n`;
        }
        code += `# ====================================================\n\n`;

        if (isV7) {
            code += `# 1. Política de hash ECMP (v7): cómo se elige la WAN de cada paquete\n`;
            code += `#    l4 = por conexión (IP+puertos) | l3 = por par IP origen-destino\n`;
            code += `/ip settings\n`;
            code += `set ipv4-multipath-hash-policy=${inputs.hash_policy || 'l4'}\n\n`;
        } else {
            code += `# NOTA v6: el balanceo se hace por par origen/destino usando la caché de\n`;
            code += `# rutas. La caché se vacía periódicamente y el reparto se re-sortea, por lo\n`;
            code += `# que conexiones largas pueden cambiar de WAN (y cortarse si hay NAT).\n`;
            code += `# Si eso es un problema, considera el generador de Balanceo PCC.\n\n`;
        }

        code += `# 2. Rutas\n`;
        code += `/ip route\n`;
        if (recursive) {
            code += `# Rutas de control /32: fuerzan el ping de cada host externo por su WAN (scope=10)\n`;
            for (let i = 1; i <= N; i++) {
                const gw = inputs[`wan${i}_gateway`] || `192.168.${i}.1`;
                const host = inputs[`ping_host${i}`] || hostDefaults[i - 1] || "8.8.8.8";
                code += `add dst-address=${host}/32 gateway=${gw} scope=10 comment="Control recursivo WAN${i}"\n`;
            }
            code += `\n# Ruta ECMP: un gateway por cada peso; check-gateway excluye los caídos\n`;
            code += `add dst-address=0.0.0.0/0 gateway=${gwEntries.join(',')} check-gateway=ping target-scope=11 distance=1 comment="ECMP ${N} WANs (recursivo)"\n`;
        } else {
            code += `# Ruta ECMP: un gateway por cada peso; check-gateway excluye los caídos\n`;
            code += `add dst-address=0.0.0.0/0 gateway=${gwEntries.join(',')} check-gateway=ping distance=1 comment="ECMP ${N} WANs"\n`;
        }
        code += `\n`;

        if (inputs.include_nat) {
            code += `# 3. NAT Masquerade por cada interfaz WAN\n`;
            code += `/ip firewall nat\n`;
            for (let i = 1; i <= N; i++) {
                const iface = inputs[`wan${i}_interface`] || `ether${i}`;
                code += `add chain=srcnat out-interface=${iface} action=masquerade comment="Masquerade WAN${i}"\n`;
            }
            code += `\n`;
        }

        code += `# ====================================================\n`;
        code += `# NOTAS\n`;
        const weightInfo = gwEntries.length > N ? ` (con pesos: ${weights.slice(0, N).join(':')})` : '';
        code += `# - Reparto entre ${N} WANs${weightInfo}: para dar más tráfico a una WAN,\n`;
        code += `#   su gateway se repite en la lista (peso).\n`;
        code += `# - Con NAT, si una WAN cae las conexiones que iban por ella se cortan y\n`;
        code += `#   se rehacen por las WANs vivas (inherente a cualquier balanceo con NAT).\n`;
        code += `# - ECMP no garantiza 50/50 exacto: reparte conexiones, no ancho de banda.\n`;
        if (recursive) {
            code += `# - Usa un host de monitoreo DISTINTO por WAN. Evita usar como host de\n`;
            code += `#   monitoreo un DNS que tus clientes usen: su tráfico hacia esa IP\n`;
            code += `#   siempre saldrá por la WAN de su ruta de control.\n`;
        }
        code += `# - Verificar estado:  /ip route print where dst-address=0.0.0.0/0\n`;
        code += `#   (los gateways caídos aparecen como unreachable y salen del reparto)\n`;
        code += `# ====================================================\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
