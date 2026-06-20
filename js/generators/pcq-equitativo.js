(function () {
    const definition = {
        key: 'pcq-equitativo',
        title: 'PCQ Equitativo',
        description: 'Reparte una capacidad total entre las IPs activas sin configurar límites individuales.',
        fileName: 'mikrotik_pcq_equitativo.rsc',
        inputs: [
            { id: 'queue_name', label: 'Nombre de la cola', type: 'text', default: 'PCQ-EQUITATIVO' },
            { id: 'target_mode', label: 'Cómo ingresar los clientes', type: 'select', default: 'range', options: [
                { value: 'range', label: 'Rango de IPs' },
                { value: 'manual', label: 'Lista de IPs o subredes' }
            ] },
            { id: 'client_targets', label: 'Clientes (IP o subred)', type: 'textarea', default: '192.168.88.0/24', hint: 'Una IP o subred por línea; también acepta comas.' },
            { id: 'range_start', label: 'Primera IP del rango', type: 'text', default: '192.168.88.10', hint: 'Primera dirección incluida en el reparto.' },
            { id: 'range_end', label: 'Última IP del rango', type: 'text', default: '192.168.88.50', hint: 'Máximo 256 direcciones por rango.' },
            { id: 'total_up', label: 'Ancho total de subida', type: 'text', default: '20M', hint: 'PCQ lo reparte entre los clientes activos.' },
            { id: 'total_down', label: 'Ancho total de bajada', type: 'text', default: '100M', hint: 'PCQ lo reparte entre los clientes activos.' }
        ]
    };

    function escapeName(value) {
        return String(value || '').replace(/["\\]/g, '').trim() || 'PCQ-EQUITATIVO';
    }

    function queueToken(value) {
        return escapeName(value)
            .replace(/[^0-9a-zA-Z_-]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'PCQ-EQUITATIVO';
    }

    function parseTargets(value) {
        return [...new Set(String(value || '')
            .split(/[\s,;]+/)
            .map(target => target.trim())
            .filter(Boolean))];
    }

    function ipToNumber(value) {
        const octets = String(value || '').trim().split('.');
        if (octets.length !== 4) return null;
        const numbers = octets.map(octet => Number(octet));
        if (numbers.some((octet, index) => !Number.isInteger(octet) || octet < 0 || octet > 255 || String(octet) !== octets[index])) {
            return null;
        }
        return numbers.reduce((result, octet) => result * 256 + octet, 0);
    }

    function numberToIp(value) {
        return [24, 16, 8, 0]
            .map(shift => Math.floor(value / (2 ** shift)) % 256)
            .join('.');
    }

    function targetsFromRange(startValue, endValue) {
        const start = ipToNumber(startValue);
        const end = ipToNumber(endValue);
        if (start === null || end === null) {
            return { targets: [], error: 'La IP inicial o final no es una dirección IPv4 válida.' };
        }
        if (end < start) {
            return { targets: [], error: 'La IP final debe ser igual o mayor que la IP inicial.' };
        }
        const count = end - start + 1;
        if (count > 256) {
            return { targets: [], error: `El rango contiene ${count} direcciones; el máximo permitido es 256.` };
        }
        const targets = [];
        for (let current = start; current <= end; current++) {
            targets.push(`${numberToIp(current)}/32`);
        }
        return { targets, error: null };
    }

    function validRate(value) {
        return /^(\d+(?:\.\d+)?)\s*([kKmMgG])?$/.test(String(value || '').trim());
    }

    function generate(inputs, version) {
        const targetResult = inputs.target_mode === 'range'
            ? targetsFromRange(inputs.range_start, inputs.range_end)
            : { targets: parseTargets(inputs.client_targets), error: null };
        const targets = targetResult.targets;
        const name = escapeName(inputs.queue_name);
        const token = queueToken(inputs.queue_name);
        const uploadType = `${token}-UPLOAD`;
        const downloadType = `${token}-DOWNLOAD`;

        let code = '# ====================================================\n';
        code += '# SCRIPT: Reparto equitativo con PCQ\n';
        code += `# RouterOS: ${String(version).toUpperCase()} | Objetivos configurados: ${targets.length}\n`;
        code += `# Capacidad total: ${inputs.total_up} subida / ${inputs.total_down} bajada\n`;
        code += '# PCQ-RATE=0 distribuye dinámicamente entre las IPs activas\n';
        code += '# ====================================================\n\n';

        if (targetResult.error) return `${code}# ERROR: ${targetResult.error}\n`;
        if (!targets.length) return `${code}# ERROR: agregue al menos una IP o subred de clientes.\n`;
        if (!validRate(inputs.total_up) || !validRate(inputs.total_down)) {
            return `${code}# ERROR: use velocidades válidas, por ejemplo 512k, 20M o 1G.\n`;
        }

        code += '# IMPORTANTE: desactive FastTrack o excluya de FastTrack este tráfico.\n\n';
        code += '/queue type\n';
        code += `add name="${uploadType}" kind=pcq pcq-rate=0 \\\n`;
        code += '    pcq-classifier=src-address comment="PCQ equitativo por IP de origen"\n';
        code += `add name="${downloadType}" kind=pcq pcq-rate=0 \\\n`;
        code += '    pcq-classifier=dst-address comment="PCQ equitativo por IP de destino"\n\n';

        code += '/queue simple\n';
        code += `add name="${name}" target=${targets.join(',')} \\\n`;
        code += `    max-limit=${inputs.total_up}/${inputs.total_down} \\\n`;
        code += `    queue=${uploadType}/${downloadType} \\\n`;
        code += `    comment="PCQ dinámico para ${targets.length} objetivo(s)"\n\n`;

        code += '# MONITOREO\n';
        code += '# /queue simple print stats where name="' + name + '"\n';
        code += '# /queue simple print detail where name="' + name + '"\n';
        return code;
    }

    window.MTB.register(definition, generate);
})();
