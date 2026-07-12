// Balanceo ECMP multi-WAN con failover por check-gateway (opcionalmente recursivo).
(function () {
    const TAG = 'MTB-ECMP';
    const HOST_DEFAULTS = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222", "8.8.4.4", "1.0.0.1", "4.2.2.1", "4.2.2.2", "208.67.220.220", "149.112.112.112"];

    const definition = {
        key: 'ecmp',
        title: "Balanceo ECMP (Multi-WAN con Failover)",
        description: "Balanceo de carga por rutas de igual costo para WAN con gateways IPv4 estáticos. Incluye failover, pesos e importación segura e idempotente.",
        fileName: "mikrotik_ecmp.rsc",
        inputs: [
            {
                id: "recursive_routes",
                label: "Failover por Internet real (Rutas Recursivas)",
                type: "select",
                options: [
                    { value: "no", label: "No (ping al gateway directo)" },
                    { value: "yes", label: "Sí (ping a host externo por cada WAN)" }
                ],
                default: "no",
                hint: "El modo recursivo detecta caídas de Internet aunque el gateway local todavía responda."
            },
            {
                id: "wan_count",
                label: "Cantidad de Líneas WAN",
                type: "select",
                options: [
                    { value: "2", label: "2 WANs" }, { value: "3", label: "3 WANs" },
                    { value: "4", label: "4 WANs" }, { value: "5", label: "5 WANs" },
                    { value: "6", label: "6 WANs" }, { value: "7", label: "7 WANs" },
                    { value: "8", label: "8 WANs" }, { value: "9", label: "9 WANs" },
                    { value: "10", label: "10 WANs" }
                ],
                default: "2",
                hint: "Número de enlaces con gateway IPv4 fijo."
            },
            {
                id: "wan_weights",
                label: "Pesos por WAN (solo RouterOS v6)",
                type: "text",
                default: "",
                hint: "Separados por coma y en orden (ej.: 2,1). En RouterOS v7 los gateways repetidos se deduplican, por lo que ECMP es siempre equitativo."
            },
            {
                id: "verify_default_routes",
                label: "Verificar rutas por defecto existentes",
                type: "checkbox",
                default: true,
                hint: "Recomendado: el script se detiene si encuentra una ruta 0.0.0.0/0 no creada por este generador. Evita mezclar ECMP con rutas DHCP/PPPoE o configuraciones previas."
            },
            {
                id: "apply_hash_policy",
                label: "Aplicar política de hash ECMP (solo v7)",
                type: "checkbox",
                default: false,
                hint: "Desactivado por seguridad: este ajuste es global y afecta todas las rutas ECMP IPv4 del router."
            },
            {
                id: "hash_policy",
                label: "Política de Hash (solo v7)",
                type: "select",
                options: [
                    { value: "l4", label: "L4 - por conexión (recomendado)" },
                    { value: "l3", label: "L3 - por par origen/destino" }
                ],
                default: "l4",
                hint: "Solo se emite si activas la opción anterior."
            },
            {
                id: "include_nat",
                label: "Incluir NAT Masquerade por WAN",
                type: "checkbox",
                default: true,
                hint: "Necesario para clientes privados. No lo actives si administrarás el NAT por separado."
            }
        ]
    };

    function isIpv4(value) {
        const octets = String(value || '').trim().split('.');
        return octets.length === 4 && octets.every(octet => /^\d{1,3}$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255);
    }

    function isSafeInterface(value) {
        // Evita que un nombre introducido en el formulario altere la sintaxis del .rsc.
        return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,62}$/.test(String(value || '').trim());
    }

    function parseWeights(value, count, errors) {
        const raw = String(value || '').trim();
        if (!raw) return Array(count).fill(1);

        const entries = raw.split(',').map(entry => entry.trim());
        if (entries.length > count) {
            errors.push(`Se indicaron ${entries.length} pesos para ${count} WANs.`);
            return Array(count).fill(1);
        }

        const weights = entries.map((entry, index) => {
            if (!/^[1-8]$/.test(entry)) {
                errors.push(`El peso de WAN${index + 1} debe ser un entero entre 1 y 8.`);
                return 1;
            }
            return Number(entry);
        });
        while (weights.length < count) weights.push(1);
        return weights;
    }

    function validationError(errors) {
        return [
            '# ====================================================',
            '# ERROR: no se generó un script RouterOS ejecutable.',
            '# Corrige los siguientes campos:',
            ...errors.map(error => `# - ${error}`),
            '# ====================================================',
            ''
        ].join('\n');
    }

    function generate(inputs, version) {
        const isV7 = version === 'v7';
        const count = Number.parseInt(inputs.wan_count, 10);
        const recursive = inputs.recursive_routes === 'yes';
        const errors = [];

        if (!Number.isInteger(count) || count < 2 || count > 10) {
            errors.push('La cantidad de WANs debe estar entre 2 y 10.');
        }
        const N = Number.isInteger(count) && count >= 2 && count <= 10 ? count : 2;
        const requestedWeights = parseWeights(inputs.wan_weights, N, errors);
        // RouterOS v7 deduplica next-hops iguales dentro de ECMP. Mantener pesos allí
        // daría una expectativa falsa, por eso v7 se genera siempre con una ruta por WAN.
        const weights = isV7 ? Array(N).fill(1) : requestedWeights;
        const wans = [];
        const interfaces = new Set();
        const hosts = new Set();

        for (let i = 1; i <= N; i++) {
            const iface = String(inputs[`wan${i}_interface`] || `ether${i}`).trim();
            const gateway = String(inputs[`wan${i}_gateway`] || `192.168.${i}.1`).trim();
            const host = String(inputs[`ping_host${i}`] || HOST_DEFAULTS[i - 1]).trim();

            if (!isSafeInterface(iface)) {
                errors.push(`La interfaz WAN${i} solo puede usar letras, números, punto, guion, guion bajo o dos puntos.`);
            }
            if (interfaces.has(iface)) errors.push(`La interfaz ${iface} está repetida.`);
            interfaces.add(iface);

            if (!isIpv4(gateway) || gateway === '0.0.0.0') {
                errors.push(`El gateway de WAN${i} debe ser una dirección IPv4 válida.`);
            }
            if (recursive) {
                if (!isIpv4(host) || host === '0.0.0.0') {
                    errors.push(`El host de monitoreo de WAN${i} debe ser una dirección IPv4 válida.`);
                }
                if (hosts.has(host)) errors.push(`El host de monitoreo ${host} está repetido; usa uno distinto por WAN.`);
                hosts.add(host);
            }
            wans.push({ iface, gateway, host, weight: weights[i - 1] });
        }

        if (errors.length) return validationError(errors);

        let code = '# ====================================================\n';
        code += `# ${TAG}: Balanceo ECMP (${N} WANs)\n`;
        code += `# RouterOS: ${version.toUpperCase()} | Generado: ${new Date().toLocaleDateString()}\n`;
        code += '# Este script es idempotente: al reimportarlo reemplaza solo reglas creadas\n';
        code += `# previamente con la etiqueta ${TAG}.\n`;
        code += '# Requisitos: gateways IPv4 estáticos y una ruta conectada hacia cada gateway.\n';
        code += '# No uses este esquema sin marcado de conexiones para publicar servicios,\n';
        code += '# port-forwarding o VPNs que deban responder por la misma WAN de entrada.\n';
        if (isV7 && inputs.wan_weights && String(inputs.wan_weights).trim()) {
            code += '# NOTA v7: RouterOS deduplica gateways ECMP repetidos; se aplica reparto equitativo.\n';
        }
        code += '# ====================================================\n\n';

        code += '# 0. Protección contra rutas por defecto ajenas\n';
        if (inputs.verify_default_routes !== false) {
            code += ':local unmanagedDefaultRoute false\n';
            code += ':foreach routeId in=[/ip route find where dst-address=0.0.0.0/0] do={\n';
            code += '    :local routeComment [/ip route get $routeId comment]\n';
            code += `    :if ($routeComment !~ "^${TAG}") do={ :set unmanagedDefaultRoute true }\n`;
            code += '}\n';
            code += ':if ($unmanagedDefaultRoute) do={\n';
            code += `    :error "${TAG}: existe una ruta por defecto ajena. Deshabilítala o elimina esa ruta antes de importar este script."\n`;
            code += '}\n\n';
        } else {
            code += `# ADVERTENCIA: se omitió la verificación. No debe existir otra ruta 0.0.0.0/0 activa.\n\n`;
        }

        code += '# 1. Limpiar únicamente la configuración creada por este generador\n';
        code += `/ip route remove [find where comment~"^${TAG}"]\n`;
        // Se limpia siempre: así quitar NAT en una reimportación no deja reglas antiguas.
        code += `/ip firewall nat remove [find where comment~"^${TAG}"]\n`;
        code += '\n';

        if (isV7 && inputs.apply_hash_policy) {
            const hashPolicy = inputs.hash_policy === 'l3' ? 'l3' : 'l4';
            code += '# 2. Política de hash IPv4 ECMP (ajuste global de RouterOS v7)\n';
            code += `/ip settings set ipv4-multipath-hash-policy=${hashPolicy}\n\n`;
        }

        code += `${isV7 && inputs.apply_hash_policy ? '# 3' : '# 2'}. Rutas ECMP y failover\n`;
        code += '/ip route\n';
        if (recursive) {
            code += '# Rutas /32: cada host de control queda forzado a su propia WAN.\n';
            wans.forEach((wan, index) => {
                code += `add dst-address=${wan.host}/32 gateway=${wan.gateway} scope=10 comment="${TAG}: control WAN${index + 1}"\n`;
            });
            code += '# Una ruta por WAN: mismas distancia y destino hacen que RouterOS forme ECMP.\n';
            wans.forEach((wan, index) => {
                for (let repeat = 0; repeat < wan.weight; repeat++) {
                    const suffix = wan.weight > 1 ? ` peso ${repeat + 1}` : '';
                    code += `add dst-address=0.0.0.0/0 gateway=${wan.host} check-gateway=ping target-scope=11 distance=1 comment="${TAG}: default recursiva WAN${index + 1}${suffix}"\n`;
                }
            });
        } else {
            code += '# check-gateway=ping solo comprueba el gateway inmediato; no garantiza Internet real.\n';
            code += '# Una ruta por WAN: mismas distancia y destino hacen que RouterOS forme ECMP.\n';
            wans.forEach((wan, index) => {
                for (let repeat = 0; repeat < wan.weight; repeat++) {
                    const suffix = wan.weight > 1 ? ` peso ${repeat + 1}` : '';
                    code += `add dst-address=0.0.0.0/0 gateway=${wan.gateway} check-gateway=ping distance=1 comment="${TAG}: default directa WAN${index + 1}${suffix}"\n`;
                }
            });
        }
        code += '\n';

        if (inputs.include_nat) {
            code += '# NAT por salida WAN\n';
            code += '/ip firewall nat\n';
            wans.forEach((wan, index) => {
                code += `add chain=srcnat out-interface=${wan.iface} action=masquerade comment="${TAG}: NAT WAN${index + 1}"\n`;
            });
            code += '\n';
        }

        code += '# ====================================================\n';
        code += `# Pesos efectivos WAN1..WAN${N}: ${weights.join(':')}\n`;
        code += '# ECMP reparte conexiones, no garantiza reparto exacto de ancho de banda.\n';
        code += '# Comprueba el estado con: /ip route print detail where comment~"MTB-ECMP"\n';
        code += '# ====================================================\n';
        return code;
    }

    window.MTB.register(definition, generate);
})();
