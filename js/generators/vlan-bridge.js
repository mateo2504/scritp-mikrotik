// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'vlan-bridge',
    title: "VLAN sobre Bridge (RouterOS v7+)",
    description: "Configuración profesional de VLANs con bridge vlan-filtering. Segmenta la red en oficina, invitados, IoT, etc. con interfaces dedicadas e IP por VLAN.",
    fileName: "mikrotik_vlan_bridge.rsc",
    isV7Only: true,
    inputs: [
        { id: "bridge_name", label: "Nombre del Bridge Principal", type: "text", default: "bridge-main" },
        { id: "trunk_ports", label: "Puertos Trunk (CON tag, separados por coma)", type: "text", default: "ether2,sfp-sfpplus1", hint: "Puertos que llevarán múltiples VLANs etiquetadas (a switches o APs CAPsMAN)" },
        { id: "management_vlan", label: "VLAN de Management", type: "text", default: "10", hint: "VLAN usada para acceder al router (evita lockout)" },
        { id: "vlan_list", label: "Definición de VLANs (VID|Nombre|IP/CIDR|PuertosUntagged)", type: "textarea", default: "10|management|192.168.10.1/24|ether3\n20|users|192.168.20.1/24|ether4,ether5\n30|guests|192.168.30.1/24|ether6\n40|iot|192.168.40.1/24|", hint: "Una VLAN por línea. PuertosUntagged separados por coma o vacío si solo es trunk." }
    ]
};

    function generate(inputs, version) {
        if (version === 'v6') {
            return `# ====================================================\n# ERROR: SCRIPT OPTIMIZADO PARA RouterOS v7\n# ====================================================\n# La sintaxis de bridge vlan-filtering es estable y recomendada desde v7.\n# Por favor cambia el selector arriba a la derecha a 'v7'.\n`;
        }
    
        const bridge = inputs.bridge_name || "bridge-main";
        const trunkPorts = (inputs.trunk_ports || "").split(',').map(p => p.trim()).filter(p => p.length > 0);
        const vlanLines = (inputs.vlan_list || "").split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const mgmtVlan = inputs.management_vlan || "10";
    
        const vlans = vlanLines.map(line => {
            const parts = line.split('|').map(p => p.trim());
            return {
                id: parts[0] || "",
                name: parts[1] || "",
                ip: parts[2] || "",
                untagged: (parts[3] || "").split(',').map(p => p.trim()).filter(p => p.length > 0)
            };
        }).filter(v => v.id && v.name);
    
        let code = `# ====================================================\n`;
        code += `# SCRIPT: VLAN sobre Bridge con vlan-filtering (RouterOS v7)\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# IMPORTANTE: activa vlan-filtering AL FINAL. Si configuras mal te bloquearás.\n`;
        code += `# Conéctate por consola/MAC-Winbox antes de aplicar este script.\n`;
        code += `# ====================================================\n\n`;
    
        code += `# 1. Crear el bridge SIN vlan-filtering aun (se activa al final)\n`;
        code += `/interface bridge\n`;
        code += `add name=${bridge} vlan-filtering=no protocol-mode=rstp comment="Bridge con VLAN filtering"\n\n`;
    
        code += `# 2. Agregar puertos al bridge\n`;
        code += `/interface bridge port\n`;
        trunkPorts.forEach(p => {
            code += `add bridge=${bridge} interface=${p} comment="Trunk port"\n`;
        });
        vlans.forEach(v => {
            v.untagged.forEach(p => {
                code += `add bridge=${bridge} interface=${p} pvid=${v.id} frame-types=admit-only-untagged-and-priority-tagged comment="Access port VLAN ${v.id} (${v.name})"\n`;
            });
        });
        code += `\n`;
    
        code += `# 3. Crear las interfaces VLAN sobre el bridge\n`;
        code += `/interface vlan\n`;
        vlans.forEach(v => {
            code += `add name=vlan${v.id}-${v.name} interface=${bridge} vlan-id=${v.id} comment="VLAN ${v.id} ${v.name}"\n`;
        });
        code += `\n`;
    
        code += `# 4. Tabla de VLANs del bridge (qué VLAN existe en qué puerto)\n`;
        code += `/interface bridge vlan\n`;
        vlans.forEach(v => {
            const taggedList = [bridge, ...trunkPorts].join(',');
            const untaggedPart = v.untagged.length > 0 ? ` untagged=${v.untagged.join(',')}` : '';
            code += `add bridge=${bridge} vlan-ids=${v.id} tagged=${taggedList}${untaggedPart} comment="VLAN ${v.id} ${v.name}"\n`;
        });
        code += `\n`;
    
        code += `# 5. Asignar IP a cada interfaz VLAN (gateway de cada subred)\n`;
        code += `/ip address\n`;
        vlans.forEach(v => {
            if (v.ip) {
                code += `add interface=vlan${v.id}-${v.name} address=${v.ip} comment="Gateway VLAN ${v.name}"\n`;
            }
        });
        code += `\n`;
    
        const mgmtVlanDef = vlans.find(v => v.id === mgmtVlan);
        if (mgmtVlanDef) {
            code += `# 6. Lista de interfaces para reglas firewall (opcional pero recomendado)\n`;
            code += `/interface list\n`;
            code += `add name=VLAN-MGMT comment="Solo VLAN de management"\n`;
            code += `/interface list member\n`;
            code += `add list=VLAN-MGMT interface=vlan${mgmtVlanDef.id}-${mgmtVlanDef.name}\n\n`;
        }
    
        code += `# 7. ACTIVAR vlan-filtering (PUNTO DE NO RETORNO - asegúrate del management antes)\n`;
        code += `/interface bridge set ${bridge} vlan-filtering=yes\n\n`;
    
        code += `# SUGERENCIA: Después de probar, crea DHCP server, firewall y NAT por cada VLAN según necesites.\n`;
        code += `# Para aislar VLANs entre sí: agrega regla en /ip firewall filter chain=forward action=drop entre subredes.\n`;
    
        return code;
    }

    window.MTB.register(definition, generate);
})();
