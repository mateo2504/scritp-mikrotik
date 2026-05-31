// Queue Tree + PCQ - QoS por servicio (VoIP, gaming, streaming, redes sociales, normal, bulk) con reparto equitativo.
(function () {
    const definition = {
        key: 'queue-tree-qos',
        title: "Queue Tree + PCQ (QoS por Servicio)",
        description: "QoS profesional: clasifica tráfico por tipo de servicio (VoIP, DNS/Ping, gaming, streaming, redes sociales, navegación, bulk) con prioridades y reparte el ancho de banda equitativamente entre usuarios con PCQ.",
        fileName: "mikrotik_queue_tree_qos.rsc",
        inputs: [
            { id: "wan_interface", label: "Interfaz WAN", type: "text", default: "ether1", hint: "Interfaz por donde sale tu Internet" },
            { id: "lan_interface", label: "Interfaz LAN", type: "text", default: "bridge-lan", hint: "Bridge o interfaz de la red local" },
            { id: "download_total", label: "Ancho de Banda DOWNLOAD Total", type: "text", default: "100M", hint: "Capacidad real de tu Internet de bajada (usa 85-90% del nominal)" },
            { id: "upload_total", label: "Ancho de Banda UPLOAD Total", type: "text", default: "20M", hint: "Capacidad real de subida (usa 85-90% del nominal)" },
            { id: "prio_voip", label: "Priorizar VoIP / SIP (puerto 5060, RTP, DSCP EF)", type: "checkbox", default: true, hint: "Prioridad 1 - la más alta" },
            { id: "prio_dns", label: "Priorizar DNS e ICMP (puerto 53, Ping)", type: "checkbox", default: true, hint: "Prioridad 2" },
            { id: "prio_gaming", label: "Priorizar Gaming (Xbox, PS, Steam)", type: "checkbox", default: true, hint: "Prioridad 3" },
            { id: "prio_video", label: "Priorizar Video conferencia (Zoom, Meet, Teams)", type: "checkbox", default: true, hint: "Prioridad 4" },
            { id: "prio_streaming", label: "Gestionar Streaming (YouTube, Netflix, Disney+, Prime Video, Twitch, HBO)", type: "checkbox", default: true, hint: "Prioridad 5 - Para fluidez de video" },
            { id: "prio_social", label: "Gestionar Redes Sociales y WhatsApp (Facebook, TikTok, Instagram, Twitter/X, WhatsApp)", type: "checkbox", default: true, hint: "Prioridad 6 - Redes sociales, chat y transferencia de media/archivos" },
            { id: "deprio_bulk", label: "Penalizar descargas masivas (>50MB en una conexión)", type: "checkbox", default: true, hint: "Prioridad 8 (la más baja). Heurística por bytes." },
            { id: "use_pcq", label: "Repartir equitativamente entre usuarios (PCQ)", type: "checkbox", default: true, hint: "Si un usuario satura la línea, comparte entre todos los activos" }
        ]
    };

    function parseBandwidth(val) {
        if (!val) return 0;
        const clean = val.toString().toUpperCase().trim();
        let multiplier = 1;
        let numStr = clean;
        if (clean.endsWith('G')) {
            multiplier = 1000000000;
            numStr = clean.slice(0, -1);
        } else if (clean.endsWith('M')) {
            multiplier = 1000000;
            numStr = clean.slice(0, -1);
        } else if (clean.endsWith('K')) {
            multiplier = 1000;
            numStr = clean.slice(0, -1);
        }
        const num = parseFloat(numStr);
        return isNaN(num) ? 0 : num * multiplier;
    }

    function formatBandwidth(bits) {
        if (bits >= 1000000000) return `${Math.round(bits / 1000000000)}G`;
        if (bits >= 1000000) return `${Math.round(bits / 1000000)}M`;
        if (bits >= 1000) return `${Math.round(bits / 1000)}k`;
        return `${bits}`;
    }

    // Calcula un limit-at proporcional y seguro para evitar saturar el Queue Padre
    function calcLimit(totalBits, pct, minKbps, maxKbps) {
        let val = totalBits * pct;
        if (val < minKbps * 1000) val = minKbps * 1000;
        if (val > maxKbps * 1000) val = maxKbps * 1000;
        if (val > totalBits * 0.5) val = totalBits * 0.1; // Ajuste si la red es demasiado lenta
        return formatBandwidth(val);
    }

    function generate(inputs, version) {
        const wan = inputs.wan_interface || 'ether1';
        const lan = inputs.lan_interface || 'bridge-lan';
        const dl = inputs.download_total || '100M';
        const ul = inputs.upload_total || '20M';
        const queueDl = inputs.use_pcq ? 'pcq-download' : 'default';
        const queueUl = inputs.use_pcq ? 'pcq-upload' : 'default';

        const dlBits = parseBandwidth(dl);
        const ulBits = parseBandwidth(ul);

        const voipLimitDl = calcLimit(dlBits, 0.05, 256, 2000);
        const voipLimitUl = calcLimit(ulBits, 0.05, 128, 1000);

        const dnsLimitDl = calcLimit(dlBits, 0.02, 128, 1000);
        const dnsLimitUl = calcLimit(ulBits, 0.02, 64, 500);

        const gamingLimitDl = calcLimit(dlBits, 0.10, 512, 5000);
        const gamingLimitUl = calcLimit(ulBits, 0.10, 256, 2000);

        const videoLimitDl = calcLimit(dlBits, 0.15, 1000, 10000);
        const videoLimitUl = calcLimit(ulBits, 0.15, 512, 5000);

        const streamingLimitDl = calcLimit(dlBits, 0.20, 2000, 20000);
        const streamingLimitUl = calcLimit(ulBits, 0.20, 512, 5000);

        const socialLimitDl = calcLimit(dlBits, 0.10, 1000, 10000);
        const socialLimitUl = calcLimit(ulBits, 0.10, 256, 2000);

        const normalLimitDl = calcLimit(dlBits, 0.30, 2000, 20000);
        const normalLimitUl = calcLimit(ulBits, 0.30, 512, 5000);

        const bulkLimitDl = calcLimit(dlBits, 0.01, 64, 512);
        const bulkLimitUl = calcLimit(ulBits, 0.01, 32, 256);

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Queue Tree + PCQ con clasificación por servicio\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# DOWNLOAD: ${dl} (Garantizado min VoIP/DNS) | UPLOAD: ${ul}\n`;
        code += `# ====================================================\n`;
        code += `# ADVERTENCIA: Para que esto funcione, debes DESACTIVAR FastTrack\n`;
        code += `# o colocar reglas de Bypass de FastTrack antes de la regla principal.\n`;
        code += `# ====================================================\n\n`;

        code += `# 0. REGALAS RECOMENDADAS PARA BYPASS DE FASTTRACK (Filtro)\n`;
        code += `# Coloca estas reglas en '/ip firewall filter' JUSTO ANTES de la regla de FastTrack\n`;
        code += `# para que el tráfico marcado para QoS no sea puenteado por el kernel.\n`;
        code += `# /ip firewall filter\n`;
        if (inputs.prio_voip) code += `# add chain=forward action=accept connection-state=established,related connection-mark=voip-conn comment="QoS Bypass: VoIP"\n`;
        if (inputs.prio_dns) code += `# add chain=forward action=accept connection-state=established,related packet-mark=dns comment="QoS Bypass: DNS/Ping"\n`;
        if (inputs.prio_gaming) code += `# add chain=forward action=accept connection-state=established,related connection-mark=gaming-conn comment="QoS Bypass: Gaming"\n`;
        if (inputs.prio_video) code += `# add chain=forward action=accept connection-state=established,related connection-mark=video-conn comment="QoS Bypass: Video"\n`;
        if (inputs.prio_streaming) code += `# add chain=forward action=accept connection-state=established,related connection-mark=streaming-conn comment="QoS Bypass: Streaming"\n`;
        if (inputs.prio_social) code += `# add chain=forward action=accept connection-state=established,related connection-mark=social-conn comment="QoS Bypass: Social Media"\n`;
        code += `# add chain=forward action=accept connection-state=established,related connection-mark=normal-conn comment="QoS Bypass: Normal"\n`;
        if (inputs.deprio_bulk) code += `# add chain=forward action=accept connection-state=established,related connection-mark=bulk-conn comment="QoS Bypass: Bulk"\n`;
        code += `\n`;

        let hasAddressList = inputs.prio_streaming || inputs.prio_social;
        if (hasAddressList) {
            code += `# 0.5 ADDRESS LISTS para DNS Snooping (Clasificación de Dominios)\n`;
            code += `/ip firewall address-list\n`;
            if (inputs.prio_streaming) {
                code += `# Dominios de Streaming (YouTube, Netflix, Disney+, Prime, Twitch, Max)\n`;
                code += `add address=youtube.com list=streaming-domains\n`;
                code += `add address=www.youtube.com list=streaming-domains\n`;
                code += `add address=googlevideo.com list=streaming-domains\n`;
                code += `add address=ytimg.com list=streaming-domains\n`;
                code += `add address=netflix.com list=streaming-domains\n`;
                code += `add address=nflxvideo.net list=streaming-domains\n`;
                code += `add address=nflxext.com list=streaming-domains\n`;
                code += `add address=nflximg.net list=streaming-domains\n`;
                code += `add address=twitch.tv list=streaming-domains\n`;
                code += `add address=disneyplus.com list=streaming-domains\n`;
                code += `add address=bamgrid.com list=streaming-domains\n`;
                code += `add address=primevideo.com list=streaming-domains\n`;
                code += `add address=max.com list=streaming-domains\n`;
                code += `add address=hbomax.com list=streaming-domains\n`;
            }
            if (inputs.prio_social) {
                code += `# Dominios de Redes Sociales y WhatsApp (Facebook, Instagram, TikTok, X, WhatsApp)\n`;
                code += `add address=facebook.com list=social-domains\n`;
                code += `add address=www.facebook.com list=social-domains\n`;
                code += `add address=fbcdn.net list=social-domains\n`;
                code += `add address=instagram.com list=social-domains\n`;
                code += `add address=cdninstagram.com list=social-domains\n`;
                code += `add address=tiktok.com list=social-domains\n`;
                code += `add address=tiktokv.com list=social-domains\n`;
                code += `add address=byteoversea.com list=social-domains\n`;
                code += `add address=ibyteimg.com list=social-domains\n`;
                code += `add address=ibytedtos.com list=social-domains\n`;
                code += `add address=whatsapp.com list=social-domains\n`;
                code += `add address=whatsapp.net list=social-domains\n`;
                code += `add address=whatsapp-cdn.net list=social-domains\n`;
                code += `add address=x.com list=social-domains\n`;
                code += `add address=twitter.com list=social-domains\n`;
                code += `add address=twimg.com list=social-domains\n`;
            }
            code += `\n`;
        }

        code += `# 1. MANGLE: clasificar el tráfico marcando paquetes según tipo de servicio\n`;
        code += `# Se usan dos pasos: mark-connection (más eficiente) -> mark-packet\n`;
        code += `/ip firewall mangle\n\n`;

        let priority = 1;
        const services = [];

        if (inputs.prio_voip) {
            code += `# 1.1 VoIP / SIP & DSCP EF (prioridad ${priority})\n`;
            code += `add chain=prerouting protocol=udp port=5060,5061,3478,3479 connection-mark=no-mark action=mark-connection new-connection-mark=voip-conn passthrough=yes comment="VoIP SIP/STUN"\n`;
            code += `add chain=prerouting protocol=udp port=10000-20000 connection-mark=no-mark dst-address-type=!local action=mark-connection new-connection-mark=voip-conn passthrough=yes comment="VoIP RTP"\n`;
            code += `add chain=prerouting dscp=46 connection-mark=no-mark action=mark-connection new-connection-mark=voip-conn passthrough=yes comment="VoIP DSCP EF"\n`;
            code += `add chain=prerouting connection-mark=voip-conn action=mark-packet new-packet-mark=voip passthrough=no comment="VoIP packets"\n\n`;
            // Las colas VoIP usan default-small para saltarse el retraso de encolamiento de PCQ
            services.push({ name: 'VOIP', mark: 'voip', priority: priority, limitAtDl: voipLimitDl, limitAtUl: voipLimitUl, qTypeDl: 'default-small', qTypeUl: 'default-small' });
            priority++;
        }

        if (inputs.prio_dns) {
            code += `# 1.2 DNS & ICMP Ping (prioridad ${priority})\n`;
            code += `add chain=prerouting protocol=udp port=53 action=mark-packet new-packet-mark=dns passthrough=no comment="DNS UDP"\n`;
            code += `add chain=prerouting protocol=tcp port=53 action=mark-packet new-packet-mark=dns passthrough=no comment="DNS TCP"\n`;
            code += `add chain=prerouting protocol=icmp action=mark-packet new-packet-mark=dns passthrough=no comment="ICMP (Ping)"\n\n`;
            // DNS usa default-small para una respuesta instantánea
            services.push({ name: 'DNS', mark: 'dns', priority: priority, limitAtDl: dnsLimitDl, limitAtUl: dnsLimitUl, qTypeDl: 'default-small', qTypeUl: 'default-small' });
            priority++;
        }

        if (inputs.prio_gaming) {
            code += `# 1.3 Gaming (prioridad ${priority})\n`;
            code += `add chain=prerouting protocol=udp port=3074 connection-mark=no-mark action=mark-connection new-connection-mark=gaming-conn passthrough=yes comment="Xbox Live"\n`;
            code += `add chain=prerouting protocol=udp port=3478-3480 connection-mark=no-mark action=mark-connection new-connection-mark=gaming-conn passthrough=yes comment="PlayStation Network"\n`;
            code += `add chain=prerouting protocol=udp port=27000-27050 connection-mark=no-mark action=mark-connection new-connection-mark=gaming-conn passthrough=yes comment="Steam"\n`;
            code += `add chain=prerouting protocol=udp port=27015-27030 connection-mark=no-mark action=mark-connection new-connection-mark=gaming-conn passthrough=yes comment="Source / Valve games"\n`;
            code += `add chain=prerouting connection-mark=gaming-conn action=mark-packet new-packet-mark=gaming passthrough=no\n\n`;
            services.push({ name: 'GAMING', mark: 'gaming', priority: priority, limitAtDl: gamingLimitDl, limitAtUl: gamingLimitUl, qTypeDl: queueDl, qTypeUl: queueUl });
            priority++;
        }

        if (inputs.prio_video) {
            code += `# 1.4 Video conferencia y DSCP AF4 (prioridad ${priority})\n`;
            code += `add chain=prerouting protocol=udp port=8801-8810 connection-mark=no-mark action=mark-connection new-connection-mark=video-conn passthrough=yes comment="Zoom"\n`;
            code += `add chain=prerouting protocol=udp port=3478,19302-19309 connection-mark=no-mark action=mark-connection new-connection-mark=video-conn passthrough=yes comment="Google Meet / STUN"\n`;
            code += `add chain=prerouting protocol=udp port=50000-50059 connection-mark=no-mark action=mark-connection new-connection-mark=video-conn passthrough=yes comment="Teams"\n`;
            code += `add chain=prerouting dscp=34,36,38 connection-mark=no-mark action=mark-connection new-connection-mark=video-conn passthrough=yes comment="Video DSCP AF4"\n`;
            code += `add chain=prerouting connection-mark=video-conn action=mark-packet new-packet-mark=video passthrough=no\n\n`;
            services.push({ name: 'VIDEO', mark: 'video', priority: priority, limitAtDl: videoLimitDl, limitAtUl: videoLimitUl, qTypeDl: queueDl, qTypeUl: queueUl });
            priority++;
        }

        if (inputs.prio_streaming) {
            code += `# 1.5 Streaming (YouTube, Netflix, Disney+, Twitch, Prime, Max) (prioridad ${priority})\n`;
            code += `add chain=prerouting dst-address-list=streaming-domains connection-mark=no-mark action=mark-connection new-connection-mark=streaming-conn passthrough=yes comment="Streaming (YouTube/Netflix/Disney+/Twitch)"\n`;
            code += `add chain=prerouting connection-mark=streaming-conn action=mark-packet new-packet-mark=streaming passthrough=no\n\n`;
            services.push({ name: 'STREAMING', mark: 'streaming', priority: priority, limitAtDl: streamingLimitDl, limitAtUl: streamingLimitUl, qTypeDl: queueDl, qTypeUl: queueUl });
            priority++;
        }

        if (inputs.prio_social) {
            code += `# 1.6 Redes Sociales y WhatsApp (Facebook, TikTok, Instagram, X, WhatsApp) (prioridad ${priority})\n`;
            code += `add chain=prerouting dst-address-list=social-domains connection-mark=no-mark action=mark-connection new-connection-mark=social-conn passthrough=yes comment="Redes Sociales y WhatsApp"\n`;
            code += `add chain=prerouting connection-mark=social-conn action=mark-packet new-packet-mark=social passthrough=no\n\n`;
            services.push({ name: 'SOCIAL', mark: 'social', priority: priority, limitAtDl: socialLimitDl, limitAtUl: socialLimitUl, qTypeDl: queueDl, qTypeUl: queueUl });
            priority++;
        }

        if (inputs.deprio_bulk) {
            code += `# 1.7 Bulk: descargas grandes (heurística: conexiones que ya cargaron >50MB)\n`;
            code += `add chain=prerouting connection-bytes=50000000-0 protocol=tcp connection-mark=no-mark action=mark-connection new-connection-mark=bulk-conn passthrough=yes comment="Bulk transfer (>50MB)"\n`;
            code += `add chain=prerouting connection-mark=bulk-conn action=mark-packet new-packet-mark=bulk passthrough=no\n\n`;
        }

        code += `# 1.8 Resto del tráfico = navegación normal (prioridad ${priority})\n`;
        code += `add chain=prerouting connection-mark=no-mark action=mark-connection new-connection-mark=normal-conn passthrough=yes comment="Tránsito Normal"\n`;
        code += `add chain=prerouting connection-mark=normal-conn action=mark-packet new-packet-mark=normal passthrough=no comment="Tráfico normal"\n\n`;
        services.push({ name: 'NORMAL', mark: 'normal', priority: priority, limitAtDl: normalLimitDl, limitAtUl: normalLimitUl, qTypeDl: queueDl, qTypeUl: queueUl });

        if (inputs.deprio_bulk) {
            services.push({ name: 'BULK', mark: 'bulk', priority: 8, limitAtDl: bulkLimitDl, limitAtUl: bulkLimitUl, qTypeDl: queueDl, qTypeUl: queueUl });
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
            code += `add name=DL-${s.name} parent=DOWNLOAD packet-mark=${s.mark} limit-at=${s.limitAtDl} max-limit=${dl} priority=${s.priority} queue=${s.qTypeDl} comment="Download ${s.name}"\n`;
        });
        code += `\n`;
        services.forEach(s => {
            code += `add name=UL-${s.name} parent=UPLOAD packet-mark=${s.mark} limit-at=${s.limitAtUl} max-limit=${ul} priority=${s.priority} queue=${s.qTypeUl} comment="Upload ${s.name}"\n`;
        });
        code += `\n`;

        code += `# ====================================================\n`;
        code += `# NOTAS\n`;
        code += `# - 'limit-at' = velocidad garantizada calculada proporcionalmente para evitar saturaciones.\n`;
        code += `# - 'max-limit' = techo absoluto (toma todo lo libre si nadie compite).\n`;
        code += `# - 'priority' 1 (alta) -> 8 (baja). Servicios críticos primero.\n`;
        if (inputs.use_pcq) {
            code += `# - PCQ con pcq-rate=0 reparte AUTOMÁTICAMENTE entre los clientes activos.\n`;
            code += `# - Colas VoIP y DNS usan el tipo de cola 'default-small' y se saltan PCQ para evitar jitter.\n`;
        }
        code += `# - IMPORTANTE: Puedes usar las reglas de bypass de FastTrack del Paso 0 o desactivar FastTrack.\n`;
        code += `# ====================================================\n`;
        code += `# MONITORIZAR:\n`;
        code += `#   /queue tree print stats        (ver bytes/rate por cola)\n`;
        code += `#   /ip firewall mangle print stats  (ver paquetes marcados)\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
