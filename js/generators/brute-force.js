// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'brute-force',
    title: "Protección Anti Brute-Force",
    description: "Bloqueo automático de IPs que intentan acceder masivamente a SSH, Winbox, API o WWW. Usa stages de address-list para banear progresivamente tras N intentos.",
    fileName: "mikrotik_brute_force.rsc",
    inputs: [
        { id: "protect_ssh", label: "Proteger SSH (puerto 22)", type: "checkbox", default: true },
        { id: "protect_winbox", label: "Proteger Winbox (puerto 8291)", type: "checkbox", default: true },
        { id: "protect_api", label: "Proteger API (puerto 8728/8729)", type: "checkbox", default: true },
        { id: "protect_www", label: "Proteger WWW/Webfig (puerto 80/443)", type: "checkbox", default: false },
        { id: "custom_ports", label: "Puertos Adicionales (opcional, coma)", type: "text", default: "", hint: "Ej: 21,23 - dejar vacío si no necesitas más" },
        { id: "stage_timeout", label: "Timeout entre Stages", type: "text", default: "1m", hint: "Tiempo para que el atacante 'olvide' un intento (clásico: 1m)" },
        { id: "blacklist_timeout", label: "Tiempo de Bloqueo Final", type: "text", default: "1w", hint: "Cuánto tiempo queda baneado el atacante (ej: 1d, 1w, 30d)" },
        { id: "whitelist_ips", label: "Whitelist (IPs/Redes Confiables)", type: "textarea", default: "192.168.0.0/16\n10.0.0.0/8\n172.16.0.0/12", hint: "Una por línea. Estas IPs nunca se bloquean (LAN/oficina)." }
    ]
};

    function generate(inputs, version) {
        const ports = [];
        if (inputs.protect_ssh) ports.push("22");
        if (inputs.protect_winbox) ports.push("8291");
        if (inputs.protect_api) ports.push("8728", "8729");
        if (inputs.protect_www) ports.push("80", "443");
        if (inputs.custom_ports && inputs.custom_ports.trim()) {
            inputs.custom_ports.split(',').forEach(p => { const t = p.trim(); if (t) ports.push(t); });
        }
        const portList = ports.join(',');
    
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Protección Anti Brute-Force (Address-List Stages)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Tras ${4} intentos fallidos, la IP queda baneada ${inputs.blacklist_timeout}.\n`;
        code += `# ====================================================\n\n`;
    
        if (portList === '') {
            code += `# ADVERTENCIA: No seleccionaste ningún servicio a proteger. Activa al menos uno.\n`;
            return code;
        }
    
        const whitelistEntries = (inputs.whitelist_ips || "").split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (whitelistEntries.length > 0) {
            code += `# 1. Address-list de IPs confiables (no se bloquean nunca)\n`;
            code += `/ip firewall address-list\n`;
            whitelistEntries.forEach(ip => {
                code += `add list=trusted address=${ip} comment="Whitelist confiable"\n`;
            });
            code += `\n`;
        }
    
        code += `# 2. Reglas anti brute-force en orden inverso (más antigua arriba)\n`;
        code += `/ip firewall filter\n`;
        code += `# 2.1 Permitir conexiones desde IPs en la whitelist (corta evaluación)\n`;
        if (whitelistEntries.length > 0) {
            code += `add chain=input action=accept src-address-list=trusted comment="Whitelist - acceso permitido"\n`;
        }
        code += `# 2.2 Drop inmediato a IPs ya baneadas\n`;
        code += `add chain=input action=drop protocol=tcp dst-port=${portList} src-address-list=ban-final comment="Brute force: drop blacklisted"\n\n`;
    
        code += `# 2.3 Stages: si una IP avanza por los stages, termina en la blacklist final\n`;
        code += `add chain=input action=add-src-to-address-list address-list=ban-final address-list-timeout=${inputs.blacklist_timeout} protocol=tcp dst-port=${portList} connection-state=new src-address-list=bf-stage3 comment="Brute force: stage3 -> blacklist"\n`;
        code += `add chain=input action=add-src-to-address-list address-list=bf-stage3 address-list-timeout=${inputs.stage_timeout} protocol=tcp dst-port=${portList} connection-state=new src-address-list=bf-stage2 comment="Brute force: stage2 -> stage3"\n`;
        code += `add chain=input action=add-src-to-address-list address-list=bf-stage2 address-list-timeout=${inputs.stage_timeout} protocol=tcp dst-port=${portList} connection-state=new src-address-list=bf-stage1 comment="Brute force: stage1 -> stage2"\n`;
        code += `add chain=input action=add-src-to-address-list address-list=bf-stage1 address-list-timeout=${inputs.stage_timeout} protocol=tcp dst-port=${portList} connection-state=new comment="Brute force: primer intento -> stage1"\n\n`;
    
        code += `# REVISAR baneados: /ip firewall address-list print where list=ban-final\n`;
        code += `# DESBANEAR manual: /ip firewall address-list remove [find list=ban-final address=A.B.C.D]\n`;
        code += `# NOTA: Estas reglas se evaluan ANTES que las reglas accept normales. Asegúrate de que el orden\n`;
        code += `#       en /ip firewall filter sea correcto: estas anti-brute-force PRIMERO, luego las de servicio.\n`;
    
        return code;
    }

    window.MTB.register(definition, generate);
})();
