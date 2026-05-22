// Auto-extracted from script.js. Self-contained: registers via window.MTB.register().
(function () {
    const definition = {
    key: 'backup',
    title: "Backup Automático Programado",
    description: "Backup completo + export de configuración diario/semanal, con envío opcional por email y limpieza automática de archivos antiguos.",
    fileName: "mikrotik_backup_auto.rsc",
    inputs: [
        { id: "backup_prefix", label: "Prefijo del Backup", type: "text", default: "backup", hint: "Nombre base de los archivos generados" },
        { id: "backup_password", label: "Contraseña del Backup", type: "text", default: "MiClaveBackup", hint: "Protege el archivo .backup con esta clave" },
        { id: "schedule_interval", label: "Intervalo", type: "select", options: [
            { value: "1d", label: "Diario (1d)" },
            { value: "1w", label: "Semanal (1w)" },
            { value: "12h", label: "Cada 12 horas" },
            { value: "6h", label: "Cada 6 horas" }
        ], default: "1d" },
        { id: "schedule_time", label: "Hora de Ejecución", type: "text", default: "03:00:00", hint: "Formato HH:MM:SS (hora local del router)" },
        { id: "send_email", label: "Enviar Backup por Email", type: "checkbox", default: true },
        { id: "email_to", label: "Email Destino", type: "text", default: "admin@ejemplo.com" },
        { id: "email_from", label: "Email Origen (From)", type: "text", default: "router@ejemplo.com" },
        { id: "smtp_server", label: "Servidor SMTP", type: "text", default: "smtp.gmail.com" },
        { id: "smtp_port", label: "Puerto SMTP", type: "text", default: "587" },
        { id: "smtp_tls", label: "Tipo de Cifrado", type: "select", options: [
            { value: "starttls", label: "STARTTLS (587 - recomendado)" },
            { value: "tls-only", label: "TLS Directo (465)" },
            { value: "no", label: "Sin cifrado (25)" }
        ], default: "starttls" },
        { id: "smtp_user", label: "Usuario SMTP", type: "text", default: "router@gmail.com" },
        { id: "smtp_pass", label: "Contraseña / App Password", type: "text", default: "tu_app_password", hint: "Para Gmail usa una App Password (no la contraseña normal)" }
    ]
};

    function generate(inputs, version) {
        const scriptName = `auto-${inputs.backup_prefix || 'backup'}`;
        const schedulerName = `sched-${inputs.backup_prefix || 'backup'}`;
    
        let code = `# ====================================================\n`;
        code += `# SCRIPT: Backup Automático Programado\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# ====================================================\n\n`;
    
        if (inputs.send_email) {
            code += `# 1. Configurar la cuenta SMTP para enviar los backups por correo\n`;
            code += `/tool e-mail\n`;
            const tlsValue = inputs.smtp_tls === 'no' ? 'no' : (inputs.smtp_tls === 'tls-only' ? 'tls-only' : 'starttls');
            code += `set address=${inputs.smtp_server} port=${inputs.smtp_port} user="${inputs.smtp_user}" password="${inputs.smtp_pass}" tls=${tlsValue} from="${inputs.email_from}"\n\n`;
        }
    
        const stepNum = inputs.send_email ? 2 : 1;
        code += `# ${stepNum}. Script que genera backup + export y opcionalmente lo envía por email\n`;
        code += `/system script\n`;
        code += `add name=${scriptName} policy=read,write,policy,test,sensitive source={\n`;
        code += `    :local fname ("${inputs.backup_prefix}-" . [/system identity get name] . "-" . [:pick [/system clock get date] 7 11] . [:pick [/system clock get date] 0 3] . [:pick [/system clock get date] 4 6])\n`;
        code += `    :log info ("Generando backup: " . $fname)\n`;
        code += `    /system backup save name=$fname password="${inputs.backup_password}"\n`;
        code += `    /export file=$fname\n`;
        code += `    :delay 5s\n`;
        if (inputs.send_email) {
            code += `    /tool e-mail send to="${inputs.email_to}" subject=("Backup MikroTik - " . [/system identity get name]) body=("Backup y export adjuntos. Fecha: " . [/system clock get date] . " " . [/system clock get time]) file=($fname . ".backup")\n`;
            code += `    :delay 10s\n`;
            code += `    /tool e-mail send to="${inputs.email_to}" subject=("Export Config - " . [/system identity get name]) body="Export en texto plano adjunto" file=($fname . ".rsc")\n`;
            code += `    :delay 30s\n`;
            code += `    :log info ("Limpiando archivos temporales del backup: " . $fname)\n`;
            code += `    /file remove [/file find name=($fname . ".backup")]\n`;
            code += `    /file remove [/file find name=($fname . ".rsc")]\n`;
        } else {
            code += `    :log info ("Backup guardado en almacenamiento local: " . $fname)\n`;
        }
        code += `}\n\n`;
    
        const stepNum2 = stepNum + 1;
        code += `# ${stepNum2}. Programar la ejecución del script\n`;
        code += `/system scheduler\n`;
        code += `add name=${schedulerName} interval=${inputs.schedule_interval} start-time=${inputs.schedule_time} on-event="/system script run ${scriptName}" comment="Backup Automático"\n\n`;
    
        if (inputs.send_email) {
            code += `# IMPORTANTE para Gmail:\n`;
            code += `# 1. Activa la verificación en 2 pasos en la cuenta Google.\n`;
            code += `# 2. Genera una 'Contraseña de Aplicación' en https://myaccount.google.com/apppasswords\n`;
            code += `# 3. Usa esa contraseña (16 caracteres) en el campo password, NO la del usuario.\n`;
        }
        code += `# Probar manualmente: /system script run ${scriptName}\n`;
    
        return code;
    }

    window.MTB.register(definition, generate);
})();
