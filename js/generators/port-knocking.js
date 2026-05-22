// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'port-knocking',
    title: "Port Knocking (Acceso Oculto)",
    description: "Mantiene los servicios cerrados al mundo y solo los abre tras una secuencia secreta de 'toques' en puertos específicos. Acceso 'invisible' a Winbox/SSH.",
    fileName: "mikrotik_port_knocking.rsc",
    inputs: [
        { id: "knock_port_1", label: "Puerto Secreto 1", type: "text", default: "7654", hint: "Primer 'toque' de la secuencia" },
        { id: "knock_port_2", label: "Puerto Secreto 2", type: "text", default: "8765", hint: "Segundo toque (después del primero)" },
        { id: "knock_port_3", label: "Puerto Secreto 3", type: "text", default: "9876", hint: "Tercer toque (cierra la secuencia)" },
        {
            id: "knock_protocol",
            label: "Protocolo de los Knocks",
            type: "select",
            options: [
                { value: "tcp", label: "TCP" },
                { value: "udp", label: "UDP" }
            ],
            default: "tcp"
        },
        { id: "target_ports", label: "Puertos del Servicio a Proteger", type: "text", default: "22,8291", hint: "Puertos que se abren al autorizar (SSH, Winbox, etc.)" },
        { id: "stage_timeout", label: "Timeout entre Toques", type: "text", default: "10s", hint: "Tiempo máximo entre puertos de la secuencia" },
        { id: "authorized_timeout", label: "Tiempo de Acceso Autorizado", type: "text", default: "1h", hint: "Cuánto dura el acceso tras completar la secuencia" }
    ]
};

    function generate(inputs, version) {
        const k1 = inputs.knock_port_1 || "7654";
        const k2 = inputs.knock_port_2 || "8765";
        const k3 = inputs.knock_port_3 || "9876";
        const proto = inputs.knock_protocol || "tcp";
        const targetPorts = inputs.target_ports || "22,8291";
        const stageT = inputs.stage_timeout || "10s";
        const authT = inputs.authorized_timeout || "1h";
    
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Port Knocking (Acceso Oculto a Servicios)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Secuencia: ${proto.toUpperCase()} ${k1} -> ${k2} -> ${k3} (en menos de ${stageT})\n`;
        code += `# Tras la secuencia, los puertos ${targetPorts} se abren por ${authT} para la IP que tocó.\n`;
        code += `# ====================================================\n\n`;
    
        code += `/ip firewall filter\n`;
        code += `# 1. Permitir acceso a IPs ya autorizadas (que completaron la secuencia)\n`;
        code += `add chain=input action=accept protocol=tcp dst-port=${targetPorts} src-address-list=knock-authorized comment="Port Knocking: acceso autorizado"\n\n`;
    
        code += `# 2. Detectar la secuencia. Reglas en orden inverso (más restrictiva primero)\n`;
        code += `# 2.3 Tercer toque -> mover a knock-authorized\n`;
        code += `add chain=input action=add-src-to-address-list address-list=knock-authorized address-list-timeout=${authT} protocol=${proto} dst-port=${k3} src-address-list=knock-stage2 comment="Knock 3/3 - autorizado"\n`;
        code += `add chain=input action=remove-from-address-list address-list=knock-stage2 protocol=${proto} dst-port=${k3} src-address-list=knock-stage2\n\n`;
    
        code += `# 2.2 Segundo toque -> avanzar a stage2\n`;
        code += `add chain=input action=add-src-to-address-list address-list=knock-stage2 address-list-timeout=${stageT} protocol=${proto} dst-port=${k2} src-address-list=knock-stage1 comment="Knock 2/3"\n`;
        code += `add chain=input action=remove-from-address-list address-list=knock-stage1 protocol=${proto} dst-port=${k2} src-address-list=knock-stage1\n\n`;
    
        code += `# 2.1 Primer toque -> stage1\n`;
        code += `add chain=input action=add-src-to-address-list address-list=knock-stage1 address-list-timeout=${stageT} protocol=${proto} dst-port=${k1} comment="Knock 1/3"\n\n`;
    
        code += `# 3. Bloquear el acceso normal a los puertos del servicio (lo deja inaccesible sin la secuencia)\n`;
        code += `add chain=input action=drop protocol=tcp dst-port=${targetPorts} comment="Port Knocking: bloquear acceso directo"\n\n`;
    
        code += `# Cómo activar el acceso desde Linux/Mac:\n`;
        if (proto === 'tcp') {
            code += `#   for p in ${k1} ${k2} ${k3}; do nc -z -w1 IP_DEL_ROUTER $p; sleep 1; done\n`;
        } else {
            code += `#   for p in ${k1} ${k2} ${k3}; do nmap -sU -p $p IP_DEL_ROUTER; done\n`;
        }
        code += `# Desde Windows: usar PortQry o un script PowerShell con Test-NetConnection.\n`;
        code += `# Verificar autorización: /ip firewall address-list print where list=knock-authorized\n`;
        code += `# IMPORTANTE: el orden de las reglas en /ip firewall filter es CRÍTICO. Estas deben ir ANTES\n`;
        code += `#             del 'drop final' general del firewall, o ajustar con 'place-before'.\n`;
    
        return code;
    }

    window.MTB.register(definition, generate);
})();
