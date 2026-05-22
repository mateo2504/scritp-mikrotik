// Priorización de clientes por Address-List. Auto-registra vía window.MTB.
(function () {
    const definition = {
        key: 'priority-address-list',
        title: "Priorización por Address-List",
        description: "Marca IPs/clientes como prioritarios (gerentes, VoIP, cámaras IP) y les garantiza ancho de banda mínimo + prioridad alta sobre el resto. Simple y efectivo.",
        fileName: "mikrotik_priority_address_list.rsc",
        inputs: [
            { id: "wan_interface", label: "Interfaz WAN", type: "text", default: "ether1" },
            { id: "lan_interface", label: "Interfaz LAN", type: "text", default: "bridge-lan" },
            { id: "download_total", label: "Ancho de Banda DOWNLOAD Total", type: "text", default: "100M", hint: "Usa el 85-90% del nominal contratado" },
            { id: "upload_total", label: "Ancho de Banda UPLOAD Total", type: "text", default: "20M" },
            { id: "list_name", label: "Nombre Address-List Prioritaria", type: "text", default: "priority-clients" },
            { id: "priority_clients", label: "IPs/Hosts Prioritarios (uno por línea)", type: "textarea", default: "192.168.88.10\n192.168.88.20\n192.168.88.50", hint: "IPs o rangos CIDR de clientes con prioridad alta" },
            { id: "guaranteed_dl", label: "Garantizado DL para Prioritarios", type: "text", default: "50M", hint: "Mínimo asegurado bajo congestión" },
            { id: "guaranteed_ul", label: "Garantizado UL para Prioritarios", type: "text", default: "10M" },
            { id: "guaranteed_dl_normal", label: "Garantizado DL para el Resto", type: "text", default: "10M" },
            { id: "guaranteed_ul_normal", label: "Garantizado UL para el Resto", type: "text", default: "2M" },
            { id: "fair_share_within_normal", label: "Reparto Justo (PCQ) en el grupo normal", type: "checkbox", default: true, hint: "Reparte equitativamente el ancho 'normal' entre los clientes no prioritarios" }
        ]
    };

    function generate(inputs, version) {
        const wan = inputs.wan_interface || 'ether1';
        const lan = inputs.lan_interface || 'bridge-lan';
        const listName = inputs.list_name || 'priority-clients';
        const dlTotal = inputs.download_total || '100M';
        const ulTotal = inputs.upload_total || '20M';

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Priorización por Address-List\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# DOWNLOAD total: ${dlTotal}  |  UPLOAD total: ${ulTotal}\n`;
        code += `# ====================================================\n`;
        code += `# ADVERTENCIA: Desactiva FastTrack en /ip firewall filter para que esto funcione.\n`;
        code += `# ====================================================\n\n`;

        const clients = (inputs.priority_clients || '').split('\n').map(l => l.trim()).filter(l => l.length > 0);

        code += `# 1. Address-list con los clientes prioritarios\n`;
        code += `/ip firewall address-list\n`;
        if (clients.length === 0) {
            code += `# (Sin clientes definidos - agrégalos manualmente con):\n`;
            code += `# add list=${listName} address=192.168.88.10 comment="Cliente prioritario"\n`;
        } else {
            clients.forEach((ip, i) => {
                code += `add list=${listName} address=${ip} comment="Prioritario ${i + 1}"\n`;
            });
        }
        code += `\n`;

        code += `# 2. MANGLE: marcar paquetes según prioridad (dirección DL y UL por separado)\n`;
        code += `/ip firewall mangle\n`;
        code += `# Download: tráfico que VA hacia un cliente prioritario\n`;
        code += `add chain=forward dst-address-list=${listName} in-interface=${wan} action=mark-packet new-packet-mark=priority-dl passthrough=no comment="Priority DL"\n`;
        code += `add chain=forward in-interface=${wan} action=mark-packet new-packet-mark=normal-dl passthrough=no comment="Normal DL"\n`;
        code += `# Upload: tráfico que VIENE de un cliente prioritario\n`;
        code += `add chain=forward src-address-list=${listName} out-interface=${wan} action=mark-packet new-packet-mark=priority-ul passthrough=no comment="Priority UL"\n`;
        code += `add chain=forward out-interface=${wan} action=mark-packet new-packet-mark=normal-ul passthrough=no comment="Normal UL"\n\n`;

        if (inputs.fair_share_within_normal) {
            code += `# 3. QUEUE TYPE: PCQ para reparto justo entre clientes no prioritarios\n`;
            code += `/queue type\n`;
            code += `add name=pcq-normal-dl kind=pcq pcq-rate=0 pcq-classifier=dst-address pcq-limit=50 pcq-total-limit=2000 comment="PCQ normal DL"\n`;
            code += `add name=pcq-normal-ul kind=pcq pcq-rate=0 pcq-classifier=src-address pcq-limit=50 pcq-total-limit=2000 comment="PCQ normal UL"\n\n`;
        }

        const normalQueueDl = inputs.fair_share_within_normal ? 'pcq-normal-dl' : 'default';
        const normalQueueUl = inputs.fair_share_within_normal ? 'pcq-normal-ul' : 'default';

        code += `# 4. QUEUE TREE: padres con el ancho de banda real, hijos por prioridad\n`;
        code += `/queue tree\n\n`;

        code += `# 4.1 Download (parent = LAN, sale hacia los clientes)\n`;
        code += `add name=DOWNLOAD parent=${lan} max-limit=${dlTotal} comment="Total download"\n`;
        code += `add name=DL-PRIORITY parent=DOWNLOAD packet-mark=priority-dl limit-at=${inputs.guaranteed_dl} max-limit=${dlTotal} priority=2 comment="Download Prioritario"\n`;
        code += `add name=DL-NORMAL parent=DOWNLOAD packet-mark=normal-dl limit-at=${inputs.guaranteed_dl_normal} max-limit=${dlTotal} priority=6 queue=${normalQueueDl} comment="Download Normal"\n\n`;

        code += `# 4.2 Upload (parent = WAN, sale hacia Internet)\n`;
        code += `add name=UPLOAD parent=${wan} max-limit=${ulTotal} comment="Total upload"\n`;
        code += `add name=UL-PRIORITY parent=UPLOAD packet-mark=priority-ul limit-at=${inputs.guaranteed_ul} max-limit=${ulTotal} priority=2 comment="Upload Prioritario"\n`;
        code += `add name=UL-NORMAL parent=UPLOAD packet-mark=normal-ul limit-at=${inputs.guaranteed_ul_normal} max-limit=${ulTotal} priority=6 queue=${normalQueueUl} comment="Upload Normal"\n\n`;

        code += `# ====================================================\n`;
        code += `# AGREGAR / QUITAR CLIENTES PRIORITARIOS EN CALIENTE\n`;
        code += `#   /ip firewall address-list add list=${listName} address=192.168.88.X comment="VIP"\n`;
        code += `#   /ip firewall address-list remove [find list=${listName} address=192.168.88.X]\n`;
        code += `# Los cambios surten efecto inmediatamente sin reiniciar nada.\n`;
        code += `# ====================================================\n`;
        code += `# IDEAS:\n`;
        code += `# - Apunta cámaras IP, NVR y teléfonos VoIP a la lista 'priority-clients'.\n`;
        code += `# - Combina con DHCP static binding (MAC->IP) para que las IPs no cambien.\n`;
        code += `# - Si el resto consume todo, los prioritarios siempre tendrán ${inputs.guaranteed_dl} DL / ${inputs.guaranteed_ul} UL.\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
