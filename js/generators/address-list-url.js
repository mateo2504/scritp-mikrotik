// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'address-list-url',
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
};

    function generate(inputs, version) {
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
    }

    window.MTB.register(definition, generate);
})();
