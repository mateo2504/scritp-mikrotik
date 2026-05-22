// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'simple-queue',
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
};

    function generate(inputs, version) {
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
    }

    window.MTB.register(definition, generate);
})();
