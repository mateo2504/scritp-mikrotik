(function () {
    const definition = {
        key: 'reuso',
        title: 'Reuso de Ancho de Banda',
        description: 'Crea una cola padre compartida y una cola hija por cliente, con garantía automática según el factor de reuso.',
        fileName: 'mikrotik_reuso.rsc',
        inputs: [
            { id: 'parent_name', label: 'Nombre del grupo', type: 'text', default: 'PLAN-100M-REUSO-1A4' },
            { id: 'target_mode', label: 'Cómo ingresar los clientes', type: 'select', default: 'manual', options: [
                { value: 'manual', label: 'Lista de IPs' },
                { value: 'range', label: 'Rango de IPs' }
            ] },
            { id: 'client_targets', label: 'Clientes (IP o subred)', type: 'textarea', default: '192.168.88.101/32\n192.168.88.102/32\n192.168.88.103/32\n192.168.88.104/32', hint: 'Una IP por línea; también acepta comas.' },
            { id: 'range_start', label: 'Primera IP del rango', type: 'text', default: '192.168.88.101', hint: 'Se generará una cola /32 para esta IP y las siguientes.' },
            { id: 'range_end', label: 'Última IP del rango', type: 'text', default: '192.168.88.104', hint: 'Máximo 256 direcciones por rango.' },
            { id: 'shared_up', label: 'Capacidad compartida de subida', type: 'text', default: '100M', hint: 'Máximo de la cola padre.' },
            { id: 'shared_down', label: 'Capacidad compartida de bajada', type: 'text', default: '100M', hint: 'Máximo de la cola padre.' },
            { id: 'reuse_ratio', label: 'Factor de reuso 1 a N', type: 'text', default: '4', hint: 'Ejemplo: 4 equivale a reuso 1:4.' },
            { id: 'client_max_up', label: 'Máximo por cliente — subida', type: 'text', default: '100M' },
            { id: 'client_max_down', label: 'Máximo por cliente — bajada', type: 'text', default: '100M' },
            { id: 'priority', label: 'Prioridad de las colas hijas', type: 'select', default: '8', options: [
                { value: '1', label: '1 — más alta' },
                { value: '4', label: '4 — media alta' },
                { value: '6', label: '6 — media' },
                { value: '8', label: '8 — normal' }
            ] },
            { id: 'use_pcq', label: 'Usar PCQ predeterminado en clientes', type: 'checkbox', default: true, hint: 'Reparte de forma equitativa cuando una cola incluye más de un flujo.' }
        ]
    };

    function escapeName(value) {
        return String(value || '').replace(/["\\]/g, '').trim() || 'REUSO';
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
        if (numbers.some((octet, index) => !Number.isInteger(octet) || octet < 0 || octet > 255 || String(numbers[index]) !== octets[index])) {
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

    function parseRate(value) {
        const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)\s*([kKmMgG])?$/);
        if (!match) return null;
        const multipliers = { k: 1, m: 1024, g: 1024 * 1024 };
        return Number(match[1]) * (multipliers[(match[2] || 'k').toLowerCase()] || 1);
    }

    function formatRate(kbps) {
        if (!Number.isFinite(kbps) || kbps <= 0) return '0';
        if (kbps >= 1024 && Math.abs(kbps / 1024 - Math.round(kbps / 1024)) < 0.0001) {
            return `${Math.round(kbps / 1024)}M`;
        }
        return `${Math.max(1, Math.floor(kbps))}k`;
    }

    function generate(inputs, version) {
        const rangeResult = inputs.target_mode === 'range'
            ? targetsFromRange(inputs.range_start, inputs.range_end)
            : { targets: parseTargets(inputs.client_targets), error: null };
        const targets = rangeResult.targets;
        const ratio = Math.max(1, parseInt(inputs.reuse_ratio, 10) || 1);
        const sharedUp = parseRate(inputs.shared_up);
        const sharedDown = parseRate(inputs.shared_down);
        const parentName = escapeName(inputs.parent_name);
        const guaranteeUp = formatRate(sharedUp === null ? NaN : sharedUp / ratio);
        const guaranteeDown = formatRate(sharedDown === null ? NaN : sharedDown / ratio);
        const queueType = inputs.use_pcq ? 'pcq-upload-default/pcq-download-default' : 'default-small/default-small';

        let code = '# ====================================================\n';
        code += '# SCRIPT: Reuso de ancho de banda con Simple Queues\n';
        code += `# RouterOS: ${String(version).toUpperCase()} | Reuso: 1:${ratio}\n`;
        code += `# Clientes: ${targets.length} | Garantizado: ${guaranteeUp}/${guaranteeDown}\n`;
        code += '# Orden: ejecute el script completo para crear padre e hijos\n';
        code += '# ====================================================\n\n';

        if (rangeResult.error) {
            return `${code}# ERROR: ${rangeResult.error}\n`;
        }
        if (!targets.length) {
            return `${code}# ERROR: agregue al menos una IP de cliente.\n`;
        }
        if (sharedUp === null || sharedDown === null) {
            return `${code}# ERROR: use velocidades válidas, por ejemplo 512k, 20M o 1G.\n`;
        }
        if (targets.length > ratio) {
            code += `# ADVERTENCIA: hay ${targets.length} clientes para un reuso 1:${ratio}.\n`;
            code += '# La suma de garantías puede superar la capacidad del padre.\n\n';
        }

        code += '/queue simple\n';
        code += `add name="${parentName}" target=${targets.join(',')} \\\n`;
        code += `    max-limit=${inputs.shared_up}/${inputs.shared_down} \\\n`;
        code += `    comment="Reuso 1:${ratio} - ${targets.length} clientes"\n\n`;

        targets.forEach((target, index) => {
            const clientId = target.replace(/[^0-9a-zA-Z]+/g, '-').replace(/^-|-$/g, '');
            code += `add name="${parentName}-C${index + 1}-${clientId}" \\\n`;
            code += `    parent="${parentName}" target=${target} \\\n`;
            code += `    limit-at=${guaranteeUp}/${guaranteeDown} \\\n`;
            code += `    max-limit=${inputs.client_max_up}/${inputs.client_max_down} \\\n`;
            code += `    priority=${inputs.priority}/${inputs.priority} queue=${queueType} \\\n`;
            code += `    comment="Cliente ${index + 1} - reuso 1:${ratio}"\n`;
        });

        return code;
    }

    window.MTB.register(definition, generate);
})();
