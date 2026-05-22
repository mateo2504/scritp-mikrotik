// Queue Tree + PCQ - QoS por servicio (VoIP, gaming, normal, bulk) con reparto equitativo.
(function () {
    const definition = {
        key: 'queue-tree-qos',
        title: "Queue Tree + PCQ (QoS por Servicio)",
        description: "QoS profesional: clasifica tráfico por tipo de servicio (VoIP, DNS, gaming, navegación, bulk) con prioridades y reparte el ancho de banda equitativamente entre usuarios con PCQ.",
        fileName: "mikrotik_queue_tree_qos.rsc",
        inputs: [
            { id: "wan_interface", label: "Interfaz WAN", type: "text", default: "ether1", hint: "Interfaz por donde sale tu Internet" },
            { id: "lan_interface", label: "Interfaz LAN", type: "text", default: "bridge-lan", hint: "Bridge o interfaz de la red local" },
            { id: "download_total", label: "Ancho de Banda DOWNLOAD Total", type: "text", default: "100M", hint: "Capacidad real de tu Internet de bajada (usa 85-90% del nominal)" },
            { id: "upload_total", label: "Ancho de Banda UPLOAD Total", type: "text", default: "20M", hint: "Capacidad real de subida (usa 85-90% del nominal)" },
            { id: "prio_voip", label: "Priorizar VoIP / SIP (puerto 5060, RTP)", type: "checkbox", default: true, hint: "Prioridad 1 - la más alta" },
            { id: "prio_dns", label: "Priorizar DNS (puerto 53)", type: "checkbox", default: true, hint: "Prioridad 2" },
            { id: "prio_gaming", label: "Priorizar Gaming (Xbox, PS, Steam)", type: "checkbox", default: true, hint: "Prioridad 3" },
            { id: "prio_video", label: "Priorizar Video conferencia (Zoom, Meet, Teams)", type: "checkbox", default: true, hint: "Prioridad 4" },
            { id: "deprio_bulk", label: "Penalizar descargas masivas (>50MB en una conexión)", type: "checkbox", default: true, hint: "Prioridad 8 (la más baja). Heurística por bytes." },
            { id: "use_pcq", label: "Repartir equitativamente entre usuarios (PCQ)", type: "checkbox", default: true, hint: "Si un usuario satura la línea, comparte entre todos los activos" }
        ]
    };

    function generate(inputs, version) {
        const wan = inputs.wan_interface || 'ether1';
        const lan = inputs.lan_interface || 'bridge-lan';
        const dl = inputs.download_total || '100M';
        const ul = inputs.upload_total || '20M';
        const queueDl = inputs.use_pcq ? 'pcq-download' : 'default';
        const queueUl = inputs.use_pcq ? 'pcq-upload' : 'default';

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Queue Tree + PCQ con clasificación por servicio\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# DOWNLOAD: ${dl}  |  UPLOAD: ${ul}\n`;
        code += `# ====================================================\n`;
        code += `# ADVERTENCIA: Para que esto funcione, DESACTIVA FastTrack en /ip firewall filter.\n`;
        code += `# FastTrack se salta mangle y rompe queue tree.\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. MANGLE: clasificar el tráfico marcando paquetes según tipo de servicio\n`;
        code += `# Se usan dos pasos: mark-connection (más eficiente) -> mark-packet\n`;
        code += `/ip firewall mangle\n\n`;

        let priority = 1;
        const services = [];

        if (inputs.prio_voip) {
            code += `# 1.1 VoIP / SIP (prioridad ${priority})\n`;
            code += `add chain=prerouting protocol=udp port=5060,5061,3478,3479 connection-mark=no-mark action=mark-connection new-connection-mark=voip-conn passthrough=yes comment="VoIP SIP/STUN"\n`;
            code += `add chain=prerouting protocol=udp port=10000-20000 connection-mark=no-mark dst-address-type=!local action=mark-connection new-connection-mark=voip-conn passthrough=yes comment="VoIP RTP"\n`;
            code += `add chain=prerouting connection-mark=voip-conn action=mark-packet new-packet-mark=voip passthrough=no comment="VoIP packets"\n\n`;
            services.push({ name: 'VOIP', mark: 'voip', priority: priority, limitAtDl: '500k', limitAtUl: '500k' });
            priority++;
        }

        if (inputs.prio_dns) {
            code += `# 1.2 DNS (prioridad ${priority})\n`;
            code += `add chain=prerouting protocol=udp port=53 action=mark-packet new-packet-mark=dns passthrough=no comment="DNS UDP"\n`;
            code += `add chain=prerouting protocol=tcp port=53 action=mark-packet new-packet-mark=dns passthrough=no comment="DNS TCP"\n\n`;
            services.push({ name: 'DNS', mark: 'dns', priority: priority, limitAtDl: '1M', limitAtUl: '500k' });
            priority++;
        }

        if (inputs.prio_gaming) {
            code += `# 1.3 Gaming (prioridad ${priority})\n`;
            code += `add chain=prerouting protocol=udp port=3074 connection-mark=no-mark action=mark-connection new-connection-mark=gaming-conn passthrough=yes comment="Xbox Live"\n`;
            code += `add chain=prerouting protocol=udp port=3478-3480 connection-mark=no-mark action=mark-connection new-connection-mark=gaming-conn passthrough=yes comment="PlayStation Network"\n`;
            code += `add chain=prerouting protocol=udp port=27000-27050 connection-mark=no-mark action=mark-connection new-connection-mark=gaming-conn passthrough=yes comment="Steam"\n`;
            code += `add chain=prerouting protocol=udp port=27015-27030 connection-mark=no-mark action=mark-connection new-connection-mark=gaming-conn passthrough=yes comment="Source / Valve games"\n`;
            code += `add chain=prerouting connection-mark=gaming-conn action=mark-packet new-packet-mark=gaming passthrough=no\n\n`;
            services.push({ name: 'GAMING', mark: 'gaming', priority: priority, limitAtDl: '2M', limitAtUl: '2M' });
            priority++;
        }

        if (inputs.prio_video) {
            code += `# 1.4 Video conferencia (prioridad ${priority})\n`;
            code += `add chain=prerouting protocol=udp port=8801-8810 connection-mark=no-mark action=mark-connection new-connection-mark=video-conn passthrough=yes comment="Zoom"\n`;
            code += `add chain=prerouting protocol=udp port=3478,19302-19309 connection-mark=no-mark action=mark-connection new-connection-mark=video-conn passthrough=yes comment="Google Meet / STUN"\n`;
            code += `add chain=prerouting protocol=udp port=50000-50059 connection-mark=no-mark action=mark-connection new-connection-mark=video-conn passthrough=yes comment="Teams"\n`;
            code += `add chain=prerouting connection-mark=video-conn action=mark-packet new-packet-mark=video passthrough=no\n\n`;
            services.push({ name: 'VIDEO', mark: 'video', priority: priority, limitAtDl: '3M', limitAtUl: '2M' });
            priority++;
        }

        if (inputs.deprio_bulk) {
            code += `# 1.5 Bulk: descargas grandes (heurística: conexiones que ya cargaron >50MB)\n`;
            code += `add chain=prerouting connection-bytes=50000000-0 protocol=tcp connection-mark=no-mark action=mark-connection new-connection-mark=bulk-conn passthrough=yes comment="Bulk transfer (>50MB)"\n`;
            code += `add chain=prerouting connection-mark=bulk-conn action=mark-packet new-packet-mark=bulk passthrough=no\n\n`;
        }

        code += `# 1.6 Resto del tráfico = navegación normal (prioridad ${priority})\n`;
        code += `add chain=prerouting connection-mark=no-mark action=mark-packet new-packet-mark=normal passthrough=no comment="Tráfico normal"\n\n`;
        services.push({ name: 'NORMAL', mark: 'normal', priority: priority, limitAtDl: '5M', limitAtUl: '1M' });

        if (inputs.deprio_bulk) {
            services.push({ name: 'BULK', mark: 'bulk', priority: 8, limitAtDl: '256k', limitAtUl: '128k' });
        }

        if (inputs.use_pcq) {
            code += `# 2. QUEUE TYPE: PCQ para reparto equitativo entre clientes activos\n`;
            code += `/queue type\n`;
            code += `add name=pcq-download kind=pcq pcq-rate=0 pcq-classifier=dst-address pcq-limit=50 pcq-total-limit=2000 comment="PCQ download por IP destino"\n`;
            code += `add name=pcq-upload kind=pcq pcq-rate=0 pcq-classifier=src-address pcq-limit=50 pcq-total-limit=2000 comment="PCQ upload por IP origen"\n\n`;
        }

        code += `# 3. QUEUE TREE: jerarquía con queue padre por dirección y queues hijo por servicio\n`;
        code += `/queue tree\n\n`;

        code += `# 3.1 Queues padre (limitan al ancho de banda real de la WAN)\n`;
        code += `add name=DOWNLOAD parent=${lan} max-limit=${dl} comment="Total download (sale por LAN hacia clientes)"\n`;
        code += `add name=UPLOAD parent=${wan} max-limit=${ul} comment="Total upload (sale por WAN al ISP)"\n\n`;

        code += `# 3.2 Queues hijo por servicio (ordenados por prioridad)\n`;
        services.forEach(s => {
            code += `add name=DL-${s.name} parent=DOWNLOAD packet-mark=${s.mark} limit-at=${s.limitAtDl} max-limit=${dl} priority=${s.priority} queue=${queueDl} comment="Download ${s.name}"\n`;
        });
        code += `\n`;
        services.forEach(s => {
            code += `add name=UL-${s.name} parent=UPLOAD packet-mark=${s.mark} limit-at=${s.limitAtUl} max-limit=${ul} priority=${s.priority} queue=${queueUl} comment="Upload ${s.name}"\n`;
        });
        code += `\n`;

        code += `# ====================================================\n`;
        code += `# NOTAS\n`;
        code += `# - 'limit-at' = velocidad garantizada en condiciones de saturación.\n`;
        code += `# - 'max-limit' = techo absoluto (toma todo lo libre si nadie compite).\n`;
        code += `# - 'priority' 1 (alta) -> 8 (baja). Servicios críticos primero.\n`;
        if (inputs.use_pcq) {
            code += `# - PCQ con pcq-rate=0 reparte AUTOMÁTICAMENTE entre los clientes activos.\n`;
        }
        code += `# - IMPORTANTE: si activas el firewall con FastTrack, desactiva esa regla,\n`;
        code += `#   o el QoS no funcionará (FastTrack salta el mangle).\n`;
        code += `# ====================================================\n`;
        code += `# MONITORIZAR:\n`;
        code += `#   /queue tree print stats        (ver bytes/rate por cola)\n`;
        code += `#   /ip firewall mangle print stats  (ver paquetes marcados)\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
