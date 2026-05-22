// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'dns-blacklist',
    title: "DNS Blacklist (Bloqueador de Anuncios)",
    description: "Redirecciona las consultas de dominios de publicidad o rastreo a direcciones nulas (0.0.0.0) a nivel DNS interno.",
    fileName: "mikrotik_dns_blacklist.rsc",
    inputs: [
        { id: "dns_server", label: "DNS Forwarder Principal", type: "text", default: "8.8.8.8", hint: "Servidor DNS para resolver sitios buenos" },
        { id: "redirect_ip", label: "IP de Bloqueo", type: "text", default: "0.0.0.0", hint: "Generalmente 0.0.0.0 o 127.0.0.1" },
        { id: "block_domains", label: "Dominios a Bloquear (Uno por línea)", type: "textarea", default: "ads.google.com\ndoubleclick.net\nfacebook.com\ntiktok.com\nadservice.google.com\nanalytics.google.com", hint: "Ingresa la lista de hostnames" }
    ]
};

    function generate(inputs, version) {
        let code = `# ====================================================\n`;
        code += `# SCRIPT: DNS Blacklist (Bloqueador de Anuncios y Spammers)\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;
    
        code += `# 1. Configurar servidor DNS principal y habilitar consultas remotas\n`;
        code += `/ip dns set allow-remote-requests=yes servers=${inputs.dns_server}\n\n`;
    
        code += `# 2. Cargar entradas DNS estáticas que redirigen a IP nula\n`;
        code += `/ip dns static\n`;
    
        const isV7Dns = version === 'v7';
        const domains = inputs.block_domains.split('\n');
        let count = 0;
        domains.forEach(domain => {
            const trimmed = domain.trim();
            if (trimmed) {
                if (isV7Dns) {
                    // v7: type=A + match-subdomain=yes para bloquear subdominios también (ej: ads.dominio.com)
                    code += `add type=A name="${trimmed}" address=${inputs.redirect_ip} match-subdomain=yes comment="DNS-Blacklist"\n`;
                } else {
                    // v6 no soporta match-subdomain; se bloquea solo coincidencia exacta
                    code += `add name="${trimmed}" address=${inputs.redirect_ip} comment="DNS-Blacklist"\n`;
                }
                count++;
            }
        });
    
        code += `\n# Cantidad de dominios bloqueados estáticos: ${count}\n`;
        if (!isV7Dns) {
            code += `# NOTA v6: solo bloquea coincidencia exacta. Para bloquear subdominios usa regex: name="^.*\\\\.dominio\\\\.com$"\n`;
        }
        code += `# RECOMENDACIÓN: Redirige forzadamente el tráfico DNS de tus clientes al Router:\n`;
        code += `# /ip firewall nat add chain=dstnat protocol=udp dst-port=53 action=redirect to-ports=53 comment="Redirect DNS"\n`;
    
        return code;
    }

    window.MTB.register(definition, generate);
})();
