// NTP Client + Zona horaria. Auto-registra vía window.MTB.
(function () {
    const definition = {
        key: 'ntp-timezone',
        title: "NTP + Zona Horaria",
        description: "Configura sincronización de hora con servidores NTP públicos y establece la zona horaria correcta. Hora correcta es CRÍTICO para logs, certificados, scheduler y autenticación.",
        fileName: "mikrotik_ntp_timezone.rsc",
        inputs: [
            {
                id: "ntp_servers",
                label: "Servidores NTP",
                type: "text",
                default: "pool.ntp.org,time.google.com,time.cloudflare.com",
                hint: "Separados por coma. Recomendado: usar pool regional (es.pool.ntp.org, mx.pool.ntp.org)"
            },
            {
                id: "timezone",
                label: "Zona Horaria",
                type: "select",
                options: [
                    { value: "America/Mexico_City", label: "America/Mexico_City (CST/CDT)" },
                    { value: "America/Bogota", label: "America/Bogota (COT)" },
                    { value: "America/Lima", label: "America/Lima (PET)" },
                    { value: "America/Santiago", label: "America/Santiago (CLT/CLST)" },
                    { value: "America/Argentina/Buenos_Aires", label: "America/Argentina/Buenos_Aires (ART)" },
                    { value: "America/Caracas", label: "America/Caracas (VET)" },
                    { value: "America/Panama", label: "America/Panama (EST)" },
                    { value: "America/Guatemala", label: "America/Guatemala (CST)" },
                    { value: "America/La_Paz", label: "America/La_Paz (BOT)" },
                    { value: "America/Asuncion", label: "America/Asuncion (PYT/PYST)" },
                    { value: "America/Montevideo", label: "America/Montevideo (UYT)" },
                    { value: "America/Santo_Domingo", label: "America/Santo_Domingo (AST)" },
                    { value: "America/Havana", label: "America/Havana (CST/CDT)" },
                    { value: "America/Costa_Rica", label: "America/Costa_Rica (CST)" },
                    { value: "America/Tegucigalpa", label: "America/Tegucigalpa (CST)" },
                    { value: "America/Managua", label: "America/Managua (CST)" },
                    { value: "America/El_Salvador", label: "America/El_Salvador (CST)" },
                    { value: "America/Guayaquil", label: "America/Guayaquil (ECT)" },
                    { value: "Europe/Madrid", label: "Europe/Madrid (CET/CEST)" },
                    { value: "UTC", label: "UTC (sin offset)" },
                    { value: "manual", label: "Manual (escribir abajo)" }
                ],
                default: "America/Mexico_City"
            },
            { id: "timezone_manual", label: "Zona Horaria Manual", type: "text", default: "America/Mexico_City", hint: "Solo si seleccionaste 'Manual' arriba. Formato IANA: Region/Ciudad" },
            { id: "enable_ntp_server", label: "Convertir el router en servidor NTP de la LAN", type: "checkbox", default: false, hint: "Permite que tus dispositivos LAN sincronicen contra este router" },
            { id: "dst_auto", label: "DST automático (cambio de horario verano/invierno)", type: "checkbox", default: true, hint: "RouterOS aplica automáticamente las reglas DST de la timezone" }
        ]
    };

    function generate(inputs, version) {
        const timezone = inputs.timezone === 'manual'
            ? (inputs.timezone_manual || 'UTC')
            : inputs.timezone;

        let code = `# ====================================================\n`;
        code += `# SCRIPT: NTP + Zona Horaria\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Timezone: ${timezone}\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Cliente NTP (sincroniza la hora del router contra servidores públicos)\n`;
        if (version === 'v7') {
            code += `/system ntp client\n`;
            code += `set enabled=yes mode=unicast servers=${inputs.ntp_servers}\n\n`;
        } else {
            code += `# v6 usa server-dns-names en lugar de servers\n`;
            code += `/system ntp client\n`;
            code += `set enabled=yes server-dns-names=${inputs.ntp_servers} mode=unicast\n\n`;
        }

        code += `# 2. Zona horaria y DST automático\n`;
        code += `/system clock\n`;
        code += `set time-zone-name=${timezone} time-zone-autodetect=no\n`;
        if (!inputs.dst_auto) {
            code += `# DST manual desactivado (no recomendado salvo casos especiales)\n`;
        }
        code += `\n`;

        if (inputs.enable_ntp_server) {
            code += `# 3. Convertir el router en servidor NTP para los clientes LAN\n`;
            if (version === 'v7') {
                code += `/system ntp server\n`;
                code += `set enabled=yes\n\n`;
            } else {
                code += `# En v6 el servidor NTP es parte del paquete 'ntp' (puede no estar instalado por defecto)\n`;
                code += `/system ntp server\n`;
                code += `set enabled=yes broadcast=no multicast=no manycast=yes\n\n`;
            }

            code += `# Permitir consultas NTP entrantes en el firewall (solo desde LAN)\n`;
            code += `/ip firewall filter\n`;
            code += `add chain=input action=accept protocol=udp dst-port=123 src-address=192.168.0.0/16 comment="NTP LAN" place-before=0\n`;
            code += `add chain=input action=accept protocol=udp dst-port=123 src-address=10.0.0.0/8 comment="NTP LAN" place-before=0\n\n`;
        }

        code += `# ====================================================\n`;
        code += `# VERIFICAR\n`;
        code += `#   /system clock print           (debe mostrar la hora local correcta + zona)\n`;
        code += `#   /system ntp client print      (status debe ser 'synchronized')\n`;
        code += `#   /system resource print        (uptime y date deben coincidir con tu reloj)\n`;
        code += `# ====================================================\n`;
        code += `# POR QUÉ ES IMPORTANTE LA HORA CORRECTA:\n`;
        code += `# - Logs útiles (sin hora, los logs son inservibles para forensia)\n`;
        code += `# - Validación de certificados TLS (si la hora está mal, todos fallan)\n`;
        code += `# - Scheduler (los cron-jobs se disparan en hora local)\n`;
        code += `# - DHCP lease expirations\n`;
        code += `# - Address-list timeouts (brute-force, port-knocking)\n`;
        code += `# - Backups con timestamp\n`;
        code += `# ====================================================\n`;
        code += `# SERVIDORES NTP REGIONALES (latencia más baja):\n`;
        code += `# - mx.pool.ntp.org    (México)\n`;
        code += `# - co.pool.ntp.org    (Colombia)\n`;
        code += `# - cl.pool.ntp.org    (Chile)\n`;
        code += `# - ar.pool.ntp.org    (Argentina)\n`;
        code += `# - es.pool.ntp.org    (España)\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
