// App State
let currentScript = '';
let routerOsVersion = 'v7';
const formValues = {}; // Store input values persistency per script
let currentGeneratedCode = ''; // Raw generated script code (prevents HTML tags in copy/download)

// Script Definitions
const scriptDefinitions = {
    pcc: {
        title: "Balanceo PCC (Múltiples WAN)",
        description: "Distribución de tráfico balanceada entre varias conexiones de Internet (2 a 5 WANs) utilizando marcas de ruta.",
        fileName: "mikrotik_pcc_bal.rsc",
        inputs: [
            { 
                id: "wan_count", 
                label: "Cantidad de Líneas WAN", 
                type: "select", 
                options: [
                    { value: "2", label: "2 WANs" },
                    { value: "3", label: "3 WANs" },
                    { value: "4", label: "4 WANs" },
                    { value: "5", label: "5 WANs" }
                ], 
                default: "2",
                hint: "Número de interfaces WAN a balancear"
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
                hint: "Método para identificar los paquetes que vienen de la LAN"
            },
            { id: "lan_interface", label: "Interfaz LAN", type: "text", default: "bridge-lan", hint: "Red local cableada o bridge LAN" },
            { id: "lan_interface_list", label: "Interface List LAN", type: "text", default: "LAN", hint: "Nombre de la Interface List en /interface list" },
            { id: "lan_address_list", label: "Address List LAN", type: "text", default: "PCC-Clients", hint: "Nombre de la Address List en /ip firewall address-list" },
            { id: "lan_network", label: "Red LAN (CIDR)", type: "text", default: "192.168.88.0/24", hint: "Rango local para exclusión de balanceo" },
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
                hint: "Fórmula de clasificación del tráfico"
            }
        ]
    },
    failover: {
        title: "Failover Recursivo (Múltiples WAN)",
        description: "Monitoreo constante de Internet real mediante pings a hosts externos públicos. Si la línea principal cae, se conmuta automáticamente entre las líneas disponibles (2 a 5 WANs).",
        fileName: "mikrotik_failover.rsc",
        inputs: [
            { 
                id: "wan_count", 
                label: "Cantidad de Líneas WAN", 
                type: "select", 
                options: [
                    { value: "2", label: "2 WANs" },
                    { value: "3", label: "3 WANs" },
                    { value: "4", label: "4 WANs" },
                    { value: "5", label: "5 WANs" }
                ], 
                default: "2",
                hint: "Número de interfaces WAN a monitorear"
            }
        ]
    },
    firewall: {
        title: "Firewall Básico Recomendado",
        description: "Reglas esenciales de seguridad para bloquear accesos indebidos desde Internet y proteger el router y tu red interna.",
        fileName: "mikrotik_firewall.rsc",
        inputs: [
            { id: "wan1_interface", label: "Interfaz WAN 1", type: "text", default: "ether1" },
            { id: "wan2_interface", label: "Interfaz WAN 2 (Opcional)", type: "text", default: "", hint: "Dejar en blanco si es una sola WAN" },
            { id: "lan_interface", label: "Interfaz LAN", type: "text", default: "bridge-lan" },
            { id: "enable_fasttrack", label: "Activar FastTrack Connection", type: "checkbox", default: true, hint: "Optimiza tráfico TCP. ¡Desactívalo si usas PCC o Simple Queues!" },
            { id: "protect_winbox", label: "Permitir Acceso Winbox desde WAN", type: "checkbox", default: false, hint: "Abre puerto para administración remota" },
            { id: "winbox_port", label: "Puerto Winbox", type: "text", default: "8291" }
        ]
    },
    "port-forward": {
        title: "Redirección de Puertos (DST-NAT)",
        description: "Abre y redirige un puerto externo de la WAN hacia un servidor interno en la LAN.",
        fileName: "mikrotik_port_forward.rsc",
        inputs: [
            { id: "wan_interface", label: "Interfaz WAN de Entrada", type: "text", default: "ether1" },
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
            { id: "dst_port", label: "Puerto Externo", type: "text", default: "80", hint: "Puerto visible desde Internet" },
            { id: "to_address", label: "IP Servidor Interno", type: "text", default: "192.168.88.10" },
            { id: "to_port", label: "Puerto Interno", type: "text", default: "80", hint: "Puerto local en el servidor" },
            { id: "comment", label: "Comentario", type: "text", default: "Web Server" }
        ]
    },
    "simple-queue": {
        title: "Control de Ancho de Banda (Simple Queues)",
        description: "Limita el consumo de bajada y subida para una dirección IP específica o subred completa.",
        fileName: "mikrotik_simple_queue.rsc",
        inputs: [
            { id: "queue_name", label: "Nombre de la Regla", type: "text", default: "Limitar-Cliente-1" },
            { id: "target_ip", label: "IP/Rango de Red Objetivo", type: "text", default: "192.168.88.254/32", hint: "Ej: 192.168.88.254/32 o 192.168.88.0/24" },
            { id: "max_limit_up", label: "Límite Máximo de Subida", type: "text", default: "10M", hint: "Ej: 10M, 512k (0 = ilimitado)" },
            { id: "max_limit_down", label: "Límite Máximo de Bajada", type: "text", default: "30M", hint: "Ej: 30M, 2M (0 = ilimitado)" },
            { id: "limit_at_up", label: "Garantizado Subida (Limit At)", type: "text", default: "5M", hint: "Velocidad mínima asegurada" },
            { id: "limit_at_down", label: "Garantizado Bajada (Limit At)", type: "text", default: "15M", hint: "Velocidad mínima asegurada" },
            { id: "burst_limit_up", label: "Ráfaga Subida (Burst)", type: "text", default: "0", hint: "0 = desactivar" },
            { id: "burst_limit_down", label: "Ráfaga Bajada (Burst)", type: "text", default: "0", hint: "0 = desactivar" }
        ]
    },
    wireguard: {
        title: "Servidor VPN WireGuard (ROS v7+)",
        description: "Protocolo VPN moderno y de alta velocidad. Nota: Solo disponible a partir de RouterOS v7.",
        fileName: "mikrotik_wireguard.rsc",
        isV7Only: true,
        inputs: [
            { id: "wg_interface", label: "Interfaz WireGuard", type: "text", default: "wg0" },
            { id: "wg_port", label: "Puerto de Escucha UDP", type: "text", default: "13231", hint: "Puerto externo del túnel" },
            { id: "server_ip", label: "IP Local VPN (Router)", type: "text", default: "10.0.0.1/24", hint: "Dirección de red interna de la VPN" },
            { id: "client_name", label: "Nombre de Cliente", type: "text", default: "Celular-Admin" },
            { id: "client_ip", label: "IP Asignada al Cliente", type: "text", default: "10.0.0.2", hint: "IP fija en la subred de la VPN" },
            { id: "client_public_key", label: "Clave Pública del Cliente (Opcional)", type: "text", default: "", hint: "Clave pública generada por el celular/PC" }
        ]
    },
    pppoe: {
        title: "Servidor Concentrador PPPoE",
        description: "Permite autenticar dispositivos clientes a través de un túnel PPPoE con credenciales estáticas.",
        fileName: "mikrotik_pppoe_server.rsc",
        inputs: [
            { id: "pppoe_interface", label: "Interfaz del Servidor", type: "text", default: "bridge-lan", hint: "Puerto local donde escuchará PPPoE" },
            { id: "service_name", label: "Nombre de Servicio PPPoE", type: "text", default: "PPPoE-Server" },
            { id: "pool_name", label: "Nombre del Pool de IPs", type: "text", default: "pppoe-pool" },
            { id: "pool_range", label: "Rango de IPs a entregar", type: "text", default: "192.168.100.10-192.168.100.100" },
            { id: "local_ip", label: "IP del Router (Local Address)", type: "text", default: "192.168.100.1" },
            { id: "dns_servers", label: "Servidores DNS para PPPoE", type: "text", default: "8.8.8.8,1.1.1.1" },
            { id: "profile_name", label: "Nombre del Perfil PPP", type: "text", default: "pppoe-profile" },
            { id: "user_secret", label: "Usuario de Prueba", type: "text", default: "cliente1" },
            { id: "pass_secret", label: "Contraseña", type: "text", default: "contrasena123" }
        ]
    },
    "dns-blacklist": {
        title: "DNS Blacklist (Bloqueador de Anuncios)",
        description: "Redirecciona las consultas de dominios de publicidad o rastreo a direcciones nulas (0.0.0.0) a nivel DNS interno.",
        fileName: "mikrotik_dns_blacklist.rsc",
        inputs: [
            { id: "dns_server", label: "DNS Forwarder Principal", type: "text", default: "8.8.8.8", hint: "Servidor DNS para resolver sitios buenos" },
            { id: "redirect_ip", label: "IP de Bloqueo", type: "text", default: "0.0.0.0", hint: "Generalmente 0.0.0.0 o 127.0.0.1" },
            { id: "block_domains", label: "Dominios a Bloquear (Uno por línea)", type: "textarea", default: "ads.google.com\ndoubleclick.net\nfacebook.com\ntiktok.com\nadservice.google.com\nanalytics.google.com", hint: "Ingresa la lista de hostnames" }
        ]
    }
};

// Template Generator Functions
const generators = {
    pcc: (inputs, version) => {
        const isV7 = version === 'v7';
        const N = parseInt(inputs.wan_count || 2);
        
        const matchType = inputs.lan_match_type || 'in-interface';
        let lanMatchParam = '';
        if (matchType === 'in-interface') {
            lanMatchParam = `in-interface=${inputs.lan_interface || 'bridge-lan'}`;
        } else if (matchType === 'in-interface-list') {
            lanMatchParam = `in-interface-list=${inputs.lan_interface_list || 'LAN'}`;
        } else if (matchType === 'src-address-list') {
            lanMatchParam = `src-address-list=${inputs.lan_address_list || 'PCC-Clients'}`;
        }

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Balanceo PCC (Per Connection Classifier) - ${N} WANs\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`;
        code += `# Compatible con cualquier Routerboard (Ajusta los nombres de interfaces)\n`;
        code += `# ====================================================\n\n`;

        if (isV7) {
            code += `# 1. Crear las tablas de enrutamiento con FIB en v7\n`;
            code += `/routing table\n`;
            for (let i = 1; i <= N; i++) {
                const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
                code += `add name=to_${wanInterface} fib\n`;
            }
            code += `\n`;
        }

        code += `# 2. Crear Address List de la red local para evitar balancear tráfico interno LAN-LAN\n`;
        code += `/ip firewall address-list\n`;
        code += `add address=${inputs.lan_network} list=local-network\n\n`;

        code += `# 3. Reglas de Mangle (Exclusión local y clasificación de tráfico)\n`;
        code += `/ip firewall mangle\n`;
        code += `# Aceptar tráfico local sin marcar\n`;
        code += `add chain=prerouting dst-address-list=local-network ${lanMatchParam} action=accept comment="Excluir trafico interno LAN"\n\n`;

        code += `# Mantener las conexiones entrantes en su respectiva interfaz WAN de origen\n`;
        for (let i = 1; i <= N; i++) {
            const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
            code += `add chain=prerouting in-interface=${wanInterface} connection-mark=no-mark action=mark-connection new-connection-mark=${wanInterface}_conn passthrough=yes comment="Fijar WAN${i}"\n`;
        }
        code += `\n`;

        code += `# División PCC: Asigna conexiones a interfaces WAN de forma equitativa (${inputs.pcc_type})\n`;
        for (let i = 1; i <= N; i++) {
            const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
            code += `add chain=prerouting ${lanMatchParam} dst-address-type=!local connection-mark=no-mark per-connection-classifier=${inputs.pcc_type}:${N}/${i-1} action=mark-connection new-connection-mark=${wanInterface}_conn passthrough=yes comment="PCC Linea ${i}"\n`;
        }
        code += `\n`;

        code += `# Marcar rutas basadas en las conexiones marcadas anteriormente para clientes LAN\n`;
        for (let i = 1; i <= N; i++) {
            const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
            code += `add chain=prerouting ${lanMatchParam} connection-mark=${wanInterface}_conn action=mark-routing new-routing-mark=to_${wanInterface} passthrough=yes\n`;
        }
        code += `\n`;

        code += `# Marcar rutas para el tráfico propio generado por el router\n`;
        for (let i = 1; i <= N; i++) {
            const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
            code += `add chain=output connection-mark=${wanInterface}_conn action=mark-routing new-routing-mark=to_${wanInterface} passthrough=yes\n`;
        }
        code += `\n`;

        code += `# 4. Configurar las rutas IP\n`;
        code += `/ip route\n`;
        if (isV7) {
            code += `# Enrutar tráfico marcado a sus respectivas tablas (con failover si cae una línea)\n`;
            for (let i = 1; i <= N; i++) {
                const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
                const wanGateway = inputs[`wan${i}_gateway`] || `192.168.${i}.1`;
                code += `add dst-address=0.0.0.0/0 gateway=${wanGateway} distance=1 routing-table=to_${wanInterface} check-gateway=ping comment="WAN${i} Primaria en su tabla"\n`;
                
                // Backup routes in the custom table
                let dist = 2;
                for (let j = 1; j <= N; j++) {
                    if (j === i) continue;
                    const backupGateway = inputs[`wan${j}_gateway`] || `192.168.${j}.1`;
                    code += `add dst-address=0.0.0.0/0 gateway=${backupGateway} distance=${dist} routing-table=to_${wanInterface} check-gateway=ping comment="WAN${j} Respaldo en tabla de WAN${i}"\n`;
                    dist++;
                }
            }
            code += `\n`;
            code += `# Rutas por defecto en la tabla principal (con distancias para failover si cae una línea completa)\n`;
            for (let i = 1; i <= N; i++) {
                const wanGateway = inputs[`wan${i}_gateway`] || `192.168.${i}.1`;
                code += `add dst-address=0.0.0.0/0 gateway=${wanGateway} distance=${i} check-gateway=ping comment="Ruta Principal WAN${i}"\n`;
            }
        } else {
            code += `# Enrutar tráfico marcado a sus respectivas marcas de ruta (v6 con failover)\n`;
            for (let i = 1; i <= N; i++) {
                const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
                const wanGateway = inputs[`wan${i}_gateway`] || `192.168.${i}.1`;
                code += `add dst-address=0.0.0.0/0 gateway=${wanGateway} distance=1 routing-mark=to_${wanInterface} check-gateway=ping comment="WAN${i} Primaria en su marca"\n`;
                
                // Backup routes in the custom routing mark
                let dist = 2;
                for (let j = 1; j <= N; j++) {
                    if (j === i) continue;
                    const backupGateway = inputs[`wan${j}_gateway`] || `192.168.${j}.1`;
                    code += `add dst-address=0.0.0.0/0 gateway=${backupGateway} distance=${dist} routing-mark=to_${wanInterface} check-gateway=ping comment="WAN${j} Respaldo en marca de WAN${i}"\n`;
                    dist++;
                }
            }
            code += `\n`;
            code += `# Rutas por defecto en la tabla principal (con distancias para failover si cae una línea completa)\n`;
            for (let i = 1; i <= N; i++) {
                const wanGateway = inputs[`wan${i}_gateway`] || `192.168.${i}.1`;
                code += `add dst-address=0.0.0.0/0 gateway=${wanGateway} distance=${i} check-gateway=ping comment="Ruta Principal WAN${i}"\n`;
            }
        }

        code += `\n# 5. NAT Masquerade (Para dar acceso a internet a través de cada puerto WAN)\n`;
        code += `/ip firewall nat\n`;
        for (let i = 1; i <= N; i++) {
            const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
            code += `add chain=srcnat out-interface=${wanInterface} action=masquerade comment="Masquerade WAN${i}"\n`;
        }

        return code;
    },
    failover: (inputs, version) => {
        const isV7 = version === 'v7';
        const N = parseInt(inputs.wan_count || 2);
        const hostDefaults = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222", "8.8.4.4"];

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Failover Recursivo con Múltiples WAN (${N} WANs)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Compatible con cualquier Routerboard\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Configurar rutas principales condicionadas por hosts de internet\n`;
        code += `/ip route\n`;

        code += `# Rutas virtuales recursivas que comprueban conexión real\n`;
        for (let i = 1; i <= N; i++) {
            const pingHost = inputs[`ping_host${i}`] || hostDefaults[i - 1] || "8.8.8.8";
            code += `add gateway=${pingHost} check-gateway=ping distance=${i} target-scope=30 comment="WAN${i} Recursivo Primario"\n`;
        }
        code += `\n`;

        code += `# Rutas físicas fijas para forzar el ping a los hosts de prueba por la WAN correcta\n`;
        if (isV7) {
            code += `# En v7, el scope debe permitir la resolución recursiva (scope=10 target-scope=11)\n`;
            for (let i = 1; i <= N; i++) {
                const pingHost = inputs[`ping_host${i}`] || hostDefaults[i - 1] || "8.8.8.8";
                const wanGateway = inputs[`wan${i}_gateway`] || `192.168.${i}.1`;
                code += `add dst-address=${pingHost}/32 gateway=${wanGateway} scope=10 target-scope=11 comment="Ruta de control Host ${i} por WAN ${i}"\n`;
            }
        } else {
            for (let i = 1; i <= N; i++) {
                const pingHost = inputs[`ping_host${i}`] || hostDefaults[i - 1] || "8.8.8.8";
                const wanGateway = inputs[`wan${i}_gateway`] || `192.168.${i}.1`;
                code += `add dst-address=${pingHost}/32 gateway=${wanGateway} scope=10 target-scope=10 comment="Ruta de control Host ${i} por WAN ${i}"\n`;
            }
        }

        code += `\n# 2. Configurar NAT Masquerade para todas las interfaces WAN\n`;
        code += `/ip firewall nat\n`;
        for (let i = 1; i <= N; i++) {
            const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
            code += `add chain=srcnat out-interface=${wanInterface} action=masquerade comment="Masquerade WAN${i}"\n`;
        }

        return code;
    },
    firewall: (inputs, version) => {
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Firewall Básico y Seguridad\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Compatible con cualquier hardware\n`;
        code += `# ====================================================\n\n`;

        code += `/ip firewall filter\n`;
        code += `# ====================================================\n`;
        code += `# 1. CADENA INPUT (Tráfico hacia el propio Router)\n`;
        code += `# ====================================================\n`;
        code += `add chain=input action=accept connection-state=established,related comment="Aceptar conexiones establecidas y relacionadas"\n`;
        code += `add chain=input action=drop connection-state=invalid comment="Descartar conexiones invalidas"\n`;
        code += `add chain=input action=accept protocol=icmp comment="Permitir ping (ICMP)"\n`;
        
        if (inputs.protect_winbox) {
            code += `add chain=input action=accept protocol=tcp dst-port=${inputs.winbox_port} comment="Permitir Winbox desde internet"\n`;
        }
        
        code += `add chain=input action=accept in-interface=${inputs.lan_interface} comment="Permitir acceso completo desde LAN"\n`;
        code += `add chain=input action=drop comment="Bloquear todos los demas accesos desde el exterior"\n\n`;

        code += `# ====================================================\n`;
        code += `# 2. CADENA FORWARD (Tráfico que cruza el Router de una red a otra)\n`;
        code += `# ====================================================\n`;
        
        if (inputs.enable_fasttrack) {
            code += `# Acelera navegación TCP de paquetes establecidos. ADVERTENCIA: Evita Mangle (rompe PCC y Queues simple).\n`;
            code += `add chain=forward action=fasttrack-connection connection-state=established,related comment="FastTrack para maximizar rendimiento"\n`;
        }
        
        code += `add chain=forward action=accept connection-state=established,related comment="Aceptar conexiones establecidas y relacionadas"\n`;
        code += `add chain=forward action=drop connection-state=invalid comment="Descartar conexiones invalidas"\n`;
        code += `add chain=forward action=accept in-interface=${inputs.lan_interface} comment="Permitir salida de LAN a internet"\n`;
        code += `add chain=forward action=accept connection-state=new connection-nat-state=dstnat comment="Permitir reenvio de puertos (DST-NAT)"\n`;
        code += `add chain=forward action=drop comment="Bloquear todo lo demas en Forward (Seguridad total)"\n\n`;

        code += `# ====================================================\n`;
        code += `# 3. ENMASCARAMIENTO NAT (Masquerade)\n`;
        code += `# ====================================================\n`;
        code += `/ip firewall nat\n`;
        code += `add chain=srcnat out-interface=${inputs.wan1_interface} action=masquerade comment="Masquerade WAN1"\n`;
        
        if (inputs.wan2_interface && inputs.wan2_interface.trim() !== '') {
            code += `add chain=srcnat out-interface=${inputs.wan2_interface} action=masquerade comment="Masquerade WAN2"\n`;
        }

        return code;
    },
    "port-forward": (inputs, version) => {
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Redirección de Puertos (DST-NAT)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;

        code += `/ip firewall nat\n`;
        code += `add chain=dstnat action=dst-nat to-addresses=${inputs.to_address} to-ports=${inputs.to_port} protocol=${inputs.protocol} in-interface=${inputs.wan_interface} dst-port=${inputs.dst_port} comment="${inputs.comment}"\n\n`;
        
        code += `# NOTA: Asegúrate de tener una regla en '/ip firewall filter' que permita reenviar tráfico NAT en forward:\n`;
        code += `# /ip firewall filter add chain=forward action=accept connection-nat-state=dstnat comment="Permitir trafico redireccionado"\n`;
        
        return code;
    },
    "simple-queue": (inputs, version) => {
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Control de Ancho de Banda (Simple Queue)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;

        code += `/queue simple\n`;
        code += `add name="${inputs.queue_name}" \\\n`;
        code += `    target=${inputs.target_ip} \\\n`;
        code += `    max-limit=${inputs.max_limit_up}/${inputs.max_limit_down} \\\n`;
        code += `    limit-at=${inputs.limit_at_up}/${inputs.limit_at_down} \\\n`;
        code += `    burst-limit=${inputs.burst_limit_up}/${inputs.burst_limit_down} \\\n`;
        code += `    queue=default-small/default-small comment="Cola Generada Reactivamente"\n`;

        return code;
    },
    wireguard: (inputs, version) => {
        if (version === 'v6') {
            return `# ====================================================\n# ERROR: WIREGUARD NO DISPONIBLE EN RouterOS v6\n# ====================================================\n# WireGuard es un protocolo VPN nativo a partir de RouterOS v7.\n# Por favor, cambia el selector de RouterOS arriba a la derecha a 'v7' para generar el script.`;
        }
        
        const clientPub = inputs.client_public_key.trim() || "<CLAVE_PUBLICA_DEL_CLIENTE_AQUÍ>";
        
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Servidor VPN WireGuard (Solo RouterOS v7+)\n`;
        code += `# RouterOS Version: v7\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Crear la interfaz WireGuard en el Router (Genera llaves automáticas en el router)\n`;
        code += `/interface wireguard\n`;
        code += `add name=${inputs.wg_interface} listen-port=${inputs.wg_port} comment="Servidor VPN Principal Wireguard"\n\n`;

        code += `# 2. Asignar IP al Router dentro del túnel VPN\n`;
        code += `/ip address\n`;
        code += `add address=${inputs.server_ip} interface=${inputs.wg_interface} comment="Red IP del Tunel VPN"\n\n`;

        code += `# 3. Registrar al cliente (Peer) en el router\n`;
        code += `/interface wireguard peers\n`;
        code += `add interface=${inputs.wg_interface} public-key="${clientPub}" allowed-address=${inputs.client_ip}/32 comment="${inputs.client_name}"\n\n`;

        code += `# 4. Permitir el tráfico en el Firewall\n`;
        code += `/ip firewall filter\n`;
        code += `add chain=input action=accept protocol=udp dst-port=${inputs.wg_port} comment="Permitir conexion de entrada Wireguard"\n`;
        code += `add chain=forward action=accept in-interface=${inputs.wg_interface} comment="Permitir navegacion interna de clientes VPN"\n\n`;

        code += `# ====================================================\n`;
        code += `# CONFIGURACIÓN SUGERIDA PARA EL DISPOSITIVO CLIENTE (${inputs.client_name})\n`;
        code += `# Importa esto en la App cliente (iOS/Android/Windows/macOS)\n`;
        code += `# ====================================================\n`;
        code += `# [Interface]\n`;
        code += `# PrivateKey = <CLAVE_PRIVADA_DEL_CLIENTE_CELULAR_O_PC>\n`;
        code += `# Address = ${inputs.client_ip}/24\n`;
        code += `# DNS = 1.1.1.1, 8.8.8.8\n`;
        code += `# \n`;
        code += `# [Peer]\n`;
        code += `# PublicKey = <CLAVE_PUBLICA_QUE_GENERO_EL_ROUTER_MIKROTIK_EN_WG0>\n`;
        code += `# Endpoint = tu_ip_publica_o_ddns.net:${inputs.wg_port}\n`;
        code += `# AllowedIPs = 0.0.0.0/0 (Toda la navegación cifrada) o 10.0.0.0/24 (Solo tráfico al router)\n`;
        code += `# ====================================================\n`;

        return code;
    },
    pppoe: (inputs, version) => {
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Servidor Concentrador PPPoE\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Crear Pool de direcciones IP para la asignación de clientes\n`;
        code += `/ip pool\n`;
        code += `add name=${inputs.pool_name} ranges=${inputs.pool_range}\n\n`;

        code += `# 2. Configurar perfil PPP de navegación\n`;
        code += `/ppp profile\n`;
        code += `add name=${inputs.profile_name} local-address=${inputs.local_ip} remote-address=${inputs.pool_name} dns-server=${inputs.dns_servers} comment="Perfil Clientes PPPoE"\n\n`;

        code += `# 3. Activar el servicio PPPoE Server en la interfaz designada (LAN)\n`;
        code += `/interface pppoe-server server\n`;
        code += `add service-name=${inputs.service_name} interface=${inputs.pppoe_interface} max-mtu=1492 max-mru=1492 default-profile=${inputs.profile_name} one-session=yes disabled=no\n\n`;

        code += `# 4. Agregar cuenta de cliente (Secrets / Usuario y Contraseña)\n`;
        code += `/ppp secret\n`;
        code += `add name="${inputs.user_secret}" password="${inputs.pass_secret}" profile=${inputs.profile_name} service=pppoe comment="Cliente Inicial"\n`;

        return code;
    },
    "dns-blacklist": (inputs, version) => {
        let code = `# ====================================================\n`;
        code += `# SCRIPT: DNS Blacklist (Bloqueador de Anuncios y Spammers)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Configurar servidor DNS principal y habilitar consultas remotas\n`;
        code += `/ip dns set allow-remote-requests=yes servers=${inputs.dns_server}\n\n`;

        code += `# 2. Cargar entradas DNS estáticas que redirigen a IP nula\n`;
        code += `/ip dns static\n`;

        const domains = inputs.block_domains.split('\n');
        let count = 0;
        domains.forEach(domain => {
            const trimmed = domain.trim();
            if (trimmed) {
                code += `add name="${trimmed}" address=${inputs.redirect_ip} comment="DNS-Blacklist"\n`;
                count++;
            }
        });

        code += `\n# Cantidad de dominios bloqueados estáticos: ${count}\n`;
        code += `# RECOMENDACIÓN: Redirige forzadamente el tráfico DNS de tus clientes al Router:\n`;
        code += `# /ip firewall nat add chain=dstnat protocol=udp dst-port=53 action=redirect to-ports=53 comment="Redirect DNS"\n`;

        return code;
    }
};

// Syntax Highlighter for RouterOS scripting language (single-pass to prevent nested tag corruption)
function highlightRSC(code) {
    // Escape HTML symbols first
    let escaped = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Regex matching:
    // Group 1: Comment (starts with #)
    // Group 2: String (starts with ")
    // Group 3: Command (starts with / followed by word characters or slashes/dashes)
    // Group 4: Variable (starts with $)
    // Group 5: Parameter key (word before =) and optional value (word after = matches in group 6)
    const regex = /(#[^\n]*)|(".*?")|(\/[a-zA-Z0-9\-\/]+)|(\$[a-zA-Z0-9_]+)|([a-zA-Z0-9\-]+)=([a-zA-Z0-9\.\-\/\\:_]+)?/g;

    return escaped.replace(regex, (match, comment, string, command, variable, paramKey, paramValue) => {
        if (comment !== undefined) {
            return `<span class="mt-comment">${comment}</span>`;
        }
        if (string !== undefined) {
            return `<span class="mt-string">${string}</span>`;
        }
        if (command !== undefined) {
            return `<span class="mt-command">${command}</span>`;
        }
        if (variable !== undefined) {
            return `<span class="mt-variable">${variable}</span>`;
        }
        if (paramKey !== undefined) {
            if (paramValue !== undefined) {
                return `<span class="mt-param">${paramKey}</span>=<span class="mt-value">${paramValue}</span>`;
            }
            return `<span class="mt-param">${paramKey}</span>=`;
        }
        return match;
    });
}

// Generate Line Numbers
function updateLineNumbers(code) {
    const lines = code.split('\n').length;
    const numbersContainer = document.getElementById('code-line-numbers');
    if (!numbersContainer) return;
    let numbersHtml = '';
    for (let i = 1; i <= lines; i++) {
        numbersHtml += `${i}<br>`;
    }
    numbersContainer.innerHTML = numbersHtml;
}

// Main logic to update generated code in preview pane
function updateScript() {
    const def = scriptDefinitions[currentScript];
    if (!def) return;

    // Gather inputs from the dynamic form
    const currentInputs = {};
    
    // First, read static inputs
    def.inputs.forEach(input => {
        const el = document.getElementById(input.id);
        if (el) {
            if (input.type === 'checkbox') {
                currentInputs[input.id] = el.checked;
                formValues[`${currentScript}_${input.id}`] = el.checked;
            } else {
                currentInputs[input.id] = el.value;
                formValues[`${currentScript}_${input.id}`] = el.value;
            }
        } else {
            // Fallback to default
            currentInputs[input.id] = formValues[`${currentScript}_${input.id}`] !== undefined 
                ? formValues[`${currentScript}_${input.id}`] 
                : (input.default !== undefined ? input.default : '');
        }
    });

    // If it's pcc or failover, read the dynamic WAN inputs from DOM or formValues
    if (currentScript === 'pcc' || currentScript === 'failover') {
        const wanCount = parseInt(currentInputs.wan_count || 2);
        const hostDefaults = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222", "8.8.4.4"];
        
        for (let i = 1; i <= wanCount; i++) {
            const interfaceId = `wan${i}_interface`;
            const gatewayId = `wan${i}_gateway`;
            
            const interfaceEl = document.getElementById(interfaceId);
            if (interfaceEl) {
                currentInputs[interfaceId] = interfaceEl.value;
                formValues[`${currentScript}_${interfaceId}`] = interfaceEl.value;
            } else {
                currentInputs[interfaceId] = formValues[`${currentScript}_${interfaceId}`] !== undefined
                    ? formValues[`${currentScript}_${interfaceId}`]
                    : `ether${i}`;
            }

            const gatewayEl = document.getElementById(gatewayId);
            if (gatewayEl) {
                currentInputs[gatewayId] = gatewayEl.value;
                formValues[`${currentScript}_${gatewayId}`] = gatewayEl.value;
            } else {
                currentInputs[gatewayId] = formValues[`${currentScript}_${gatewayId}`] !== undefined
                    ? formValues[`${currentScript}_${gatewayId}`]
                    : `192.168.${i}.1`;
            }

            if (currentScript === 'failover') {
                const hostId = `ping_host${i}`;
                const hostEl = document.getElementById(hostId);
                if (hostEl) {
                    currentInputs[hostId] = hostEl.value;
                    formValues[`${currentScript}_${hostId}`] = hostEl.value;
                } else {
                    currentInputs[hostId] = formValues[`${currentScript}_${hostId}`] !== undefined
                        ? formValues[`${currentScript}_${hostId}`]
                        : (hostDefaults[i - 1] || "8.8.8.8");
                }
            }
        }
    }

    // Generate code
    const generator = generators[currentScript];
    if (generator) {
        currentGeneratedCode = generator(currentInputs, routerOsVersion);
    } else {
        currentGeneratedCode = '# Error: Generador no definido.';
    }

    // Highlight and render code
    const highlighted = highlightRSC(currentGeneratedCode);
    const codeOutputEl = document.getElementById('code-output');
    if (codeOutputEl) codeOutputEl.innerHTML = highlighted;
    
    // Set file name
    const fileNameEl = document.getElementById('script-file-name');
    if (fileNameEl) fileNameEl.innerText = def.fileName;
    
    // Update line numbers
    updateLineNumbers(currentGeneratedCode);
}

// Initialize dynamic WAN inputs in formValues
function initializeFormValues(scriptKey) {
    const def = scriptDefinitions[scriptKey];
    if (!def) return;

    def.inputs.forEach(input => {
        const key = `${scriptKey}_${input.id}`;
        if (formValues[key] === undefined) {
            formValues[key] = input.default;
        }
    });

    // If it's pcc or failover, initialize the dynamic WAN inputs as well
    if (scriptKey === 'pcc' || scriptKey === 'failover') {
        const wanCountKey = `${scriptKey}_wan_count`;
        if (formValues[wanCountKey] === undefined) {
            formValues[wanCountKey] = "2";
        }
        const hostDefaults = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222", "8.8.4.4"];
        for (let i = 1; i <= 5; i++) {
            const wanInterfaceKey = `${scriptKey}_wan${i}_interface`;
            const wanGatewayKey = `${scriptKey}_wan${i}_gateway`;
            
            if (formValues[wanInterfaceKey] === undefined) {
                formValues[wanInterfaceKey] = `ether${i}`;
            }
            if (formValues[wanGatewayKey] === undefined) {
                formValues[wanGatewayKey] = `192.168.${i}.1`;
            }
            
            if (scriptKey === 'failover') {
                const pingHostKey = `${scriptKey}_ping_host${i}`;
                if (formValues[pingHostKey] === undefined) {
                    formValues[pingHostKey] = hostDefaults[i - 1] || "8.8.8.8";
                }
            }
        }
    }
}

// Dynamically render configuration input fields
function renderInputs() {
    const def = scriptDefinitions[currentScript];
    const container = document.getElementById('dynamic-inputs');
    if (!container || !def) return;
    
    container.innerHTML = ''; // Clear

    // Special banner for v7 only scripts
    if (def.isV7Only && routerOsVersion === 'v6') {
        const warning = document.createElement('div');
        warning.className = 'warning-box';
        warning.innerHTML = `
            <strong>Requiere RouterOS v7</strong>
            Este script utiliza funciones de VPN WireGuard que solo existen en la versión v7. Cambia el selector de RouterOS arriba a la derecha a 'v7' para configurarlo.
        `;
        container.appendChild(warning);
        return;
    }

    // Special warning about FastTrack conflict in Firewall + PCC/Queues
    if (currentScript === 'firewall') {
        const info = document.createElement('div');
        info.className = 'info-box';
        info.innerHTML = `
            <strong>Tip Pro:</strong> Si piensas usar colas simples (Simple Queues) o Balanceo PCC, se recomienda desactivar <em>FastTrack</em>, ya que este atajo del kernel se salta las marcas de mangle y de colas.
        `;
        container.appendChild(info);
    }

    def.inputs.forEach(input => {
        // Skip inputs that are conditionally hidden in PCC based on LAN match type
        if (currentScript === 'pcc') {
            const matchType = formValues['pcc_lan_match_type'] || 'in-interface';
            if (input.id === 'lan_interface' && matchType !== 'in-interface') return;
            if (input.id === 'lan_interface_list' && matchType !== 'in-interface-list') return;
            if (input.id === 'lan_address_list' && matchType !== 'src-address-list') return;
        }

        const group = document.createElement('div');
        
        // Retrieve stored value or default
        const storedVal = formValues[`${currentScript}_${input.id}`];
        const val = storedVal !== undefined ? storedVal : (input.default !== undefined ? input.default : '');

        if (input.type === 'checkbox') {
            group.className = 'form-group checkbox-group';
            group.innerHTML = `
                <input type="checkbox" id="${input.id}" ${val ? 'checked' : ''}>
                <label for="${input.id}">
                    ${input.label}
                    ${input.hint ? `<span class="hint">${input.hint}</span>` : ''}
                </label>
            `;
            const checkbox = group.querySelector('input');
            checkbox.addEventListener('change', () => {
                formValues[`${currentScript}_${input.id}`] = checkbox.checked;
                updateScript();
            });
        } else if (input.type === 'select') {
            group.className = 'form-group';
            let optionsHtml = '';
            input.options.forEach(opt => {
                optionsHtml += `<option value="${opt.value}" ${opt.value == val ? 'selected' : ''}>${opt.label}</option>`;
            });
            group.innerHTML = `
                <label for="${input.id}">
                    ${input.label}
                    ${input.hint ? `<span class="hint">${input.hint}</span>` : ''}
                </label>
                <select id="${input.id}" class="form-control">
                    ${optionsHtml}
                </select>
            `;
            const select = group.querySelector('select');
            select.addEventListener('change', () => {
                formValues[`${currentScript}_${input.id}`] = select.value;
                if (input.id === 'wan_count' || input.id === 'lan_match_type') {
                    renderInputs();
                }
                updateScript();
            });
        } else if (input.type === 'textarea') {
            group.className = 'form-group';
            group.innerHTML = `
                <label for="${input.id}">
                    ${input.label}
                    ${input.hint ? `<span class="hint">${input.hint}</span>` : ''}
                </label>
                <textarea id="${input.id}" class="form-control" rows="6">${val}</textarea>
            `;
            const textarea = group.querySelector('textarea');
            textarea.addEventListener('input', () => {
                formValues[`${currentScript}_${input.id}`] = textarea.value;
                updateScript();
            });
        } else {
            // Text inputs
            group.className = 'form-group';
            group.innerHTML = `
                <label for="${input.id}">
                    ${input.label}
                    ${input.hint ? `<span class="hint">${input.hint}</span>` : ''}
                </label>
                <input type="text" id="${input.id}" class="form-control" value="${val}" placeholder="${input.default || ''}">
            `;
            const textInput = group.querySelector('input');
            textInput.addEventListener('input', () => {
                formValues[`${currentScript}_${input.id}`] = textInput.value;
                updateScript();
            });
        }

        container.appendChild(group);

        // If this input was 'wan_count', render the dynamic WAN inputs right after it
        if (input.id === 'wan_count') {
            const N = parseInt(val);
            const hostDefaults = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222", "8.8.4.4"];
            
            // Create a sub-container for dynamic WAN fields
            const wanFieldsContainer = document.createElement('div');
            wanFieldsContainer.className = 'dynamic-wan-fields';
            wanFieldsContainer.style.display = 'flex';
            wanFieldsContainer.style.flexDirection = 'column';
            wanFieldsContainer.style.gap = '16px';
            wanFieldsContainer.style.marginTop = '16px';
            wanFieldsContainer.style.padding = '12px';
            wanFieldsContainer.style.borderLeft = '2px solid var(--primary)';
            wanFieldsContainer.style.background = 'rgba(255, 255, 255, 0.01)';
            
            for (let i = 1; i <= N; i++) {
                const subheader = document.createElement('h4');
                subheader.innerText = `Línea WAN ${i}`;
                subheader.style.fontSize = '0.9rem';
                subheader.style.color = 'var(--primary)';
                subheader.style.marginTop = i > 1 ? '12px' : '0';
                wanFieldsContainer.appendChild(subheader);

                // WAN Interface
                const interfaceId = `wan${i}_interface`;
                const interfaceVal = formValues[`${currentScript}_${interfaceId}`] !== undefined 
                    ? formValues[`${currentScript}_${interfaceId}`] 
                    : `ether${i}`;
                
                const interfaceGroup = document.createElement('div');
                interfaceGroup.className = 'form-group';
                interfaceGroup.innerHTML = `
                    <label for="${interfaceId}">Interfaz WAN ${i}</label>
                    <input type="text" id="${interfaceId}" class="form-control" value="${interfaceVal}">
                `;
                const interfaceInput = interfaceGroup.querySelector('input');
                interfaceInput.addEventListener('input', () => {
                    formValues[`${currentScript}_${interfaceId}`] = interfaceInput.value;
                    updateScript();
                });
                wanFieldsContainer.appendChild(interfaceGroup);

                // WAN Gateway
                const gatewayId = `wan${i}_gateway`;
                const gatewayVal = formValues[`${currentScript}_${gatewayId}`] !== undefined 
                    ? formValues[`${currentScript}_${gatewayId}`] 
                    : `192.168.${i}.1`;

                const gatewayGroup = document.createElement('div');
                gatewayGroup.className = 'form-group';
                gatewayGroup.innerHTML = `
                    <label for="${gatewayId}">Gateway WAN ${i}</label>
                    <input type="text" id="${gatewayId}" class="form-control" value="${gatewayVal}">
                `;
                const gatewayInput = gatewayGroup.querySelector('input');
                gatewayInput.addEventListener('input', () => {
                    formValues[`${currentScript}_${gatewayId}`] = gatewayInput.value;
                    updateScript();
                });
                wanFieldsContainer.appendChild(gatewayGroup);

                // If failover, add the monitoring host field
                if (currentScript === 'failover') {
                    const hostId = `ping_host${i}`;
                    const hostVal = formValues[`${currentScript}_${hostId}`] !== undefined 
                        ? formValues[`${currentScript}_${hostId}`] 
                        : (hostDefaults[i - 1] || "8.8.8.8");

                    const hostGroup = document.createElement('div');
                    hostGroup.className = 'form-group';
                    hostGroup.innerHTML = `
                        <label for="${hostId}">Host Monitoreo WAN ${i}</label>
                        <input type="text" id="${hostId}" class="form-control" value="${hostVal}">
                    `;
                    const hostInput = hostGroup.querySelector('input');
                    hostInput.addEventListener('input', () => {
                        formValues[`${currentScript}_${hostId}`] = hostInput.value;
                        updateScript();
                    });
                    wanFieldsContainer.appendChild(hostGroup);
                }
            }
            container.appendChild(wanFieldsContainer);
        }
    });
}

// Copy Code to Clipboard Function
function copyToClipboard() {
    navigator.clipboard.writeText(currentGeneratedCode).then(() => {
        const copyBtn = document.getElementById('btn-copy');
        if (!copyBtn) return;
        copyBtn.classList.add('copied');
        copyBtn.querySelector('.btn-text').innerText = '¡Copiado!';
        copyBtn.querySelector('.btn-icon').innerText = '✅';
        
        setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.querySelector('.btn-text').innerText = 'Copiar';
            copyBtn.querySelector('.btn-icon').innerText = '📋';
        }, 2000);
    }).catch(err => {
        console.error('Error al copiar al portapapeles: ', err);
    });
}

// Download script as file
function downloadScript() {
    const def = scriptDefinitions[currentScript];
    const fileName = def ? def.fileName : 'mikrotik_script.rsc';
    
    const blob = new Blob([currentGeneratedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Initialize app on page load
window.addEventListener('DOMContentLoaded', () => {
    // Detect which script this page represents
    const pageScript = document.body.getAttribute('data-script');
    
    // If not on an editor page, we are on index.html
    if (!pageScript) {
        // Main page card animations could be initialized here if needed
        return;
    }

    // If on an editor page, initialize state
    currentScript = pageScript;

    // Set initial values from defaults to formValues
    Object.keys(scriptDefinitions).forEach(key => {
        initializeFormValues(key);
    });

    // Check version radio state
    const selectedVersionRadio = document.querySelector('input[name="routeros-version"]:checked');
    if (selectedVersionRadio) {
        routerOsVersion = selectedVersionRadio.value;
    }

    // Re-bind change events for version radio
    document.querySelectorAll('input[name="routeros-version"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            routerOsVersion = e.target.value;
            renderInputs();
            updateScript();
        });
    });

    // Setup action buttons
    const btnCopy = document.getElementById('btn-copy');
    if (btnCopy) btnCopy.addEventListener('click', copyToClipboard);

    const btnDownload = document.getElementById('btn-download');
    if (btnDownload) btnDownload.addEventListener('click', downloadScript);

    // Initial render and script calculation
    const def = scriptDefinitions[currentScript];
    if (def) {
        // Write dynamic metadata just in case (SEO/fallback)
        const titleEl = document.getElementById('current-script-title');
        const descEl = document.getElementById('current-script-description');
        if (titleEl) titleEl.innerText = def.title;
        if (descEl) descEl.innerText = def.description;
        
        renderInputs();
        updateScript();
    }
});
