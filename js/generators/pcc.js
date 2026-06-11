// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'pcc',
    title: "Balanceo PCC (Múltiples WAN)",
    description: "Distribución de tráfico balanceada entre varias conexiones de Internet (2 a 10 WANs) utilizando marcas de ruta.",
    fileName: "mikrotik_pcc_bal.rsc",
    inputs: [
        {
            id: "recursive_routes",
            label: "Failover por Internet real (Rutas Recursivas)",
            type: "select",
            options: [
                { value: "no", label: "No (check-gateway al gateway directo)" },
                { value: "yes", label: "Sí (ping a host externo vía ruta recursiva)" }
            ],
            default: "no",
            hint: "Si se habilita, cada WAN monitorea un host público externo. Detecta caídas de Internet aunque el gateway siga activo."
        },
        {
            id: "wan_count", 
            label: "Cantidad de Líneas WAN", 
            type: "select", 
            options: [
                { value: "2", label: "2 WANs" },
                { value: "3", label: "3 WANs" },
                { value: "4", label: "4 WANs" },
                { value: "5", label: "5 WANs" },
                { value: "6", label: "6 WANs" },
                { value: "7", label: "7 WANs" },
                { value: "8", label: "8 WANs" },
                { value: "9", label: "9 WANs" },
                { value: "10", label: "10 WANs" }
            ],
            default: "2",
            hint: "Número de interfaces WAN a balancear"
        },
        {
            id: "lan_match_type",
            label: "Identificar Tráfico LAN por",
            type: "select",
            options: [
                { value: "in-interface", label: "Interfaz (in-interface)" },
                { value: "in-interface-list", label: "Lista de Interfaces (in-interface-list)" },
                { value: "src-address-list", label: "Lista de IPs (src-address-list)" }
            ],
            default: "in-interface",
            hint: "Método para identificar los paquetes que vienen de la LAN"
        },
        { id: "lan_interface", label: "Interfaz LAN", type: "text", default: "bridge-lan", hint: "Red local cableada o bridge LAN" },
        { id: "lan_interface_list", label: "Interface List LAN", type: "text", default: "LAN", hint: "Nombre de la Interface List en /interface list" },
        { id: "lan_address_list", label: "Address List LAN", type: "text", default: "PCC-Clients", hint: "Nombre de la Address List en /ip firewall address-list" },
        { id: "lan_network", label: "Red LAN (CIDR)", type: "text", default: "192.168.88.0/24", hint: "Rango local para exclusión de balanceo" },
        { 
            id: "pcc_type", 
            label: "Clasificador PCC", 
            type: "select", 
            options: [
                { value: "both-addresses-and-ports", label: "Both Addresses and Ports (Recomendado)" },
                { value: "both-addresses", label: "Both Addresses" },
                { value: "src-address", label: "Source Address" }
            ],
            default: "both-addresses-and-ports",
            hint: "Fórmula de clasificación del tráfico"
        }
    ]
};

    function generate(inputs, version) {
        const isV7 = version === 'v7';
        const N = parseInt(inputs.wan_count || 2);
        
        const matchType = inputs.lan_match_type || 'in-interface';
        let lanMatchParam = '';
        if (matchType === 'in-interface') {
            lanMatchParam = `in-interface=${inputs.lan_interface || 'bridge-lan'}`;
        } else if (matchType === 'in-interface-list') {
            lanMatchParam = `in-interface-list=${inputs.lan_interface_list || 'LAN'}`;
        } else if (matchType === 'src-address-list') {
            lanMatchParam = `src-address-list=${inputs.lan_address_list || 'PCC-Clients'}`;
        }
    
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Balanceo PCC (Per Connection Classifier) - ${N} WANs\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`;
        code += `# Compatible con cualquier Routerboard (Ajusta los nombres de interfaces)\n`;
        code += `# ====================================================\n`;
        code += `# IMPORTANTE: Desactiva FastTrack en el firewall (o agrega reglas de\n`;
        code += `# bypass antes de la regla fasttrack-connection). FastTrack salta la\n`;
        code += `# tabla Mangle y rompe el balanceo PCC en conexiones establecidas.\n`;
        code += `# ====================================================\n\n`;
    
        if (isV7) {
            code += `# 1. Crear las tablas de enrutamiento con FIB en v7\n`;
            code += `/routing table\n`;
            for (let i = 1; i <= N; i++) {
                const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
                code += `add name=to_${wanInterface} fib\n`;
            }
            code += `\n`;
        }
    
        code += `# 2. Crear Address List de redes conectadas para evitar balancear tráfico local/WAN\n`;
        code += `/ip firewall address-list\n`;
        code += `add address=${inputs.lan_network} list=connected-networks comment="Red LAN"\n`;
        if (matchType === 'src-address-list') {
            code += `add address=${inputs.lan_network} list=${inputs.lan_address_list || 'PCC-Clients'} comment="Clientes a balancear (agrega mas rangos/IPs si aplica)"\n`;
        }
        for (let i = 1; i <= N; i++) {
            const wanGateway = inputs[`wan${i}_gateway`] || `192.168.${i}.1`;
            const parts = wanGateway.split('.');
            if (parts.length === 4) {
                const wanSubnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
                code += `add address=${wanSubnet} list=connected-networks comment="Subred WAN${i} (Estimada)"\n`;
            }
        }
        code += `\n`;
    
        code += `# 3. Reglas de Mangle (Exclusión local y clasificación de tráfico)\n`;
        code += `/ip firewall mangle\n`;
        code += `# Aceptar tráfico hacia redes locales/conectadas sin marcar\n`;
        code += `add chain=prerouting dst-address-list=connected-networks ${lanMatchParam} action=accept comment="Excluir trafico local y WANs conectadas"\n\n`;
    
        code += `# Mantener las conexiones entrantes en su respectiva interfaz WAN de origen\n`;
        for (let i = 1; i <= N; i++) {
            const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
            code += `add chain=prerouting in-interface=${wanInterface} connection-mark=no-mark action=mark-connection new-connection-mark=${wanInterface}_conn passthrough=yes comment="Fijar WAN${i}"\n`;
        }
        code += `\n`;
    
        code += `# División PCC: Asigna conexiones a interfaces WAN de forma equitativa (${inputs.pcc_type})\n`;
        for (let i = 1; i <= N; i++) {
            const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
            code += `add chain=prerouting ${lanMatchParam} connection-state=new dst-address-type=!local connection-mark=no-mark per-connection-classifier=${inputs.pcc_type}:${N}/${i-1} action=mark-connection new-connection-mark=${wanInterface}_conn passthrough=yes comment="PCC Linea ${i}"\n`;
        }
        code += `\n`;
    
        code += `# Marcar rutas basadas en las conexiones marcadas anteriormente para clientes LAN\n`;
        for (let i = 1; i <= N; i++) {
            const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
            code += `add chain=prerouting ${lanMatchParam} connection-mark=${wanInterface}_conn action=mark-routing new-routing-mark=to_${wanInterface} passthrough=no\n`;
        }
        code += `\n`;
    
        code += `# Marcar rutas para el tráfico propio generado por el router\n`;
        for (let i = 1; i <= N; i++) {
            const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
            code += `add chain=output connection-mark=${wanInterface}_conn action=mark-routing new-routing-mark=to_${wanInterface} passthrough=no\n`;
        }
        code += `\n`;
    
        code += `# 4. Configurar las rutas IP\n`;
        code += `/ip route\n`;

        const recursive = inputs.recursive_routes === 'yes';
        const hostDefaults = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222", "8.8.4.4", "1.0.0.1", "4.2.2.1", "4.2.2.2", "208.67.220.220", "149.112.112.112"];
        const tableParam = isV7 ? 'routing-table' : 'routing-mark';

        if (recursive) {
            code += `# Rutas de control /32: fuerzan el ping de cada host externo por su WAN correspondiente (scope=10)\n`;
            for (let i = 1; i <= N; i++) {
                const wanGateway = inputs[`wan${i}_gateway`] || `192.168.${i}.1`;
                const pingHost = inputs[`ping_host${i}`] || hostDefaults[i - 1] || "8.8.8.8";
                code += `add dst-address=${pingHost}/32 gateway=${wanGateway} scope=10 comment="Control recursivo WAN${i}"\n`;
            }
            code += `\n`;
        }

        code += `# Enrutar tráfico marcado a sus respectivas ${isV7 ? 'tablas' : 'marcas'} (con failover si cae una línea)\n`;
        for (let i = 1; i <= N; i++) {
            const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
            const wanGateway = inputs[`wan${i}_gateway`] || `192.168.${i}.1`;
            const pingHost = inputs[`ping_host${i}`] || hostDefaults[i - 1] || "8.8.8.8";
            if (recursive) {
                const gw = isV7 ? `${pingHost}@main` : pingHost;
                code += `add dst-address=0.0.0.0/0 gateway=${gw} check-gateway=ping target-scope=11 distance=1 ${tableParam}=to_${wanInterface} comment="WAN${i} Recursiva (su ${isV7 ? 'tabla' : 'marca'})"\n`;
            } else {
                const gw = isV7 ? `${wanGateway}@main` : wanGateway;
                code += `add dst-address=0.0.0.0/0 gateway=${gw} distance=1 ${tableParam}=to_${wanInterface} check-gateway=ping comment="WAN${i} Primaria (su ${isV7 ? 'tabla' : 'marca'})"\n`;
            }

            // Backup routes in the custom table/mark
            let dist = 2;
            for (let j = 1; j <= N; j++) {
                if (j === i) continue;
                const backupGateway = inputs[`wan${j}_gateway`] || `192.168.${j}.1`;
                const backupHost = inputs[`ping_host${j}`] || hostDefaults[j - 1] || "8.8.8.8";
                if (recursive) {
                    const gw = isV7 ? `${backupHost}@main` : backupHost;
                    code += `add dst-address=0.0.0.0/0 gateway=${gw} check-gateway=ping target-scope=11 distance=${dist} ${tableParam}=to_${wanInterface} comment="WAN${j} Respaldo recursivo en ${isV7 ? 'tabla' : 'marca'} de WAN${i}"\n`;
                } else {
                    const gw = isV7 ? `${backupGateway}@main` : backupGateway;
                    code += `add dst-address=0.0.0.0/0 gateway=${gw} distance=${dist} ${tableParam}=to_${wanInterface} check-gateway=ping comment="WAN${j} Respaldo en ${isV7 ? 'tabla' : 'marca'} de WAN${i}"\n`;
                }
                dist++;
            }
        }
        code += `\n`;
        code += `# Rutas por defecto en la tabla principal (con distancias para failover si cae una línea completa)\n`;
        for (let i = 1; i <= N; i++) {
            const wanGateway = inputs[`wan${i}_gateway`] || `192.168.${i}.1`;
            const pingHost = inputs[`ping_host${i}`] || hostDefaults[i - 1] || "8.8.8.8";
            if (recursive) {
                code += `add dst-address=0.0.0.0/0 gateway=${pingHost} check-gateway=ping target-scope=11 distance=${i} comment="Ruta Principal Recursiva WAN${i}"\n`;
            } else {
                code += `add dst-address=0.0.0.0/0 gateway=${wanGateway} distance=${i} check-gateway=ping comment="Ruta Principal WAN${i}"\n`;
            }
        }
    
        code += `\n# 5. NAT Masquerade (Para dar acceso a internet a través de cada puerto WAN)\n`;
        code += `/ip firewall nat\n`;
        for (let i = 1; i <= N; i++) {
            const wanInterface = inputs[`wan${i}_interface`] || `ether${i}`;
            code += `add chain=srcnat out-interface=${wanInterface} action=masquerade comment="Masquerade WAN${i}"\n`;
        }
    
        return code;
    }

    window.MTB.register(definition, generate);
})();
