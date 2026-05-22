// Bloqueo Layer7 + patrones por dominio. Auto-registra vía window.MTB.
(function () {
    const definition = {
        key: 'layer7-block',
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
    };

    function generate(inputs, version) {
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

    window.MTB.register(definition, generate);
})();
