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
    },
    dhcp: {
        title: "Servidor DHCP + Reservas Estáticas",
        description: "Configura un servidor DHCP completo: pool, network, gateway, DNS y bindings MAC→IP para asignar IPs fijas a dispositivos por su dirección MAC.",
        fileName: "mikrotik_dhcp.rsc",
        inputs: [
            { id: "dhcp_interface", label: "Interfaz LAN/Bridge", type: "text", default: "bridge-lan", hint: "Interfaz donde escuchará el DHCP server" },
            { id: "dhcp_network", label: "Red LAN (CIDR)", type: "text", default: "192.168.88.0/24" },
            { id: "dhcp_gateway", label: "Gateway de la red", type: "text", default: "192.168.88.1", hint: "IP del router en la LAN" },
            { id: "pool_start", label: "Inicio del Pool", type: "text", default: "192.168.88.10" },
            { id: "pool_end", label: "Fin del Pool", type: "text", default: "192.168.88.254" },
            { id: "dns_servers", label: "Servidores DNS", type: "text", default: "192.168.88.1,1.1.1.1", hint: "Separados por coma. Usa la IP del router para usar su DNS cache" },
            { id: "lease_time", label: "Tiempo de Lease", type: "text", default: "1d", hint: "Ej: 10m, 1h, 1d, 1w" },
            { id: "pool_name", label: "Nombre del Pool", type: "text", default: "dhcp-pool" },
            { id: "server_name", label: "Nombre del Servidor DHCP", type: "text", default: "dhcp1" },
            { id: "static_leases", label: "Reservas Estáticas (MAC|IP|Comentario por línea)", type: "textarea", default: "AA:BB:CC:11:22:33|192.168.88.50|Servidor NAS\nAA:BB:CC:44:55:66|192.168.88.51|Impresora", hint: "Una por línea. Deja vacío si no quieres reservas." }
        ]
    },
    hotspot: {
        title: "Hotspot WiFi (Portal Cautivo)",
        description: "Crea un portal cautivo para invitados con autenticación por usuario y contraseña, perfiles de velocidad, timeouts y NAT automático.",
        fileName: "mikrotik_hotspot.rsc",
        inputs: [
            { id: "hotspot_interface", label: "Interfaz del Hotspot", type: "text", default: "bridge-hotspot", hint: "Bridge o interfaz dedicada al hotspot" },
            { id: "hotspot_address", label: "IP del Router en Hotspot (CIDR)", type: "text", default: "10.5.50.1/24" },
            { id: "hotspot_network", label: "Red Hotspot (CIDR)", type: "text", default: "10.5.50.0/24" },
            { id: "pool_start", label: "Inicio Pool IPs Clientes", type: "text", default: "10.5.50.2" },
            { id: "pool_end", label: "Fin Pool IPs Clientes", type: "text", default: "10.5.50.254" },
            { id: "dns_servers", label: "Servidores DNS", type: "text", default: "1.1.1.1,8.8.8.8" },
            { id: "dns_name", label: "DNS Name del Portal", type: "text", default: "login.local", hint: "Dominio que verá el cliente en el portal" },
            { id: "hotspot_name", label: "Nombre del Hotspot", type: "text", default: "hotspot-guest" },
            { id: "rate_limit", label: "Límite de Velocidad por Cliente (subida/bajada)", type: "text", default: "2M/5M", hint: "Ej: 2M/5M. Vacío = sin límite" },
            { id: "session_timeout", label: "Session Timeout", type: "text", default: "1h", hint: "Tiempo total de la sesión" },
            { id: "idle_timeout", label: "Idle Timeout", type: "text", default: "5m", hint: "Inactividad antes de desconexión" },
            { id: "admin_user", label: "Usuario de Prueba", type: "text", default: "invitado" },
            { id: "admin_pass", label: "Contraseña de Prueba", type: "text", default: "wifi123" }
        ]
    },
    "hairpin-nat": {
        title: "Hairpin NAT (NAT Loopback)",
        description: "Permite acceder a servicios internos (DST-NAT) desde la propia LAN usando la IP pública. Soluciona el problema clásico de 'no puedo acceder a mi servidor desde adentro'.",
        fileName: "mikrotik_hairpin_nat.rsc",
        inputs: [
            { id: "lan_network", label: "Red LAN Origen (CIDR)", type: "text", default: "192.168.88.0/24", hint: "Subred desde donde provienen los clientes" },
            { id: "internal_ip", label: "IP del Servidor Interno", type: "text", default: "192.168.88.10" },
            { id: "internal_port", label: "Puerto del Servidor Interno", type: "text", default: "80" },
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
            { id: "include_dstnat", label: "Incluir Regla DST-NAT (Port Forward)", type: "checkbox", default: true, hint: "Desactívalo si ya tienes el port forward configurado" },
            { id: "wan_interface", label: "Interfaz WAN (si incluyes DST-NAT)", type: "text", default: "ether1" },
            { id: "external_port", label: "Puerto Público Externo", type: "text", default: "80" },
            { id: "comment", label: "Comentario", type: "text", default: "Web Server Hairpin" }
        ]
    },
    backup: {
        title: "Backup Automático Programado",
        description: "Backup completo + export de configuración diario/semanal, con envío opcional por email y limpieza automática de archivos antiguos.",
        fileName: "mikrotik_backup_auto.rsc",
        inputs: [
            { id: "backup_prefix", label: "Prefijo del Backup", type: "text", default: "backup", hint: "Nombre base de los archivos generados" },
            { id: "backup_password", label: "Contraseña del Backup", type: "text", default: "MiClaveBackup", hint: "Protege el archivo .backup con esta clave" },
            { id: "schedule_interval", label: "Intervalo", type: "select", options: [
                { value: "1d", label: "Diario (1d)" },
                { value: "1w", label: "Semanal (1w)" },
                { value: "12h", label: "Cada 12 horas" },
                { value: "6h", label: "Cada 6 horas" }
            ], default: "1d" },
            { id: "schedule_time", label: "Hora de Ejecución", type: "text", default: "03:00:00", hint: "Formato HH:MM:SS (hora local del router)" },
            { id: "send_email", label: "Enviar Backup por Email", type: "checkbox", default: true },
            { id: "email_to", label: "Email Destino", type: "text", default: "admin@ejemplo.com" },
            { id: "email_from", label: "Email Origen (From)", type: "text", default: "router@ejemplo.com" },
            { id: "smtp_server", label: "Servidor SMTP", type: "text", default: "smtp.gmail.com" },
            { id: "smtp_port", label: "Puerto SMTP", type: "text", default: "587" },
            { id: "smtp_tls", label: "Tipo de Cifrado", type: "select", options: [
                { value: "starttls", label: "STARTTLS (587 - recomendado)" },
                { value: "tls-only", label: "TLS Directo (465)" },
                { value: "no", label: "Sin cifrado (25)" }
            ], default: "starttls" },
            { id: "smtp_user", label: "Usuario SMTP", type: "text", default: "router@gmail.com" },
            { id: "smtp_pass", label: "Contraseña / App Password", type: "text", default: "tu_app_password", hint: "Para Gmail usa una App Password (no la contraseña normal)" }
        ]
    },
    "vlan-bridge": {
        title: "VLAN sobre Bridge (RouterOS v7+)",
        description: "Configuración profesional de VLANs con bridge vlan-filtering. Segmenta la red en oficina, invitados, IoT, etc. con interfaces dedicadas e IP por VLAN.",
        fileName: "mikrotik_vlan_bridge.rsc",
        isV7Only: true,
        inputs: [
            { id: "bridge_name", label: "Nombre del Bridge Principal", type: "text", default: "bridge-main" },
            { id: "trunk_ports", label: "Puertos Trunk (CON tag, separados por coma)", type: "text", default: "ether2,sfp-sfpplus1", hint: "Puertos que llevarán múltiples VLANs etiquetadas (a switches o APs CAPsMAN)" },
            { id: "management_vlan", label: "VLAN de Management", type: "text", default: "10", hint: "VLAN usada para acceder al router (evita lockout)" },
            { id: "vlan_list", label: "Definición de VLANs (VID|Nombre|IP/CIDR|PuertosUntagged)", type: "textarea", default: "10|management|192.168.10.1/24|ether3\n20|users|192.168.20.1/24|ether4,ether5\n30|guests|192.168.30.1/24|ether6\n40|iot|192.168.40.1/24|", hint: "Una VLAN por línea. PuertosUntagged separados por coma o vacío si solo es trunk." }
        ]
    },
    "brute-force": {
        title: "Protección Anti Brute-Force",
        description: "Bloqueo automático de IPs que intentan acceder masivamente a SSH, Winbox, API o WWW. Usa stages de address-list para banear progresivamente tras N intentos.",
        fileName: "mikrotik_brute_force.rsc",
        inputs: [
            { id: "protect_ssh", label: "Proteger SSH (puerto 22)", type: "checkbox", default: true },
            { id: "protect_winbox", label: "Proteger Winbox (puerto 8291)", type: "checkbox", default: true },
            { id: "protect_api", label: "Proteger API (puerto 8728/8729)", type: "checkbox", default: true },
            { id: "protect_www", label: "Proteger WWW/Webfig (puerto 80/443)", type: "checkbox", default: false },
            { id: "custom_ports", label: "Puertos Adicionales (opcional, coma)", type: "text", default: "", hint: "Ej: 21,23 - dejar vacío si no necesitas más" },
            { id: "stage_timeout", label: "Timeout entre Stages", type: "text", default: "1m", hint: "Tiempo para que el atacante 'olvide' un intento (clásico: 1m)" },
            { id: "blacklist_timeout", label: "Tiempo de Bloqueo Final", type: "text", default: "1w", hint: "Cuánto tiempo queda baneado el atacante (ej: 1d, 1w, 30d)" },
            { id: "whitelist_ips", label: "Whitelist (IPs/Redes Confiables)", type: "textarea", default: "192.168.0.0/16\n10.0.0.0/8\n172.16.0.0/12", hint: "Una por línea. Estas IPs nunca se bloquean (LAN/oficina)." }
        ]
    },
    "address-list-url": {
        title: "Bloqueo por Address-List desde URL",
        description: "Descarga y actualiza automáticamente listas de IPs maliciosas (Spamhaus, FireHOL, países) y bloquea conexiones desde/hacia esas IPs. Refresco programado.",
        fileName: "mikrotik_blocklist_url.rsc",
        inputs: [
            {
                id: "preset",
                label: "Lista Preconfigurada",
                type: "select",
                options: [
                    { value: "custom", label: "Personalizada (URL manual)" },
                    { value: "firehol1", label: "FireHOL Level 1 (recomendado)" },
                    { value: "spamhaus-drop", label: "Spamhaus DROP" },
                    { value: "stamparm-blackbook", label: "Stamparm Blackbook (malware)" },
                    { value: "ipsum", label: "IPsum (Threat Intel)" }
                ],
                default: "firehol1",
                hint: "Selecciona una lista popular o usa una URL propia"
            },
            { id: "list_url", label: "URL del Blocklist", type: "text", default: "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level1.netset", hint: "Solo se modifica con preset='Personalizada'. Acepta formato .txt (una IP por línea) o .rsc" },
            { id: "list_format", label: "Formato del Archivo", type: "select", options: [
                { value: "txt", label: "Texto plano (una IP/CIDR por línea)" },
                { value: "rsc", label: "Script RouterOS (.rsc)" }
            ], default: "txt" },
            { id: "list_name", label: "Nombre de la Address-List", type: "text", default: "blocklist-auto" },
            { id: "block_chain", label: "Bloquear en Cadena", type: "select", options: [
                { value: "input-forward", label: "Input + Forward (recomendado)" },
                { value: "input", label: "Solo Input (proteger router)" },
                { value: "forward", label: "Solo Forward (proteger LAN)" }
            ], default: "input-forward" },
            { id: "block_direction", label: "Dirección del Bloqueo", type: "select", options: [
                { value: "src", label: "Origen (src-address-list)" },
                { value: "dst", label: "Destino (dst-address-list)" },
                { value: "both", label: "Ambos (origen y destino)" }
            ], default: "src" },
            { id: "update_interval", label: "Frecuencia de Actualización", type: "select", options: [
                { value: "1d", label: "Diaria (1d)" },
                { value: "12h", label: "Cada 12 horas" },
                { value: "1w", label: "Semanal (1w)" }
            ], default: "1d" },
            { id: "update_time", label: "Hora de Actualización", type: "text", default: "04:00:00" }
        ]
    },
    "port-knocking": {
        title: "Port Knocking (Acceso Oculto)",
        description: "Mantiene los servicios cerrados al mundo y solo los abre tras una secuencia secreta de 'toques' en puertos específicos. Acceso 'invisible' a Winbox/SSH.",
        fileName: "mikrotik_port_knocking.rsc",
        inputs: [
            { id: "knock_port_1", label: "Puerto Secreto 1", type: "text", default: "7654", hint: "Primer 'toque' de la secuencia" },
            { id: "knock_port_2", label: "Puerto Secreto 2", type: "text", default: "8765", hint: "Segundo toque (después del primero)" },
            { id: "knock_port_3", label: "Puerto Secreto 3", type: "text", default: "9876", hint: "Tercer toque (cierra la secuencia)" },
            {
                id: "knock_protocol",
                label: "Protocolo de los Knocks",
                type: "select",
                options: [
                    { value: "tcp", label: "TCP" },
                    { value: "udp", label: "UDP" }
                ],
                default: "tcp"
            },
            { id: "target_ports", label: "Puertos del Servicio a Proteger", type: "text", default: "22,8291", hint: "Puertos que se abren al autorizar (SSH, Winbox, etc.)" },
            { id: "stage_timeout", label: "Timeout entre Toques", type: "text", default: "10s", hint: "Tiempo máximo entre puertos de la secuencia" },
            { id: "authorized_timeout", label: "Tiempo de Acceso Autorizado", type: "text", default: "1h", hint: "Cuánto dura el acceso tras completar la secuencia" }
        ]
    },
    "layer7-block": {
        title: "Bloqueo de Tráfico (Layer7 + Patrones)",
        description: "Bloquea P2P, streaming, redes sociales o protocolos específicos usando patrones regex Layer7 o filtros simples por puerto/dominio. Incluye advertencia de CPU.",
        fileName: "mikrotik_layer7_block.rsc",
        inputs: [
            { id: "block_torrent", label: "Bloquear BitTorrent / P2P", type: "checkbox", default: true },
            { id: "block_streaming", label: "Bloquear Streaming (YouTube, Netflix)", type: "checkbox", default: false },
            { id: "block_social", label: "Bloquear Redes Sociales (Facebook, TikTok, Instagram)", type: "checkbox", default: false },
            { id: "block_gaming", label: "Bloquear Tráfico de Gaming", type: "checkbox", default: false },
            { id: "block_adult", label: "Bloquear Sitios para Adultos (TLDs comunes)", type: "checkbox", default: false },
            { id: "custom_pattern_name", label: "Patrón Custom - Nombre", type: "text", default: "", hint: "Vacío = no se crea patrón custom" },
            { id: "custom_pattern_regex", label: "Patrón Custom - Regex", type: "text", default: "", hint: "Ej: ^.+(badword|otro).*$" },
            {
                id: "scope",
                label: "Aplicar a",
                type: "select",
                options: [
                    { value: "all-lan", label: "Toda la LAN (forward)" },
                    { value: "specific-list", label: "Address-list específica" }
                ],
                default: "all-lan"
            },
            { id: "target_list", label: "Address-list Objetivo", type: "text", default: "filtered-clients", hint: "Solo si seleccionaste 'Address-list específica'. Crea esa lista con las IPs a filtrar." }
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

        code += `# Rutas virtuales recursivas que comprueban conexión real (target-scope=10 por defecto)\n`;
        for (let i = 1; i <= N; i++) {
            const pingHost = inputs[`ping_host${i}`] || hostDefaults[i - 1] || "8.8.8.8";
            code += `add dst-address=0.0.0.0/0 gateway=${pingHost} check-gateway=ping distance=${i} comment="WAN${i} Recursivo Primario"\n`;
        }
        code += `\n`;

        code += `# Rutas físicas fijas (scope=10) para forzar el ping a los hosts de prueba por la WAN correcta\n`;
        for (let i = 1; i <= N; i++) {
            const pingHost = inputs[`ping_host${i}`] || hostDefaults[i - 1] || "8.8.8.8";
            const wanGateway = inputs[`wan${i}_gateway`] || `192.168.${i}.1`;
            code += `add dst-address=${pingHost}/32 gateway=${wanGateway} scope=10 comment="Ruta de control Host ${i} por WAN ${i}"\n`;
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
            code += `# ADVERTENCIA: Winbox queda expuesto a Internet. Se recomienda restringir por IP con address-list:\n`;
            code += `# /ip firewall address-list add list=allowed-admins address=TU_IP_PUBLICA\n`;
            code += `# Y luego usar: src-address-list=allowed-admins en la siguiente regla\n`;
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
        code += `add service-name=${inputs.service_name} interface=${inputs.pppoe_interface} max-mtu=1492 max-mru=1492 default-profile=${inputs.profile_name} one-session-per-host=yes disabled=no\n\n`;

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

        const isV7Dns = version === 'v7';
        const domains = inputs.block_domains.split('\n');
        let count = 0;
        domains.forEach(domain => {
            const trimmed = domain.trim();
            if (trimmed) {
                if (isV7Dns) {
                    // v7: type=A + match-subdomain=yes para bloquear subdominios también (ej: ads.dominio.com)
                    code += `add type=A name="${trimmed}" address=${inputs.redirect_ip} match-subdomain=yes comment="DNS-Blacklist"\n`;
                } else {
                    // v6 no soporta match-subdomain; se bloquea solo coincidencia exacta
                    code += `add name="${trimmed}" address=${inputs.redirect_ip} comment="DNS-Blacklist"\n`;
                }
                count++;
            }
        });

        code += `\n# Cantidad de dominios bloqueados estáticos: ${count}\n`;
        if (!isV7Dns) {
            code += `# NOTA v6: solo bloquea coincidencia exacta. Para bloquear subdominios usa regex: name="^.*\\\\.dominio\\\\.com$"\n`;
        }
        code += `# RECOMENDACIÓN: Redirige forzadamente el tráfico DNS de tus clientes al Router:\n`;
        code += `# /ip firewall nat add chain=dstnat protocol=udp dst-port=53 action=redirect to-ports=53 comment="Redirect DNS"\n`;

        return code;
    },
    dhcp: (inputs, version) => {
        const network = inputs.dhcp_network || "192.168.88.0/24";
        const netParts = network.split('/');
        const netmaskBits = netParts[1] || "24";

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Servidor DHCP + Reservas Estáticas\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Pool de direcciones para entregar a los clientes\n`;
        code += `/ip pool\n`;
        code += `add name=${inputs.pool_name} ranges=${inputs.pool_start}-${inputs.pool_end}\n\n`;

        code += `# 2. Servidor DHCP escuchando en la interfaz LAN\n`;
        code += `/ip dhcp-server\n`;
        code += `add name=${inputs.server_name} interface=${inputs.dhcp_interface} address-pool=${inputs.pool_name} lease-time=${inputs.lease_time} disabled=no\n\n`;

        code += `# 3. Parámetros que se entregan al cliente (gateway, DNS, máscara)\n`;
        code += `/ip dhcp-server network\n`;
        code += `add address=${network} gateway=${inputs.dhcp_gateway} dns-server=${inputs.dns_servers} netmask=${netmaskBits} comment="LAN DHCP Network"\n\n`;

        const staticLeases = (inputs.static_leases || "").split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (staticLeases.length > 0) {
            code += `# 4. Reservas estáticas (binding MAC -> IP). El dispositivo siempre recibirá la misma IP.\n`;
            code += `/ip dhcp-server lease\n`;
            staticLeases.forEach(line => {
                const parts = line.split('|').map(p => p.trim());
                if (parts.length >= 2) {
                    const mac = parts[0];
                    const ip = parts[1];
                    const comment = parts[2] || "Reserva";
                    code += `add address=${ip} mac-address=${mac} server=${inputs.server_name} comment="${comment}"\n`;
                }
            });
            code += `\n`;
        }

        code += `# NOTA: Asegúrate de tener IP asignada a la interfaz ${inputs.dhcp_interface}:\n`;
        code += `# /ip address add interface=${inputs.dhcp_interface} address=${inputs.dhcp_gateway}/${netmaskBits}\n`;

        return code;
    },
    hotspot: (inputs, version) => {
        const network = inputs.hotspot_network || "10.5.50.0/24";
        const netmaskBits = (network.split('/')[1]) || "24";
        const addressOnly = (inputs.hotspot_address || "10.5.50.1/24").split('/')[0];

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Hotspot WiFi con Portal Cautivo\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# NOTA: La interfaz '${inputs.hotspot_interface}' debe existir previamente.\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Asignar IP del router en la red del hotspot\n`;
        code += `/ip address\n`;
        code += `add address=${inputs.hotspot_address} interface=${inputs.hotspot_interface} comment="Hotspot Gateway"\n\n`;

        code += `# 2. Pool de IPs que se entregarán a los clientes\n`;
        code += `/ip pool\n`;
        code += `add name=hs-pool-${inputs.hotspot_name} ranges=${inputs.pool_start}-${inputs.pool_end}\n\n`;

        code += `# 3. DHCP server dentro de la red del hotspot\n`;
        code += `/ip dhcp-server\n`;
        code += `add name=dhcp-${inputs.hotspot_name} interface=${inputs.hotspot_interface} address-pool=hs-pool-${inputs.hotspot_name} lease-time=${inputs.session_timeout} disabled=no\n`;
        code += `/ip dhcp-server network\n`;
        code += `add address=${network} gateway=${addressOnly} dns-server=${inputs.dns_servers} netmask=${netmaskBits} comment="Hotspot DHCP"\n\n`;

        code += `# 4. Perfil del Hotspot (configuración global del portal)\n`;
        code += `/ip hotspot profile\n`;
        code += `add name=hsprof-${inputs.hotspot_name} hotspot-address=${addressOnly} dns-name=${inputs.dns_name} html-directory=hotspot login-by=http-chap,http-pap use-radius=no\n\n`;

        code += `# 5. Perfil de usuario (velocidad, timeouts)\n`;
        code += `/ip hotspot user profile\n`;
        const rateLimitPart = inputs.rate_limit && inputs.rate_limit.trim() ? `rate-limit=${inputs.rate_limit} ` : '';
        code += `add name=uprof-${inputs.hotspot_name} ${rateLimitPart}session-timeout=${inputs.session_timeout} idle-timeout=${inputs.idle_timeout} shared-users=1\n\n`;

        code += `# 6. Activar el Hotspot sobre la interfaz\n`;
        code += `/ip hotspot\n`;
        code += `add name=${inputs.hotspot_name} interface=${inputs.hotspot_interface} address-pool=hs-pool-${inputs.hotspot_name} profile=hsprof-${inputs.hotspot_name} addresses-per-mac=1 disabled=no\n\n`;

        code += `# 7. Crear usuario de prueba\n`;
        code += `/ip hotspot user\n`;
        code += `add name="${inputs.admin_user}" password="${inputs.admin_pass}" profile=uprof-${inputs.hotspot_name} comment="Usuario inicial"\n\n`;

        code += `# 8. NAT para que los clientes salgan a Internet\n`;
        code += `/ip firewall nat\n`;
        code += `add chain=srcnat src-address=${network} action=masquerade comment="Masquerade Hotspot ${inputs.hotspot_name}"\n\n`;

        code += `# 9. DNS estático para que el dns-name resuelva al router\n`;
        code += `/ip dns static\n`;
        code += `add name=${inputs.dns_name} address=${addressOnly} comment="Hotspot portal redirect"\n`;

        return code;
    },
    "hairpin-nat": (inputs, version) => {
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Hairpin NAT (NAT Loopback)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Permite acceder al servidor interno usando la IP publica desde la propia LAN\n`;
        code += `# ====================================================\n\n`;

        code += `/ip firewall nat\n`;

        if (inputs.include_dstnat) {
            code += `# 1. DST-NAT: redirecciona el puerto publico al servidor interno (Port Forward)\n`;
            code += `add chain=dstnat protocol=${inputs.protocol} in-interface=${inputs.wan_interface} dst-port=${inputs.external_port} action=dst-nat to-addresses=${inputs.internal_ip} to-ports=${inputs.internal_port} comment="${inputs.comment} - DSTNAT"\n\n`;
        }

        code += `# 2. SRC-NAT (Hairpin): masquerade del tráfico LAN -> Servidor Interno\n`;
        code += `# Sin esta regla, el servidor responde directo al cliente LAN y este descarta el paquete.\n`;
        code += `add chain=srcnat src-address=${inputs.lan_network} dst-address=${inputs.internal_ip} protocol=${inputs.protocol} dst-port=${inputs.internal_port} action=masquerade comment="${inputs.comment} - Hairpin"\n\n`;

        code += `# RECOMENDACIÓN: Si tienes muchos servidores con port forward, usa esta regla universal en lugar de una por cada uno:\n`;
        code += `# add chain=srcnat src-address=${inputs.lan_network} dst-address=${inputs.lan_network} action=masquerade comment="Hairpin universal LAN-LAN via port forward"\n`;

        return code;
    },
    backup: (inputs, version) => {
        const scriptName = `auto-${inputs.backup_prefix || 'backup'}`;
        const schedulerName = `sched-${inputs.backup_prefix || 'backup'}`;

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Backup Automático Programado\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;

        if (inputs.send_email) {
            code += `# 1. Configurar la cuenta SMTP para enviar los backups por correo\n`;
            code += `/tool e-mail\n`;
            const tlsValue = inputs.smtp_tls === 'no' ? 'no' : (inputs.smtp_tls === 'tls-only' ? 'tls-only' : 'starttls');
            code += `set address=${inputs.smtp_server} port=${inputs.smtp_port} user="${inputs.smtp_user}" password="${inputs.smtp_pass}" tls=${tlsValue} from="${inputs.email_from}"\n\n`;
        }

        const stepNum = inputs.send_email ? 2 : 1;
        code += `# ${stepNum}. Script que genera backup + export y opcionalmente lo envía por email\n`;
        code += `/system script\n`;
        code += `add name=${scriptName} policy=read,write,policy,test,sensitive source={\n`;
        code += `    :local fname ("${inputs.backup_prefix}-" . [/system identity get name] . "-" . [:pick [/system clock get date] 7 11] . [:pick [/system clock get date] 0 3] . [:pick [/system clock get date] 4 6])\n`;
        code += `    :log info ("Generando backup: " . $fname)\n`;
        code += `    /system backup save name=$fname password="${inputs.backup_password}"\n`;
        code += `    /export file=$fname\n`;
        code += `    :delay 5s\n`;
        if (inputs.send_email) {
            code += `    /tool e-mail send to="${inputs.email_to}" subject=("Backup MikroTik - " . [/system identity get name]) body=("Backup y export adjuntos. Fecha: " . [/system clock get date] . " " . [/system clock get time]) file=($fname . ".backup")\n`;
            code += `    :delay 10s\n`;
            code += `    /tool e-mail send to="${inputs.email_to}" subject=("Export Config - " . [/system identity get name]) body="Export en texto plano adjunto" file=($fname . ".rsc")\n`;
            code += `    :delay 30s\n`;
            code += `    :log info ("Limpiando archivos temporales del backup: " . $fname)\n`;
            code += `    /file remove [/file find name=($fname . ".backup")]\n`;
            code += `    /file remove [/file find name=($fname . ".rsc")]\n`;
        } else {
            code += `    :log info ("Backup guardado en almacenamiento local: " . $fname)\n`;
        }
        code += `}\n\n`;

        const stepNum2 = stepNum + 1;
        code += `# ${stepNum2}. Programar la ejecución del script\n`;
        code += `/system scheduler\n`;
        code += `add name=${schedulerName} interval=${inputs.schedule_interval} start-time=${inputs.schedule_time} on-event="/system script run ${scriptName}" comment="Backup Automático"\n\n`;

        if (inputs.send_email) {
            code += `# IMPORTANTE para Gmail:\n`;
            code += `# 1. Activa la verificación en 2 pasos en la cuenta Google.\n`;
            code += `# 2. Genera una 'Contraseña de Aplicación' en https://myaccount.google.com/apppasswords\n`;
            code += `# 3. Usa esa contraseña (16 caracteres) en el campo password, NO la del usuario.\n`;
        }
        code += `# Probar manualmente: /system script run ${scriptName}\n`;

        return code;
    },
    "vlan-bridge": (inputs, version) => {
        if (version === 'v6') {
            return `# ====================================================\n# ERROR: SCRIPT OPTIMIZADO PARA RouterOS v7\n# ====================================================\n# La sintaxis de bridge vlan-filtering es estable y recomendada desde v7.\n# Por favor cambia el selector arriba a la derecha a 'v7'.\n`;
        }

        const bridge = inputs.bridge_name || "bridge-main";
        const trunkPorts = (inputs.trunk_ports || "").split(',').map(p => p.trim()).filter(p => p.length > 0);
        const vlanLines = (inputs.vlan_list || "").split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const mgmtVlan = inputs.management_vlan || "10";

        const vlans = vlanLines.map(line => {
            const parts = line.split('|').map(p => p.trim());
            return {
                id: parts[0] || "",
                name: parts[1] || "",
                ip: parts[2] || "",
                untagged: (parts[3] || "").split(',').map(p => p.trim()).filter(p => p.length > 0)
            };
        }).filter(v => v.id && v.name);

        let code = `# ====================================================\n`;
        code += `# SCRIPT: VLAN sobre Bridge con vlan-filtering (RouterOS v7)\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# IMPORTANTE: activa vlan-filtering AL FINAL. Si configuras mal te bloquearás.\n`;
        code += `# Conéctate por consola/MAC-Winbox antes de aplicar este script.\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Crear el bridge SIN vlan-filtering aun (se activa al final)\n`;
        code += `/interface bridge\n`;
        code += `add name=${bridge} vlan-filtering=no protocol-mode=rstp comment="Bridge con VLAN filtering"\n\n`;

        code += `# 2. Agregar puertos al bridge\n`;
        code += `/interface bridge port\n`;
        trunkPorts.forEach(p => {
            code += `add bridge=${bridge} interface=${p} comment="Trunk port"\n`;
        });
        vlans.forEach(v => {
            v.untagged.forEach(p => {
                code += `add bridge=${bridge} interface=${p} pvid=${v.id} frame-types=admit-only-untagged-and-priority-tagged comment="Access port VLAN ${v.id} (${v.name})"\n`;
            });
        });
        code += `\n`;

        code += `# 3. Crear las interfaces VLAN sobre el bridge\n`;
        code += `/interface vlan\n`;
        vlans.forEach(v => {
            code += `add name=vlan${v.id}-${v.name} interface=${bridge} vlan-id=${v.id} comment="VLAN ${v.id} ${v.name}"\n`;
        });
        code += `\n`;

        code += `# 4. Tabla de VLANs del bridge (qué VLAN existe en qué puerto)\n`;
        code += `/interface bridge vlan\n`;
        vlans.forEach(v => {
            const taggedList = [bridge, ...trunkPorts].join(',');
            const untaggedPart = v.untagged.length > 0 ? ` untagged=${v.untagged.join(',')}` : '';
            code += `add bridge=${bridge} vlan-ids=${v.id} tagged=${taggedList}${untaggedPart} comment="VLAN ${v.id} ${v.name}"\n`;
        });
        code += `\n`;

        code += `# 5. Asignar IP a cada interfaz VLAN (gateway de cada subred)\n`;
        code += `/ip address\n`;
        vlans.forEach(v => {
            if (v.ip) {
                code += `add interface=vlan${v.id}-${v.name} address=${v.ip} comment="Gateway VLAN ${v.name}"\n`;
            }
        });
        code += `\n`;

        const mgmtVlanDef = vlans.find(v => v.id === mgmtVlan);
        if (mgmtVlanDef) {
            code += `# 6. Lista de interfaces para reglas firewall (opcional pero recomendado)\n`;
            code += `/interface list\n`;
            code += `add name=VLAN-MGMT comment="Solo VLAN de management"\n`;
            code += `/interface list member\n`;
            code += `add list=VLAN-MGMT interface=vlan${mgmtVlanDef.id}-${mgmtVlanDef.name}\n\n`;
        }

        code += `# 7. ACTIVAR vlan-filtering (PUNTO DE NO RETORNO - asegúrate del management antes)\n`;
        code += `/interface bridge set ${bridge} vlan-filtering=yes\n\n`;

        code += `# SUGERENCIA: Después de probar, crea DHCP server, firewall y NAT por cada VLAN según necesites.\n`;
        code += `# Para aislar VLANs entre sí: agrega regla en /ip firewall filter chain=forward action=drop entre subredes.\n`;

        return code;
    },
    "brute-force": (inputs, version) => {
        const ports = [];
        if (inputs.protect_ssh) ports.push("22");
        if (inputs.protect_winbox) ports.push("8291");
        if (inputs.protect_api) ports.push("8728", "8729");
        if (inputs.protect_www) ports.push("80", "443");
        if (inputs.custom_ports && inputs.custom_ports.trim()) {
            inputs.custom_ports.split(',').forEach(p => { const t = p.trim(); if (t) ports.push(t); });
        }
        const portList = ports.join(',');

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Protección Anti Brute-Force (Address-List Stages)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Tras ${4} intentos fallidos, la IP queda baneada ${inputs.blacklist_timeout}.\n`;
        code += `# ====================================================\n\n`;

        if (portList === '') {
            code += `# ADVERTENCIA: No seleccionaste ningún servicio a proteger. Activa al menos uno.\n`;
            return code;
        }

        const whitelistEntries = (inputs.whitelist_ips || "").split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (whitelistEntries.length > 0) {
            code += `# 1. Address-list de IPs confiables (no se bloquean nunca)\n`;
            code += `/ip firewall address-list\n`;
            whitelistEntries.forEach(ip => {
                code += `add list=trusted address=${ip} comment="Whitelist confiable"\n`;
            });
            code += `\n`;
        }

        code += `# 2. Reglas anti brute-force en orden inverso (más antigua arriba)\n`;
        code += `/ip firewall filter\n`;
        code += `# 2.1 Permitir conexiones desde IPs en la whitelist (corta evaluación)\n`;
        if (whitelistEntries.length > 0) {
            code += `add chain=input action=accept src-address-list=trusted comment="Whitelist - acceso permitido"\n`;
        }
        code += `# 2.2 Drop inmediato a IPs ya baneadas\n`;
        code += `add chain=input action=drop protocol=tcp dst-port=${portList} src-address-list=ban-final comment="Brute force: drop blacklisted"\n\n`;

        code += `# 2.3 Stages: si una IP avanza por los stages, termina en la blacklist final\n`;
        code += `add chain=input action=add-src-to-address-list address-list=ban-final address-list-timeout=${inputs.blacklist_timeout} protocol=tcp dst-port=${portList} connection-state=new src-address-list=bf-stage3 comment="Brute force: stage3 -> blacklist"\n`;
        code += `add chain=input action=add-src-to-address-list address-list=bf-stage3 address-list-timeout=${inputs.stage_timeout} protocol=tcp dst-port=${portList} connection-state=new src-address-list=bf-stage2 comment="Brute force: stage2 -> stage3"\n`;
        code += `add chain=input action=add-src-to-address-list address-list=bf-stage2 address-list-timeout=${inputs.stage_timeout} protocol=tcp dst-port=${portList} connection-state=new src-address-list=bf-stage1 comment="Brute force: stage1 -> stage2"\n`;
        code += `add chain=input action=add-src-to-address-list address-list=bf-stage1 address-list-timeout=${inputs.stage_timeout} protocol=tcp dst-port=${portList} connection-state=new comment="Brute force: primer intento -> stage1"\n\n`;

        code += `# REVISAR baneados: /ip firewall address-list print where list=ban-final\n`;
        code += `# DESBANEAR manual: /ip firewall address-list remove [find list=ban-final address=A.B.C.D]\n`;
        code += `# NOTA: Estas reglas se evaluan ANTES que las reglas accept normales. Asegúrate de que el orden\n`;
        code += `#       en /ip firewall filter sea correcto: estas anti-brute-force PRIMERO, luego las de servicio.\n`;

        return code;
    },
    "address-list-url": (inputs, version) => {
        const presets = {
            "firehol1": "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level1.netset",
            "spamhaus-drop": "https://www.spamhaus.org/drop/drop.txt",
            "stamparm-blackbook": "https://raw.githubusercontent.com/stamparm/blackbook/master/blackbook.txt",
            "ipsum": "https://raw.githubusercontent.com/stamparm/ipsum/master/levels/3.txt"
        };

        const url = (inputs.preset && inputs.preset !== 'custom' && presets[inputs.preset]) ? presets[inputs.preset] : inputs.list_url;
        const listName = inputs.list_name || "blocklist-auto";
        const scriptName = `update-${listName}`;
        const schedulerName = `sched-${listName}`;
        const fileName = inputs.list_format === 'rsc' ? `${listName}.rsc` : `${listName}.txt`;

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Bloqueo por Address-List desde URL\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Fuente: ${url}\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Script de actualización: descarga la lista y reconstruye la address-list\n`;
        code += `/system script\n`;
        code += `add name=${scriptName} policy=read,write,policy,test source={\n`;
        code += `    :log info "Descargando blocklist ${listName}..."\n`;
        code += `    :do { /file remove ${fileName} } on-error={}\n`;
        code += `    /tool fetch url="${url}" mode=https dst-path=${fileName}\n`;
        code += `    :delay 10s\n`;

        if (inputs.list_format === 'rsc') {
            code += `    # Formato .rsc: borrar lista vieja e importar\n`;
            code += `    /ip firewall address-list remove [find list=${listName}]\n`;
            code += `    /import file-name=${fileName}\n`;
        } else {
            code += `    # Formato .txt: parsear línea por línea (uso eficiente de :find)\n`;
            code += `    /ip firewall address-list remove [find list=${listName}]\n`;
            code += `    :local content [/file get ${fileName} contents]\n`;
            code += `    :local contentLen [:len $content]\n`;
            code += `    :local pos 0\n`;
            code += `    :local added 0\n`;
            code += `    :while ($pos < $contentLen) do={\n`;
            code += `        :local nl [:find $content "\\n" $pos]\n`;
            code += `        :if ($nl = [:nothing]) do={ :set nl $contentLen }\n`;
            code += `        :local line [:pick $content $pos $nl]\n`;
            code += `        :set pos ($nl + 1)\n`;
            code += `        # Saltar comentarios (#) y secciones (;)\n`;
            code += `        :local hashPos [:find $line "#"]\n`;
            code += `        :if ($hashPos != [:nothing]) do={ :set line [:pick $line 0 $hashPos] }\n`;
            code += `        :local semiPos [:find $line ";"]\n`;
            code += `        :if ($semiPos != [:nothing]) do={ :set line [:pick $line 0 $semiPos] }\n`;
            code += `        # Quitar CR final si el archivo usa CRLF (Windows)\n`;
            code += `        :local crPos [:find $line "\\r"]\n`;
            code += `        :if ($crPos != [:nothing]) do={ :set line [:pick $line 0 $crPos] }\n`;
            code += `        # Solo aceptar si parece IP (>=7 chars y empieza con dígito)\n`;
            code += `        :if ([:len $line] >= 7) do={\n`;
            code += `            :local firstChar [:pick $line 0]\n`;
            code += `            :if ($firstChar >= "0" && $firstChar <= "9") do={\n`;
            code += `                :do {\n`;
            code += `                    /ip firewall address-list add list=${listName} address=$line comment="Auto ${listName}"\n`;
            code += `                    :set added ($added + 1)\n`;
            code += `                } on-error={}\n`;
            code += `            }\n`;
            code += `        }\n`;
            code += `    }\n`;
            code += `    :log info ("Address-list ${listName} actualizada: " . $added . " entradas")\n`;
        }
        code += `}\n\n`;

        code += `# 2. Programar la actualización\n`;
        code += `/system scheduler\n`;
        code += `add name=${schedulerName} interval=${inputs.update_interval} start-time=${inputs.update_time} on-event="/system script run ${scriptName}" comment="Actualizar ${listName}"\n\n`;

        code += `# 3. Reglas de bloqueo en el firewall\n`;
        code += `/ip firewall filter\n`;
        const chains = [];
        if (inputs.block_chain === 'input-forward') { chains.push('input', 'forward'); }
        else if (inputs.block_chain === 'input') { chains.push('input'); }
        else { chains.push('forward'); }

        chains.forEach(ch => {
            if (inputs.block_direction === 'src' || inputs.block_direction === 'both') {
                code += `add chain=${ch} action=drop src-address-list=${listName} comment="Drop ${listName} (origen)"\n`;
            }
            if (inputs.block_direction === 'dst' || inputs.block_direction === 'both') {
                code += `add chain=${ch} action=drop dst-address-list=${listName} comment="Drop ${listName} (destino)"\n`;
            }
        });

        code += `\n# Ejecuta manualmente la primera vez para poblar la lista:\n`;
        code += `# /system script run ${scriptName}\n`;
        code += `# Listas alternativas populares:\n`;
        code += `#   FireHOL Level 1: https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level1.netset\n`;
        code += `#   Spamhaus DROP:   https://www.spamhaus.org/drop/drop.txt\n`;
        code += `#   IPsum nivel 3:   https://raw.githubusercontent.com/stamparm/ipsum/master/levels/3.txt\n`;
        code += `# IMPORTANTE: las listas tipo .txt pueden tener miles de IPs; el primer fetch puede tardar varios minutos.\n`;

        return code;
    },
    "port-knocking": (inputs, version) => {
        const k1 = inputs.knock_port_1 || "7654";
        const k2 = inputs.knock_port_2 || "8765";
        const k3 = inputs.knock_port_3 || "9876";
        const proto = inputs.knock_protocol || "tcp";
        const targetPorts = inputs.target_ports || "22,8291";
        const stageT = inputs.stage_timeout || "10s";
        const authT = inputs.authorized_timeout || "1h";

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Port Knocking (Acceso Oculto a Servicios)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Secuencia: ${proto.toUpperCase()} ${k1} -> ${k2} -> ${k3} (en menos de ${stageT})\n`;
        code += `# Tras la secuencia, los puertos ${targetPorts} se abren por ${authT} para la IP que tocó.\n`;
        code += `# ====================================================\n\n`;

        code += `/ip firewall filter\n`;
        code += `# 1. Permitir acceso a IPs ya autorizadas (que completaron la secuencia)\n`;
        code += `add chain=input action=accept protocol=tcp dst-port=${targetPorts} src-address-list=knock-authorized comment="Port Knocking: acceso autorizado"\n\n`;

        code += `# 2. Detectar la secuencia. Reglas en orden inverso (más restrictiva primero)\n`;
        code += `# 2.3 Tercer toque -> mover a knock-authorized\n`;
        code += `add chain=input action=add-src-to-address-list address-list=knock-authorized address-list-timeout=${authT} protocol=${proto} dst-port=${k3} src-address-list=knock-stage2 comment="Knock 3/3 - autorizado"\n`;
        code += `add chain=input action=remove-from-address-list address-list=knock-stage2 protocol=${proto} dst-port=${k3} src-address-list=knock-stage2\n\n`;

        code += `# 2.2 Segundo toque -> avanzar a stage2\n`;
        code += `add chain=input action=add-src-to-address-list address-list=knock-stage2 address-list-timeout=${stageT} protocol=${proto} dst-port=${k2} src-address-list=knock-stage1 comment="Knock 2/3"\n`;
        code += `add chain=input action=remove-from-address-list address-list=knock-stage1 protocol=${proto} dst-port=${k2} src-address-list=knock-stage1\n\n`;

        code += `# 2.1 Primer toque -> stage1\n`;
        code += `add chain=input action=add-src-to-address-list address-list=knock-stage1 address-list-timeout=${stageT} protocol=${proto} dst-port=${k1} comment="Knock 1/3"\n\n`;

        code += `# 3. Bloquear el acceso normal a los puertos del servicio (lo deja inaccesible sin la secuencia)\n`;
        code += `add chain=input action=drop protocol=tcp dst-port=${targetPorts} comment="Port Knocking: bloquear acceso directo"\n\n`;

        code += `# Cómo activar el acceso desde Linux/Mac:\n`;
        if (proto === 'tcp') {
            code += `#   for p in ${k1} ${k2} ${k3}; do nc -z -w1 IP_DEL_ROUTER $p; sleep 1; done\n`;
        } else {
            code += `#   for p in ${k1} ${k2} ${k3}; do nmap -sU -p $p IP_DEL_ROUTER; done\n`;
        }
        code += `# Desde Windows: usar PortQry o un script PowerShell con Test-NetConnection.\n`;
        code += `# Verificar autorización: /ip firewall address-list print where list=knock-authorized\n`;
        code += `# IMPORTANTE: el orden de las reglas en /ip firewall filter es CRÍTICO. Estas deben ir ANTES\n`;
        code += `#             del 'drop final' general del firewall, o ajustar con 'place-before'.\n`;

        return code;
    },
    "layer7-block": (inputs, version) => {
        const patterns = [];

        if (inputs.block_torrent) {
            patterns.push({
                name: "l7-torrent",
                regex: `^(\\\\x13bittorrent protocol|azver\\\\x01\$|get /scrape\\\\?info_hash=|get /announce\\\\?info_hash=|get /client/bitcomet/|GET /data\\\\?fid=).*\$`,
                comment: "BitTorrent / P2P"
            });
        }
        if (inputs.block_streaming) {
            patterns.push({
                name: "l7-streaming",
                regex: `^.+(youtube|googlevideo|netflix|nflxvideo|hulu|primevideo|disneyplus|twitch).*\$`,
                comment: "Streaming masivo"
            });
        }
        if (inputs.block_social) {
            patterns.push({
                name: "l7-social",
                regex: `^.+(facebook\\\\.com|fbcdn\\\\.net|instagram\\\\.com|tiktok\\\\.com|twitter\\\\.com|x\\\\.com|snapchat).*\$`,
                comment: "Redes sociales"
            });
        }
        if (inputs.block_gaming) {
            patterns.push({
                name: "l7-gaming",
                regex: `^.+(steampowered|steamcommunity|riotgames|leagueoflegends|battle\\\\.net|epicgames|xboxlive|playstation|ea\\\\.com).*\$`,
                comment: "Plataformas de gaming"
            });
        }
        if (inputs.block_adult) {
            patterns.push({
                name: "l7-adult",
                regex: `^.+(pornhub|xvideos|xnxx|xhamster|redtube|youporn|onlyfans|chaturbate).*\$`,
                comment: "Sitios para adultos"
            });
        }
        if (inputs.custom_pattern_name && inputs.custom_pattern_name.trim() && inputs.custom_pattern_regex && inputs.custom_pattern_regex.trim()) {
            patterns.push({
                name: inputs.custom_pattern_name.trim(),
                regex: inputs.custom_pattern_regex.trim(),
                comment: "Patrón personalizado"
            });
        }

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Bloqueo Layer7 (Patrones de Protocolo / Dominio)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ADVERTENCIA: Layer7 consume CPU. Úsalo solo en routers potentes o para tráfico bajo.\n`;
        code += `# Para uso masivo, prefiere TLS-host (en v7) o address-list por dominio resuelto.\n`;
        code += `# ====================================================\n\n`;

        if (patterns.length === 0) {
            code += `# No se seleccionó ningún patrón a bloquear. Activa al menos una opción.\n`;
            return code;
        }

        code += `# 1. Definir patrones Layer7\n`;
        code += `/ip firewall layer7-protocol\n`;
        patterns.forEach(p => {
            code += `add name=${p.name} regexp="${p.regex}" comment="${p.comment}"\n`;
        });
        code += `\n`;

        code += `# 2. Reglas de bloqueo en forward\n`;
        code += `/ip firewall filter\n`;
        patterns.forEach(p => {
            if (inputs.scope === 'specific-list') {
                code += `add chain=forward action=drop layer7-protocol=${p.name} src-address-list=${inputs.target_list} comment="Block ${p.comment} (filtered)"\n`;
            } else {
                code += `add chain=forward action=drop layer7-protocol=${p.name} comment="Block ${p.comment}"\n`;
            }
        });
        code += `\n`;

        if (inputs.scope === 'specific-list') {
            code += `# Recordatorio: crea la address-list y agrega los clientes a filtrar:\n`;
            code += `# /ip firewall address-list add list=${inputs.target_list} address=192.168.88.50 comment="Cliente filtrado"\n\n`;
        }

        code += `# OPTIMIZACIÓN: Layer7 solo debe ver tráfico de un mismo flujo. Marca primero con mangle:\n`;
        code += `# /ip firewall mangle add chain=prerouting action=mark-packet new-packet-mark=l7-check\n`;
        code += `# y luego usa packet-mark=l7-check en las reglas de filter.\n`;
        code += `# En RouterOS v7: para bloqueo de dominios HTTPS, prefiere tls-host en chain=forward.\n`;
        code += `# Ejemplo: /ip firewall filter add chain=forward action=drop tls-host="*.facebook.com"\n`;

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
