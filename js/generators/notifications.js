// Notificaciones Email + Telegram con triggers (WAN down, login, CPU, etc).
(function () {
    const definition = {
        key: 'notifications',
        title: "Notificaciones Email + Telegram",
        description: "Envía alertas por email y/o Telegram ante eventos críticos: caída de WAN (netwatch), login de admin, CPU alto, o eventos personalizados. Incluye helpers reutilizables.",
        fileName: "mikrotik_notifications.rsc",
        inputs: [
            {
                id: "channel",
                label: "Canal de Notificación",
                type: "select",
                options: [
                    { value: "telegram", label: "Telegram (recomendado, instantáneo)" },
                    { value: "email", label: "Email (SMTP)" },
                    { value: "both", label: "Ambos (Telegram + Email)" }
                ],
                default: "telegram"
            },
            { id: "tg_bot_token", label: "Token del Bot de Telegram", type: "text", default: "123456789:AAEhBXXXXXXXXXXXXXX", hint: "Crea un bot con @BotFather en Telegram" },
            { id: "tg_chat_id", label: "Chat ID de Telegram", type: "text", default: "-1001234567890", hint: "Personal: tu ID. Grupo: -100... (consulta con @userinfobot)" },
            { id: "smtp_server", label: "Servidor SMTP", type: "text", default: "smtp.gmail.com" },
            { id: "smtp_port", label: "Puerto SMTP", type: "text", default: "587" },
            { id: "smtp_user", label: "Usuario SMTP", type: "text", default: "router@gmail.com" },
            { id: "smtp_pass", label: "Contraseña / App Password", type: "text", default: "app_password_16_chars" },
            { id: "email_from", label: "Email Origen", type: "text", default: "router@miempresa.com" },
            { id: "email_to", label: "Email Destino", type: "text", default: "admin@miempresa.com" },
            { id: "alert_wan_down", label: "Alerta cuando un host WAN deja de responder (Netwatch)", type: "checkbox", default: true },
            { id: "watch_hosts", label: "Hosts a monitorear (uno por línea)", type: "textarea", default: "8.8.8.8\n1.1.1.1", hint: "Si todos caen = WAN caída" },
            { id: "watch_interval", label: "Frecuencia de Ping (Netwatch)", type: "text", default: "30s" },
            { id: "alert_admin_login", label: "Alerta cuando un usuario admin inicia sesión", type: "checkbox", default: true },
            { id: "alert_high_cpu", label: "Alerta cuando el CPU supera un umbral", type: "checkbox", default: false },
            { id: "cpu_threshold", label: "Umbral de CPU (%)", type: "text", default: "85" },
            { id: "cpu_check_interval", label: "Frecuencia de Chequeo CPU", type: "text", default: "5m" }
        ]
    };

    function generate(inputs, version) {
        const ch = inputs.channel || 'telegram';
        const useTg = ch === 'telegram' || ch === 'both';
        const useEmail = ch === 'email' || ch === 'both';

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Notificaciones Email + Telegram\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Canal: ${ch.toUpperCase()}\n`;
        code += `# ====================================================\n\n`;

        let step = 1;

        if (useEmail) {
            code += `# ${step}. Configurar cuenta SMTP\n`;
            code += `/tool e-mail\n`;
            code += `set address=${inputs.smtp_server} port=${inputs.smtp_port} user="${inputs.smtp_user}" password="${inputs.smtp_pass}" tls=starttls from="${inputs.email_from}"\n\n`;
            step++;
        }

        code += `# ${step}. Helper script: 'notify' (recibe \$subject y \$body, envía por el canal configurado)\n`;
        code += `/system script\n`;
        code += `add name=notify policy=read,test source={\n`;
        code += `    :local subject "Router Alert"\n`;
        code += `    :local body "Sin detalles"\n`;
        code += `    :if ([:len $1] > 0) do={ :set subject $1 }\n`;
        code += `    :if ([:len $2] > 0) do={ :set body $2 }\n`;
        code += `    :local identity [/system identity get name]\n`;
        code += `    :local fullMsg ("[" . $identity . "] " . $subject . " - " . $body)\n\n`;

        if (useTg) {
            code += `    # Enviar por Telegram (la API acepta texto en URL hasta ~4096 chars)\n`;
            code += `    :do {\n`;
            code += `        /tool fetch http-method=post mode=https keep-result=no \\\n`;
            code += `            url=("https://api.telegram.org/bot${inputs.tg_bot_token}/sendMessage") \\\n`;
            code += `            http-header-field="Content-Type: application/x-www-form-urlencoded" \\\n`;
            code += `            http-data=("chat_id=${inputs.tg_chat_id}&text=" . $fullMsg)\n`;
            code += `    } on-error={ :log error "notify: fallo al enviar a Telegram" }\n\n`;
        }
        if (useEmail) {
            code += `    # Enviar por Email\n`;
            code += `    :do {\n`;
            code += `        /tool e-mail send to="${inputs.email_to}" subject=("[" . $identity . "] " . $subject) body=$body\n`;
            code += `    } on-error={ :log error "notify: fallo al enviar email" }\n\n`;
        }

        code += `    :log info ("notify: " . $fullMsg)\n`;
        code += `}\n\n`;
        step++;

        code += `# USO MANUAL del helper:\n`;
        code += `#   /system script run notify "Asunto" "Cuerpo del mensaje"\n`;
        code += `# Desde otro script:\n`;
        code += `#   /system script run-with-args notify "Asunto" "Cuerpo"\n`;
        code += `# Nota: en RouterOS los argumentos se pasan con 'environment' o llamando al source.\n\n`;

        if (inputs.alert_wan_down) {
            const hosts = (inputs.watch_hosts || '').split('\n').map(l => l.trim()).filter(l => l.length > 0);
            code += `# ${step}. Netwatch: alerta cuando un host WAN deja de responder\n`;
            code += `/tool netwatch\n`;
            hosts.forEach((h, i) => {
                code += `add host=${h} interval=${inputs.watch_interval} timeout=2s comment="Watch-${i + 1}" \\\n`;
                code += `    down-script=("/system script run notify \\"WAN DOWN\\" \\"Host ${h} no responde\\"") \\\n`;
                code += `    up-script=("/system script run notify \\"WAN UP\\" \\"Host ${h} respondió de nuevo\\"")\n`;
            });
            code += `\n`;
            step++;
        }

        if (inputs.alert_admin_login) {
            code += `# ${step}. Detectar login de usuarios admin vía hook 'on-login'\n`;
            code += `# RouterOS dispara /system script con on-login si está configurado en /user.\n`;
            code += `/system script\n`;
            code += `add name=notify-login policy=read,test source={\n`;
            code += `    :local who [/user active get [/user active find] name]\n`;
            code += `    :local addr [/user active get [/user active find] address]\n`;
            code += `    /system script run notify "Login Admin" ("Usuario " . $who . " desde " . $addr)\n`;
            code += `}\n`;
            code += `# Asocia el script al usuario admin (manual, una vez):\n`;
            code += `# /user set admin on-login="/system script run notify-login"\n\n`;
            step++;
        }

        if (inputs.alert_high_cpu) {
            code += `# ${step}. Monitor de CPU: scheduler que revisa el load y notifica si supera el umbral\n`;
            code += `/system script\n`;
            code += `add name=check-cpu policy=read,test source={\n`;
            code += `    :local cpu [/system resource get cpu-load]\n`;
            code += `    :if ($cpu > ${inputs.cpu_threshold}) do={\n`;
            code += `        /system script run notify "CPU ALTO" ("CPU al " . $cpu . "% (umbral: ${inputs.cpu_threshold}%)")\n`;
            code += `    }\n`;
            code += `}\n`;
            code += `/system scheduler\n`;
            code += `add name=check-cpu-sched interval=${inputs.cpu_check_interval} on-event="/system script run check-cpu" comment="Monitor CPU"\n\n`;
            step++;
        }

        code += `# ====================================================\n`;
        code += `# CÓMO PROBAR\n`;
        code += `# 1. Manual: /system script run notify "Prueba" "Hola desde el router"\n`;
        if (useTg) {
            code += `# 2. Telegram debe mostrar el mensaje en pocos segundos.\n`;
            code += `# 3. Si no llega: revisa /log print, busca errores de 'fetch'.\n`;
            code += `#    - 401 = token inválido\n`;
            code += `#    - 400 = chat_id incorrecto (¿el bot está agregado al chat?)\n`;
        }
        if (useEmail) {
            code += `# 4. Email: revisa la bandeja y la carpeta SPAM.\n`;
            code += `#    Gmail requiere App Password (no la contraseña normal).\n`;
        }
        code += `# ====================================================\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
