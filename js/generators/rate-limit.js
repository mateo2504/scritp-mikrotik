(function () {
    const definition = {
        key: 'rate-limit',
        title: "Generador de Ráfagas (Rate-Limit)",
        description: "Genera la cadena de texto exacta de velocidad y ráfagas (rate-limit) lista para copiar y pegar en perfiles de MikroTik.",
        fileName: "rate_limit_mikrotik.txt",
        inputs: [
            { id: "upload_limit", label: "Límite de Subida (Max Limit)", type: "text", default: "2M", hint: "Velocidad máxima normal (ej: 2M, 512k)" },
            { id: "download_limit", label: "Límite de Bajada (Max Limit)", type: "text", default: "10M", hint: "Velocidad máxima normal (ej: 10M, 4M)" },
            
            { id: "use_burst", label: "Habilitar Ráfagas (Burst)", type: "checkbox", default: true, hint: "Permite picos de velocidad temporales" },
            { id: "upload_burst", label: "Ráfaga de Subida (Burst Limit)", type: "text", default: "4M", hint: "Velocidad pico durante ráfaga (ej: 4M)" },
            { id: "download_burst", label: "Ráfaga de Bajada (Burst Limit)", type: "text", default: "20M", hint: "Velocidad pico durante ráfaga (ej: 20M)" },
            { id: "upload_threshold", label: "Umbral de Subida (Burst Threshold)", type: "text", default: "1.5M", hint: "Umbral para activar ráfaga (ej: 1.5M)" },
            { id: "download_threshold", label: "Umbral de Bajada (Burst Threshold)", type: "text", default: "8M", hint: "Umbral para activar ráfaga (ej: 8M)" },
            { id: "upload_time", label: "Tiempo de Subida (Burst Time)", type: "text", default: "16", hint: "Tiempo en segundos para promedio de subida (ej: 16)" },
            { id: "download_time", label: "Tiempo de Bajada (Burst Time)", type: "text", default: "16", hint: "Tiempo en segundos para promedio de bajada (ej: 16)" },
            
            { id: "use_priority_limitat", label: "Habilitar Límite Garantizado (Limit-At) y Prioridad", type: "checkbox", default: true, hint: "Asigna prioridad y ancho de banda asegurado" },
            { id: "priority", label: "Prioridad de Cola", type: "select", default: "8", options: [
                { value: "1", label: "1 (Máxima)" },
                { value: "2", label: "2" },
                { value: "3", label: "3" },
                { value: "4", label: "4" },
                { value: "5", label: "5" },
                { value: "6", label: "6" },
                { value: "7", label: "7" },
                { value: "8", label: "8 (Mínima / Defecto)" }
            ] },
            { id: "upload_limit_at", label: "Subida Garantizada (Limit At)", type: "text", default: "1M", hint: "Mínimo ancho de banda asegurado (ej: 1M)" },
            { id: "download_limit_at", label: "Bajada Garantizada (Limit At)", type: "text", default: "5M", hint: "Mínimo ancho de banda asegurado (ej: 5M)" }
        ]
    };

    function generate(inputs, version) {
        const upLimit = inputs.upload_limit || '0';
        const downLimit = inputs.download_limit || '0';
        
        let rateLimitStr = `${upLimit}/${downLimit}`;
        
        const useBurst = inputs.use_burst;
        const usePriority = inputs.use_priority_limitat;
        
        let details = '';
        
        if (useBurst || usePriority) {
            let upBurst = '0';
            let downBurst = '0';
            let upThreshold = '0';
            let downThreshold = '0';
            let upTime = '0';
            let downTime = '0';
            
            if (useBurst) {
                upBurst = inputs.upload_burst || '0';
                downBurst = inputs.download_burst || '0';
                upThreshold = inputs.upload_threshold || '0';
                downThreshold = inputs.download_threshold || '0';
                upTime = inputs.upload_time || '0';
                downTime = inputs.download_time || '0';
            }
            
            rateLimitStr += ` ${upBurst}/${downBurst} ${upThreshold}/${downThreshold} ${upTime}/${downTime}`;
            
            if (usePriority) {
                const priorityVal = inputs.priority || '8';
                const upLimitAt = inputs.upload_limit_at || '0';
                const downLimitAt = inputs.download_limit_at || '0';
                
                rateLimitStr += ` ${priorityVal} ${upLimitAt}/${downLimitAt}`;
            }
        }
        
        // Construimos el output informativo
        let code = `# ====================================================\n`;
        code += `# CADENA RATE-LIMIT MIKROTIK (PPPoE / Hotspot / Secrets)\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;
        code += `# Copia únicamente la siguiente línea y pégala en el campo 'Rate Limit' del Profile o Secret:\n\n`;
        
        code += `${rateLimitStr}\n\n`;
        
        code += `# ====================================================\n`;
        code += `# EXPLICACIÓN DETALLADA DE ESTA CONFIGURACIÓN:\n`;
        code += `# ----------------------------------------------------\n`;
        code += `# 1. Límites Nominales (Max Limit): Subida: ${upLimit} | Bajada: ${downLimit}\n`;
        code += `#    Velocidades a las que se limitará al cliente una vez expire o no califique para la ráfaga.\n`;
        
        if (useBurst) {
            const upBurst = inputs.upload_burst || '0';
            const downBurst = inputs.download_burst || '0';
            const upThreshold = inputs.upload_threshold || '0';
            const downThreshold = inputs.download_threshold || '0';
            const upTime = inputs.upload_time || '0';
            const downTime = inputs.download_time || '0';
            
            code += `#\n`;
            code += `# 2. Velocidad de Ráfaga (Burst Limit): Subida: ${upBurst} | Bajada: ${downBurst}\n`;
            code += `#    La velocidad pico máxima que alcanzará el cliente al iniciar una descarga pesada.\n`;
            code += `#\n`;
            code += `# 3. Umbral de Ráfaga (Burst Threshold): Subida: ${upThreshold} | Bajada: ${downThreshold}\n`;
            code += `#    Si el consumo promedio del cliente supera este valor, la ráfaga se detiene\n`;
            code += `#    y baja a la velocidad nominal (${upLimit}/${downLimit}). Si cae por debajo, la ráfaga se reactiva.\n`;
            code += `#    Recomendación: Se suele configurar entre el 70% y el 85% de la velocidad nominal.\n`;
            code += `#\n`;
            code += `# 4. Tiempo de Ráfaga (Burst Time): Subida: ${upTime}s | Bajada: ${downTime}s\n`;
            code += `#    Tiempo usado por el Router para calcular el consumo promedio (promedio móvil).\n`;
            code += `#    OJO: NO es la duración exacta de la ráfaga. La duración real de la ráfaga es menor\n`;
            code += `#    y se calcula internamente como: (Burst-Threshold * Burst-Time) / Burst-Limit.\n`;
        } else if (usePriority) {
            code += `#\n`;
            code += `# (*) Ráfagas desactivadas (se autocompletan con 0/0 0/0 0/0 para mantener la posición).\n`;
        }
        
        if (usePriority) {
            const priorityVal = inputs.priority || '8';
            const upLimitAt = inputs.upload_limit_at || '0';
            const downLimitAt = inputs.download_limit_at || '0';
            
            code += `#\n`;
            code += `# 5. Prioridad de la Cola: ${priorityVal} (1 = Máxima, 8 = Mínima)\n`;
            code += `#    Determina qué clientes obtienen prioridad para consumir ancho de banda cuando el canal se satura.\n`;
            code += `#\n`;
            code += `# 6. Ancho de Banda Garantizado (Limit At): Subida: ${upLimitAt} | Bajada: ${downLimitAt}\n`;
            code += `#    La velocidad mínima que el Router garantiza al cliente incluso si la red está saturada.\n`;
        }
        
        code += `# ====================================================\n`;
        
        return code;
    }

    window.MTB.register(definition, generate);
})();
