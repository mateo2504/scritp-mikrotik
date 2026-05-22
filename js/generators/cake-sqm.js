// CAKE / SQM - Anti-bufferbloat moderno (v7+). Auto-registra vía window.MTB.
(function () {
    const definition = {
        key: 'cake-sqm',
        title: "CAKE / SQM (Anti-Bufferbloat)",
        description: "Reduce drásticamente la latencia bajo carga ('bufferbloat') usando el algoritmo CAKE. Mantiene tu conexión 'responsiva' aunque alguien esté descargando algo grande. Solo RouterOS v7+.",
        fileName: "mikrotik_cake_sqm.rsc",
        isV7Only: true,
        inputs: [
            { id: "wan_interface", label: "Interfaz WAN", type: "text", default: "ether1" },
            { id: "lan_network", label: "Red LAN (CIDR)", type: "text", default: "192.168.88.0/24", hint: "Subred que será regulada (Simple Queue por target)" },
            { id: "download_speed", label: "Velocidad DOWNLOAD Real", type: "text", default: "100M", hint: "Usa el 85-90% del nominal. Ej: contrato 100M -> 90M aquí." },
            { id: "upload_speed", label: "Velocidad UPLOAD Real", type: "text", default: "20M", hint: "Usa el 85-90% del nominal" },
            {
                id: "overhead_preset",
                label: "Overhead del enlace",
                type: "select",
                options: [
                    { value: "ethernet", label: "Ethernet puro / fibra (18)" },
                    { value: "pppoe", label: "PPPoE sobre Ethernet (38) - común en ISPs" },
                    { value: "docsis", label: "Cable DOCSIS (18)" },
                    { value: "vdsl2", label: "VDSL2 (22)" },
                    { value: "manual", label: "Manual (escribir abajo)" }
                ],
                default: "pppoe",
                hint: "Bytes adicionales por paquete del protocolo de transporte"
            },
            { id: "overhead_manual", label: "Overhead Manual (bytes)", type: "text", default: "38", hint: "Solo si seleccionaste 'Manual' arriba" },
            {
                id: "flowmode",
                label: "Modo de Justicia (Flow Isolation)",
                type: "select",
                options: [
                    { value: "triple-isolate", label: "Triple Isolate (recomendado: por host + flow)" },
                    { value: "dual-srchost", label: "Dual SrcHost (por origen)" },
                    { value: "dual-dsthost", label: "Dual DstHost (por destino)" },
                    { value: "flowblind", label: "Flow-blind (ignora hosts)" }
                ],
                default: "triple-isolate",
                hint: "triple-isolate garantiza que ningún cliente individual saturará al resto"
            },
            { id: "rtt", label: "RTT típico (ms)", type: "text", default: "100", hint: "100ms está bien para la mayoría de conexiones residenciales. Móvil 4G/5G usa 200ms." },
            { id: "nat_aware", label: "NAT Aware (cake-nat=yes)", type: "checkbox", default: true, hint: "Activa si el router hace NAT. Permite que CAKE 'vea' las IPs internas para justicia por host." },
            { id: "wash_dscp", label: "Limpiar marcas DSCP entrantes (cake-wash)", type: "checkbox", default: false, hint: "Resetea las marcas DSCP que vienen del ISP. Útil si tu ISP marca mal." },
            {
                id: "diffserv",
                label: "Modo DiffServ (priorización por DSCP)",
                type: "select",
                options: [
                    { value: "besteffort", label: "BestEffort (sin prioridades - recomendado)" },
                    { value: "diffserv4", label: "DiffServ4 (4 tiers: voz/video/normal/bulk)" },
                    { value: "diffserv8", label: "DiffServ8 (8 tiers - granular)" },
                    { value: "diffserv3", label: "DiffServ3 (3 tiers)" }
                ],
                default: "besteffort",
                hint: "BestEffort si no usas marcas DSCP. DiffServ4+ si tu red ya marca DSCP correctamente."
            }
        ]
    };

    function generate(inputs, version) {
        if (version === 'v6') {
            return `# ====================================================\n# ERROR: CAKE solo está disponible en RouterOS v7+\n# ====================================================\n# RouterOS v6 no tiene queue-type 'cake'. Usa Queue Tree + PCQ tradicional.\n# Cambia el selector arriba a la derecha a 'v7'.\n`;
        }

        const overheadMap = {
            ethernet: 18,
            pppoe: 38,
            docsis: 18,
            vdsl2: 22
        };
        const overhead = inputs.overhead_preset === 'manual'
            ? (inputs.overhead_manual || '38')
            : overheadMap[inputs.overhead_preset] || 38;

        const dl = inputs.download_speed || '100M';
        const ul = inputs.upload_speed || '20M';
        const flow = inputs.flowmode || 'triple-isolate';
        const rtt = inputs.rtt || '100';
        const lan = inputs.lan_network || '192.168.88.0/24';
        const wan = inputs.wan_interface || 'ether1';
        const diffserv = inputs.diffserv || 'besteffort';
        const natFlag = inputs.nat_aware ? 'yes' : 'no';
        const washFlag = inputs.wash_dscp ? 'yes' : 'no';

        let code = `# ====================================================\n`;
        code += `# SCRIPT: CAKE / SQM (Anti-Bufferbloat)\n`;
        code += `# RouterOS Version: v7+\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Velocidad: DL ${dl} / UL ${ul}\n`;
        code += `# Overhead: ${overhead} bytes (${inputs.overhead_preset})\n`;
        code += `# ====================================================\n`;
        code += `# QUÉ HACE: CAKE mantiene la latencia BAJA aunque alguien sature la línea.\n`;
        code += `# Sin esto, una descarga grande sube tu ping de 20ms a 500ms+.\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Definir queue types CAKE (uno por dirección)\n`;
        code += `/queue type\n`;
        code += `add name=cake-download kind=cake `;
        code += `cake-bandwidth=${dl} `;
        code += `cake-overhead=${overhead} `;
        code += `cake-rtt=${rtt}ms `;
        code += `cake-flowmode=${flow} `;
        code += `cake-diffserv=${diffserv} `;
        code += `cake-nat=${natFlag} `;
        code += `cake-wash=${washFlag} `;
        code += `comment="CAKE shaper download"\n`;

        code += `add name=cake-upload kind=cake `;
        code += `cake-bandwidth=${ul} `;
        code += `cake-overhead=${overhead} `;
        code += `cake-rtt=${rtt}ms `;
        code += `cake-flowmode=${flow} `;
        code += `cake-diffserv=${diffserv} `;
        code += `cake-nat=${natFlag} `;
        code += `cake-wash=${washFlag} `;
        code += `cake-ack-filter=filter `;
        code += `comment="CAKE shaper upload (ack-filter on)"\n\n`;

        code += `# 2. Aplicar CAKE como Simple Queue al rango LAN\n`;
        code += `# target = la red LAN entera. CAKE se encarga del resto.\n`;
        code += `/queue simple\n`;
        code += `add name=SQM-CAKE target=${lan} max-limit=${ul}/${dl} queue=cake-upload/cake-download comment="CAKE SQM - anti bufferbloat"\n\n`;

        code += `# ====================================================\n`;
        code += `# AJUSTE FINO (tras configurar)\n`;
        code += `# Mide tu bufferbloat:\n`;
        code += `#   - https://www.waveform.com/tools/bufferbloat\n`;
        code += `#   - https://speed.cloudflare.com (mira 'Loaded Latency')\n`;
        code += `# Objetivo: A+ o A en bufferbloat (latencia +<20ms bajo carga).\n`;
        code += `#\n`;
        code += `# Si el ping aún sube bajo carga, BAJA las velocidades:\n`;
        code += `#   /queue type set cake-download cake-bandwidth=${parseFloat(dl) * 0.8}M\n`;
        code += `#   /queue type set cake-upload cake-bandwidth=${parseFloat(ul) * 0.8}M\n`;
        code += `# Si el internet va MUY lento, subiste demasiado abajo. Aumenta de a 5M.\n`;
        code += `# ====================================================\n`;
        code += `# MONITORIZAR:\n`;
        code += `#   /queue simple print stats          (ver paquetes encolados)\n`;
        code += `#   /queue simple print detail         (ver shaper rates reales)\n`;
        code += `# Para desactivar temporalmente: /queue simple disable [find name=SQM-CAKE]\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
