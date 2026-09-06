// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const TAG = 'MTB-PCC';
    const HOST_DEFAULTS = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222", "8.8.4.4", "1.0.0.1", "4.2.2.1", "4.2.2.2", "208.67.220.220", "149.112.112.112"];
    const PCC_TYPES = ['both-addresses-and-ports', 'both-addresses', 'src-address'];

    const definition = {
        key: 'pcc',
        title: "Balanceo PCC (Múltiples WAN)",
        description: "Distribución de tráfico balanceada entre varias conexiones de Internet (2 a 10 WANs) utilizando marcas de ruta.",
        fileName: "mikrotik_pcc_bal.rsc",
        steps: [
            {
                id: "wans",
                step: 1,
                title: "Líneas WAN y Proveedores",
                shortTitle: "WANs",
                icon: "🌐",
                description: "Indica cuántas líneas de Internet vas a balancear y, por cada una, su interfaz y su gateway.",
                requirementTitle: "Requisito Indispensable #1: Subredes distintas y Sin Rutas Dinámicas",
                requirementText: "1) Cada módem/proveedor DEBE entregar una subred IP distinta (ej. Módem 1: 192.168.1.1, Módem 2: 192.168.2.1). Si tienen la misma IP, cámbiala en el módem antes de conectar.\n2) En MikroTik: desmarca obligatoriamente 'Add Default Route' en los clientes DHCP (/ip dhcp-client) o PPPoE (/interface pppoe-client) de las WAN.",
                inputIds: ["wan_count"]
            },
            {
                id: "lan",
                step: 2,
                title: "Red Local (LAN) y Exclusiones",
                shortTitle: "Red Local",
                icon: "🏠",
                description: "Indica por dónde entran tus clientes y qué red local no debe pasar por el balanceo.",
                requirementTitle: "Requisito Indispensable #2: Exclusión de Tráfico Local (connected-networks)",
                requirementText: "El tráfico entre dispositivos locales (LAN, impresoras, servidores, VLANs) y el acceso a los módems debe aceptarse antes de clasificar con PCC. Sin esto, perderás acceso a los módems y Winbox sufrirá caídas continuas.",
                inputIds: [
                    "lan_match_type",
                    "lan_interface",
                    "lan_interface_list",
                    "lan_address_list",
                    "lan_network",
                    "extra_connected_networks"
                ]
            },
            {
                id: "algorithm",
                step: 3,
                title: "Failover, Hotspot y Repaso Final",
                shortTitle: "Failover",
                icon: "⚡",
                description: "Elige cómo detectar la caída de una línea, si usas Hotspot, y repasa los requisitos antes de aplicar.",
                requirementTitle: "Requisito Indispensable #3: FastTrack Bypass",
                requirementText: "FastTrack omite la tabla Mangle por defecto. El script agrega automáticamente una regla de exclusión para que el tráfico marcado sí se balancee, sin tocar tus reglas FastTrack existentes.",
                inputIds: ["recursive_routes", "hotspot_compatibility", "hotspot_interface", "pcc_type"],
                checklistItems: [
                    {
                        id: "chk_default_route",
                        title: "Desactivar 'Add Default Route' en WANs",
                        desc: "En /ip dhcp-client o /interface pppoe-client de cada WAN, 'Add Default Route' debe estar en 'no'. El balanceador gestiona las rutas."
                    },
                    {
                        id: "chk_subnets",
                        title: "Módems en subredes IP independientes",
                        desc: "Verifica que ningún módem o proveedor comparta el mismo rango IP (ej. 192.168.1.0/24 y 192.168.2.0/24)."
                    },
                    {
                        id: "chk_lan_ip",
                        title: "Subred LAN configurada en el MikroTik",
                        desc: "Tu bridge o interfaz LAN debe tener configurada la IP correspondiente a la red local indicada en el Paso 2."
                    },
                    {
                        id: "chk_backup",
                        title: "Respaldo (Backup) previo del RouterOS",
                        desc: "Recomendado: crea un backup desde Files -> Backup o en terminal con '/system backup save name=antes_pcc'."
                    }
                ],
                verificationCommands: [
                    {
                        label: "1. Monitoreo de paquetes balanceados (Mangle)",
                        cmd: '/ip firewall mangle print stats where comment~"MTB-PCC"'
                    },
                    {
                        label: "2. Verificación de tablas y rutas activas",
                        cmd: '/ip route print detail where comment~"MTB-PCC"'
                    },
                    {
                        label: "3. Comprobar tráfico en tiempo real por WAN",
                        cmd: '/interface monitor-traffic [find where default-name~"ether"]'
                    }
                ]
            }
        ],
        inputs: [
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
                hint: "Número de interfaces WAN a balancear",
                step: 1
            },
            {
                id: "lan_match_type",
                label: "Identificar Tráfico LAN por",
                type: "select",
                options: [
                    { value: "in-interface", label: "Interfaz (in-interface)" },
                    { value: "in-interface-list", label: "Lista de Interfaces (in-interface-list)" },
                    { value: "src-address-list", label: "Lista de IPs (src-address-list)" }
                ],
                default: "in-interface",
                hint: "Método para identificar los paquetes que vienen de la LAN",
                step: 2,
                advanced: true
            },
            { id: "lan_interface", label: "Interfaz LAN", type: "text", default: "bridge-lan", hint: "Red local cableada o bridge LAN", step: 2 },
            { id: "lan_interface_list", label: "Interface List LAN", type: "text", default: "LAN", hint: "Nombre de la Interface List en /interface list", step: 2 },
            { id: "lan_address_list", label: "Address List LAN", type: "text", default: "PCC-Clients", hint: "Nombre de la Address List en /ip firewall address-list. El script agrega la red LAN; puedes añadir más IPs después.", step: 2 },
            { id: "lan_network", label: "Red LAN (CIDR)", type: "text", default: "192.168.88.0/24", hint: "Rango local que no debe balancearse (tráfico a esta red usa la tabla main)", step: 2 },
            {
                id: "extra_connected_networks",
                label: "Otras redes a excluir (CIDR)",
                type: "textarea",
                default: "",
                hint: "VLAN, DMZ, VPN u otros prefijos internos, uno por línea o separados por coma. Si no se listan, el PCC puede enviar ese tráfico por una WAN.",
                step: 2,
                advanced: true
            },
            {
                id: "recursive_routes",
                label: "Detección de caída de línea",
                type: "select",
                options: [
                    { value: "no", label: "Normal: ping al gateway del ISP (check-gateway)" },
                    { value: "yes", label: "Recursivo: ping a un host de Internet (8.8.8.8, 1.1.1.1)" }
                ],
                default: "no",
                hint: "Normal detecta si el módem se cae. Recursivo también detecta cuando el módem responde pero no hay Internet.",
                step: 3
            },
            {
                id: "hotspot_compatibility",
                label: "¿Usas Hotspot en este router?",
                type: "select",
                options: [
                    { value: "no", label: "No uso Hotspot" },
                    { value: "yes", label: "Sí: preservar portal e inicios de sesión" }
                ],
                default: "no",
                hint: "MikroTik no considera PCC un método válido con Hotspot (web-proxy usa la tabla main). Con 'Sí' se excluye el portal y el PCC se aplica solo a clientes autenticados.",
                step: 3
            },
            { id: "hotspot_interface", label: "Interfaz Hotspot", type: "text", default: "bridge-hotspot", hint: "Interfaz o bridge del portal. El PCC se aplica a clientes autenticados de esta interfaz.", step: 3 },
            {
                id: "pcc_type",
                label: "Clasificador PCC",
                type: "select",
                options: [
                    { value: "both-addresses-and-ports", label: "Both Addresses and Ports (Recomendado)" },
                    { value: "both-addresses", label: "Both Addresses" },
                    { value: "src-address", label: "Source Address" }
                ],
                default: "both-addresses-and-ports",
                hint: "Fórmula de clasificación del tráfico. Both Addresses and Ports reparte más; Source Address mantiene cada cliente en la misma WAN.",
                step: 3,
                advanced: true
            }
        ]
    };

    function isIpv4(value) {
        const octets = String(value || '').trim().split('.');
        return octets.length === 4 && octets.every(octet => /^\d{1,3}$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255);
    }

    function isCidr(value) {
        const raw = String(value || '').trim();
        const parts = raw.split('/');
        if (parts.length !== 2) return false;
        const prefix = Number(parts[1]);
        return isIpv4(parts[0]) && Number.isInteger(prefix) && prefix >= 0 && prefix <= 32;
    }

    function isSafeName(value) {
        return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,62}$/.test(String(value || '').trim());
    }

    function looksLikeIpv4(value) {
        return /^[\d.]+$/.test(String(value || '').trim());
    }

    function parseExtraNetworks(value) {
        return String(value || '')
            .split(/[\s,;]+/)
            .map(entry => entry.trim())
            .filter(Boolean);
    }

    function nextHop(gateway, iface, { v7, fromCustomTable }) {
        const trimmed = String(gateway || '').trim();
        let hop = trimmed;
        if (isIpv4(trimmed) && iface) hop = `${trimmed}%${iface}`;
        if (v7 && fromCustomTable) hop += '@main';
        return hop;
    }

    function validationError(errors) {
        return [
            '# ====================================================',
            `# ERROR: no se generó un script RouterOS ejecutable (${TAG}).`,
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
        const hotspotCompatibility = inputs.hotspot_compatibility === 'yes';
        const pccType = PCC_TYPES.includes(inputs.pcc_type) ? inputs.pcc_type : 'both-addresses-and-ports';
        const errors = [];

        if (!Number.isInteger(count) || count < 2 || count > 10) {
            errors.push('La cantidad de WANs debe estar entre 2 y 10.');
        }
        const N = Number.isInteger(count) && count >= 2 && count <= 10 ? count : 2;

        const matchType = inputs.lan_match_type || 'in-interface';
        const lanInterface = String(inputs.lan_interface || 'bridge-lan').trim();
        const lanInterfaceList = String(inputs.lan_interface_list || 'LAN').trim();
        const lanAddressList = String(inputs.lan_address_list || 'PCC-Clients').trim();
        const lanNetwork = String(inputs.lan_network || '192.168.88.0/24').trim();
        const hotspotInterface = String(inputs.hotspot_interface || 'bridge-hotspot').trim();
        const extraNetworks = parseExtraNetworks(inputs.extra_connected_networks);

        let lanMatchParam = '';
        if (matchType === 'in-interface') {
            lanMatchParam = `in-interface=${lanInterface}`;
            if (!isSafeName(lanInterface)) errors.push('La interfaz LAN contiene caracteres no válidos.');
        } else if (matchType === 'in-interface-list') {
            lanMatchParam = `in-interface-list=${lanInterfaceList}`;
            if (!isSafeName(lanInterfaceList)) errors.push('La Interface List LAN contiene caracteres no válidos.');
        } else if (matchType === 'src-address-list') {
            lanMatchParam = `src-address-list=${lanAddressList}`;
            if (!isSafeName(lanAddressList)) errors.push('La Address List LAN contiene caracteres no válidos.');
        } else {
            errors.push('El método para identificar la LAN no es válido.');
        }

        if (!isCidr(lanNetwork)) errors.push('La red LAN debe ser un CIDR IPv4 válido (ej. 192.168.88.0/24).');
        extraNetworks.forEach(network => {
            if (!isCidr(network)) errors.push(`La red extra "${network}" no es un CIDR IPv4 válido.`);
        });

        if (hotspotCompatibility && !isSafeName(hotspotInterface)) {
            errors.push('La interfaz Hotspot contiene caracteres no válidos.');
        }

        const wans = [];
        const interfaces = new Set();
        const hosts = new Set();
        const tableNames = new Set();

        for (let i = 1; i <= N; i++) {
            const iface = String(inputs[`wan${i}_interface`] || `ether${i}`).trim();
            const gateway = String(inputs[`wan${i}_gateway`] || `192.168.${i}.1`).trim();
            const network = String(inputs[`wan${i}_network`] || '').trim();
            const host = String(inputs[`ping_host${i}`] || HOST_DEFAULTS[i - 1]).trim();
            const table = `to_${iface}`;

            if (!isSafeName(iface)) {
                errors.push(`La interfaz WAN${i} solo puede usar letras, números, punto, guion, guion bajo o dos puntos.`);
            }
            if (interfaces.has(iface)) errors.push(`La interfaz ${iface} está repetida.`);
            interfaces.add(iface);

            if (tableNames.has(table)) errors.push(`La tabla de enrutamiento ${table} quedaría duplicada.`);
            tableNames.add(table);

            if (!isIpv4(gateway) && (looksLikeIpv4(gateway) || !isSafeName(gateway))) {
                errors.push(`El gateway de WAN${i} debe ser una IPv4 o el nombre de una interfaz punto a punto.`);
            }
            if (gateway === '0.0.0.0') errors.push(`El gateway de WAN${i} no puede ser 0.0.0.0.`);

            if (network) {
                if (!isCidr(network)) errors.push(`El prefijo WAN${i} debe ser un CIDR IPv4 válido.`);
            }

            if (recursive) {
                if (!isIpv4(host) || host === '0.0.0.0') {
                    errors.push(`El host de monitoreo de WAN${i} debe ser una dirección IPv4 válida.`);
                }
                if (hosts.has(host)) errors.push(`El host de monitoreo ${host} está repetido; usa uno distinto por WAN.`);
                hosts.add(host);
            }

            wans.push({ iface, gateway, network, host, table, index: i });
        }

        if (errors.length) return validationError(errors);

        const hotspotPcc = hotspotCompatibility && !(matchType === 'in-interface' && lanInterface === hotspotInterface);
        const tableParam = isV7 ? 'routing-table' : 'routing-mark';

        const lines = [];
        const add = (line = '') => lines.push(line);
        const tagged = (comment) => `${TAG}: ${comment}`;

        add('# ====================================================');
        add(`# SCRIPT: Balanceo PCC (Per Connection Classifier) - ${N} WANs`);
        add(`# RouterOS Version: ${version.toUpperCase()}`);
        add(`# Generado: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
        add(`# Etiqueta: ${TAG}. Al reimportar se reemplazan solo reglas con esta etiqueta.`);
        add('# Compatible con cualquier Routerboard (ajusta nombres de interfaces)');
        add('# ====================================================');
        add('# FastTrack omite Mangle y consulta solo la tabla main. El script inserta');
        add('# un accept etiquetado delante de fasttrack-connection para conexiones marcadas.');
        add('# No modifica reglas FastTrack ajenas (p. ej. con connection-mark de QoS).');
        add('# PCC reparte conexiones, no Mbps. Desactiva add-default-route en DHCP/PPPoE');
        add('# WAN para no competir con las rutas generadas aquí.');
        if (hotspotCompatibility) {
            add('# HOTSPOT: RouterOS no garantiza PCC con Hotspot (web-proxy usa main).');
            add('# El portal y clientes no autenticados usan main; los autenticados sí entran a PCC.');
        }
        add('# ====================================================');
        add();

        add('# 0. Quitar únicamente la configuración previa de este generador');
        add(`/ip route remove [find where comment~"^${TAG}"]`);
        add(`/ip firewall mangle remove [find where comment~"^${TAG}"]`);
        add(`/ip firewall nat remove [find where comment~"^${TAG}"]`);
        add(`/ip firewall filter remove [find where comment~"^${TAG}"]`);
        add(`/ip firewall address-list remove [find where comment~"^${TAG}"]`);
        add();

        if (isV7) {
            add('# 1. Crear las tablas de enrutamiento con FIB en v7 (si aún no existen)');
            add('# Si el nombre ya existe sin fib, se activa: una tabla sin FIB no instala rutas.');
            wans.forEach(wan => {
                add(`:if ([:len [/routing table find where name="${wan.table}"]] = 0) do={`);
                add(`    /routing table add name=${wan.table} fib`);
                add('} else={');
                add(`    /routing table set [/routing table find where name="${wan.table}"] fib=yes`);
                add('}');
            });
            add();
        }

        add('# 2. Address lists: destinos que NUNCA deben salir por una tabla WAN');
        add('/ip firewall address-list');
        add(`add address=${lanNetwork} list=connected-networks comment="${tagged('Red LAN')}"`);
        extraNetworks.forEach(network => {
            add(`add address=${network} list=connected-networks comment="${tagged('Red extra')}"`);
        });
        if (matchType === 'src-address-list') {
            add(`add address=${lanNetwork} list=${lanAddressList} comment="${tagged('Clientes a balancear (añade mas rangos si aplica)')}"`);
        }
        wans.forEach(wan => {
            if (wan.network) {
                add(`add address=${wan.network} list=connected-networks comment="${tagged(`Prefijo WAN${wan.index}`)}"`);
            } else {
                add(`# WAN${wan.index}: sin prefijo CIDR. Si el modem/ISP tiene una LAN alcanzada, agrégala para no enviarla por PCC.`);
            }
        });
        if (recursive) {
            wans.forEach(wan => {
                add(`add address=${wan.host} list=pcc-probes comment="${tagged(`Probe WAN${wan.index}`)}"`);
            });
        }
        add();

        add('# 3. Reglas de Mangle (exclusión local, stickiness de entrada y PCC)');
        add('/ip firewall mangle');
        add('# Aceptar tráfico hacia redes locales/conectadas sin marcar (evita bucles de policy routing)');
        add(`add chain=prerouting dst-address-list=connected-networks ${lanMatchParam} action=accept comment="${tagged('Excluir trafico local y WANs conectadas')}"`);
        if (hotspotPcc) {
            add(`add chain=prerouting dst-address-list=connected-networks in-interface=${hotspotInterface} action=accept comment="${tagged('Excluir destinos locales desde Hotspot')}"`);
        }
        add(`add chain=output dst-address-list=connected-networks action=accept comment="${tagged('Excluir destinos locales en output')}"`);
        if (recursive) {
            add(`add chain=output dst-address-list=pcc-probes action=accept comment="${tagged('Probes recursivos siempre por main')}"`);
        }
        add();

        if (hotspotCompatibility) {
            add('# No marcar portal ni clientes Hotspot no autenticados: usan la tabla main');
            add(`add chain=prerouting in-interface=${hotspotInterface} hotspot=!auth action=accept comment="${tagged('Hotspot: portal y no autenticados por main')}"`);
            add();
        }

        add('# Mantener las conexiones entrantes en su respectiva interfaz WAN de origen');
        add('# (prerouting cubre servicios del router y dst-nat/port-forward; input no cubre dst-nat)');
        wans.forEach(wan => {
            add(`add chain=prerouting in-interface=${wan.iface} connection-state=new connection-mark=no-mark action=mark-connection new-connection-mark=${wan.iface}_conn passthrough=yes comment="${tagged(`Fijar WAN${wan.index}`)}"`);
        });
        add();

        add(`# División PCC LAN: asigna conexiones nuevas de forma equitativa (${pccType})`);
        wans.forEach((wan, index) => {
            add(`add chain=prerouting ${lanMatchParam} connection-state=new dst-address-type=!local dst-address-list=!connected-networks connection-mark=no-mark per-connection-classifier=${pccType}:${N}/${index} action=mark-connection new-connection-mark=${wan.iface}_conn passthrough=yes comment="${tagged(`PCC LAN linea ${wan.index}`)}"`);
        });
        add();

        if (hotspotPcc) {
            add('# PCC para clientes Hotspot ya autenticados (el portal quedó excluido arriba)');
            wans.forEach((wan, index) => {
                add(`add chain=prerouting in-interface=${hotspotInterface} hotspot=auth connection-state=new dst-address-type=!local dst-address-list=!connected-networks connection-mark=no-mark per-connection-classifier=${pccType}:${N}/${index} action=mark-connection new-connection-mark=${wan.iface}_conn passthrough=yes comment="${tagged(`PCC Hotspot auth linea ${wan.index}`)}"`);
            });
            add();
        }

        add('# PCC del tráfico iniciado por el router (DNS, NTP, Winbox saliente, etc.)');
        wans.forEach((wan, index) => {
            add(`add chain=output connection-state=new dst-address-type=!local dst-address-list=!connected-networks connection-mark=no-mark per-connection-classifier=${pccType}:${N}/${index} action=mark-connection new-connection-mark=${wan.iface}_conn passthrough=yes comment="${tagged(`PCC output linea ${wan.index}`)}"`);
        });
        add();

        add('# Convertir connection-mark en routing-mark (todos los paquetes de la conexión)');
        wans.forEach(wan => {
            add(`add chain=prerouting ${lanMatchParam} connection-mark=${wan.iface}_conn dst-address-type=!local dst-address-list=!connected-networks action=mark-routing new-routing-mark=${wan.table} passthrough=no comment="${tagged(`Ruta LAN WAN${wan.index}`)}"`);
        });
        if (hotspotPcc) {
            wans.forEach(wan => {
                add(`add chain=prerouting in-interface=${hotspotInterface} hotspot=auth connection-mark=${wan.iface}_conn dst-address-type=!local dst-address-list=!connected-networks action=mark-routing new-routing-mark=${wan.table} passthrough=no comment="${tagged(`Ruta Hotspot WAN${wan.index}`)}"`);
            });
        }
        wans.forEach(wan => {
            add(`add chain=output connection-mark=${wan.iface}_conn dst-address-list=!connected-networks action=mark-routing new-routing-mark=${wan.table} passthrough=no comment="${tagged(`Ruta output WAN${wan.index}`)}"`);
        });
        add();

        add('# 4. FastTrack: las conexiones marcadas no deben saltarse Mangle');
        add('# Solo se añade un bypass etiquetado; no se altera connection-mark de reglas ajenas.');
        add(':local ftIds [/ip firewall filter find where action=fasttrack-connection]');
        add(':if ([:len $ftIds] > 0) do={');
        add('    :local ftId [:pick $ftIds 0]');
        add(`    /ip firewall filter add chain=forward connection-state=established,related connection-mark=!no-mark action=accept place-before=$ftId comment="${tagged('No FastTrack en conexiones marcadas')}"`);
        add('}');
        add();

        add('# 5. Configurar las rutas IP');
        add('/ip route');

        if (recursive) {
            add('# Rutas de control /32: fuerzan el ping de cada host externo por su WAN (scope=10)');
            wans.forEach(wan => {
                add(`add dst-address=${wan.host}/32 gateway=${nextHop(wan.gateway, wan.iface, { v7: false, fromCustomTable: false })} scope=10 comment="${tagged(`Control recursivo WAN${wan.index}`)}"`);
            });
            add();
        }

        add(`# Enrutar tráfico marcado a sus respectivas ${isV7 ? 'tablas' : 'marcas'} (con failover si cae una línea)`);
        wans.forEach(wan => {
            if (recursive) {
                add(`add dst-address=0.0.0.0/0 gateway=${nextHop(wan.host, null, { v7: isV7, fromCustomTable: true })} check-gateway=ping target-scope=11 distance=1 ${tableParam}=${wan.table} comment="${tagged(`WAN${wan.index} recursiva (su ${isV7 ? 'tabla' : 'marca'})`)}"`);
            } else {
                add(`add dst-address=0.0.0.0/0 gateway=${nextHop(wan.gateway, wan.iface, { v7: isV7, fromCustomTable: true })} distance=1 ${tableParam}=${wan.table} check-gateway=ping comment="${tagged(`WAN${wan.index} primaria (su ${isV7 ? 'tabla' : 'marca'})`)}"`);
            }

            let dist = 2;
            wans.forEach(backup => {
                if (backup.iface === wan.iface) return;
                if (recursive) {
                    add(`add dst-address=0.0.0.0/0 gateway=${nextHop(backup.host, null, { v7: isV7, fromCustomTable: true })} check-gateway=ping target-scope=11 distance=${dist} ${tableParam}=${wan.table} comment="${tagged(`WAN${backup.index} respaldo recursivo en ${isV7 ? 'tabla' : 'marca'} de WAN${wan.index}`)}"`);
                } else {
                    add(`add dst-address=0.0.0.0/0 gateway=${nextHop(backup.gateway, backup.iface, { v7: isV7, fromCustomTable: true })} distance=${dist} ${tableParam}=${wan.table} check-gateway=ping comment="${tagged(`WAN${backup.index} respaldo en ${isV7 ? 'tabla' : 'marca'} de WAN${wan.index}`)}"`);
                }
                dist++;
            });
        });
        add();

        add('# Rutas por defecto en la tabla principal (tráfico no marcado y failover de main)');
        wans.forEach(wan => {
            if (recursive) {
                add(`add dst-address=0.0.0.0/0 gateway=${wan.host} check-gateway=ping target-scope=11 distance=${wan.index} comment="${tagged(`Ruta principal recursiva WAN${wan.index}`)}"`);
            } else {
                add(`add dst-address=0.0.0.0/0 gateway=${nextHop(wan.gateway, wan.iface, { v7: false, fromCustomTable: false })} distance=${wan.index} check-gateway=ping comment="${tagged(`Ruta principal WAN${wan.index}`)}"`);
            }
        });
        add();

        add('# 6. NAT Masquerade por interfaz de salida real');
        add('/ip firewall nat');
        wans.forEach(wan => {
            add(`add chain=srcnat out-interface=${wan.iface} action=masquerade comment="${tagged(`Masquerade WAN${wan.index}`)}"`);
        });
        add();

        add('# ====================================================');
        add(`# Comprueba marcas: /ip firewall mangle print where comment~"${TAG}"`);
        add(`# Comprueba rutas: /ip route print detail where comment~"${TAG}"`);
        add('# Si FastTrack ya tenía conexiones, espera a que expiren o reinicia conntrack.');
        add('# ====================================================');

        return lines.join('\n') + '\n';
    }

    window.MTB.register(definition, generate);
})();
