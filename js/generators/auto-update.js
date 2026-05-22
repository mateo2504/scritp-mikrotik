// Auto-update de RouterOS programado. Auto-registra vía window.MTB.
(function () {
    const definition = {
        key: 'auto-update',
        title: "Auto-Update de RouterOS",
        description: "Revisa periódicamente si hay nuevas versiones de RouterOS, notifica al admin y opcionalmente descarga/instala automáticamente. Incluye respaldo previo a la instalación.",
        fileName: "mikrotik_auto_update.rsc",
        inputs: [
            {
                id: "mode",
                label: "Modo de Operación",
                type: "select",
                options: [
                    { value: "notify-only", label: "Solo notificar (recomendado)" },
                    { value: "download-only", label: "Descargar pero no instalar" },
                    { value: "install-auto", label: "Instalar automáticamente (PELIGROSO)" }
                ],
                default: "notify-only",
                hint: "Solo-notificar es seguro. Auto-install reinicia el router solo."
            },
            {
                id: "channel",
                label: "Canal de RouterOS",
                type: "select",
                options: [
                    { value: "stable", label: "Stable (producción)" },
                    { value: "long-term", label: "Long-term (LTS - máxima estabilidad)" },
                    { value: "testing", label: "Testing (beta - no usar en producción)" }
                ],
                default: "stable"
            },
            { id: "check_interval", label: "Frecuencia de Revisión", type: "select", options: [
                { value: "1d", label: "Diaria" },
                { value: "1w", label: "Semanal (recomendado)" },
                { value: "1mo", label: "Mensual" }
            ], default: "1w" },
            { id: "check_time", label: "Hora de Revisión", type: "text", default: "04:00:00" },
            { id: "install_window", label: "Ventana de Instalación (hora)", type: "text", default: "03:00:00", hint: "Solo aplica a 'Instalar automáticamente'. Hora ideal: madrugada con baja carga." },
            { id: "backup_before_install", label: "Hacer backup antes de instalar", type: "checkbox", default: true, hint: "Crítico para poder revertir si la nueva versión falla" },
            { id: "use_notify", label: "Usar el script 'notify' (debe estar configurado)", type: "checkbox", default: true, hint: "Si lo activas, las notificaciones van por Email/Telegram. Si no, solo al log." }
        ]
    };

    function generate(inputs, version) {
        const mode = inputs.mode || 'notify-only';
        const channel = inputs.channel || 'stable';
        const useNotify = inputs.use_notify;

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Auto-Update de RouterOS\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Modo: ${mode}\n`;
        code += `# Canal: ${channel}\n`;
        code += `# ====================================================\n\n`;

        code += `# 1. Configurar el canal de updates\n`;
        code += `/system package update\n`;
        code += `set channel=${channel}\n\n`;

        code += `# 2. Script principal de chequeo\n`;
        code += `/system script\n`;
        code += `add name=check-routeros-update policy=read,write,policy,test,reboot source={\n`;
        code += `    :log info "Revisando actualizaciones de RouterOS..."\n`;
        code += `    /system package update check-for-updates once\n`;
        code += `    :delay 5s\n`;
        code += `    :local status [/system package update get status]\n`;
        code += `    :local installed [/system package update get installed-version]\n`;
        code += `    :local latest [/system package update get latest-version]\n\n`;

        code += `    :if ($status = "New version is available") do={\n`;
        code += `        :local msg ("Nueva versión disponible: " . $latest . " (instalada: " . $installed . ")")\n`;
        code += `        :log warning $msg\n`;

        if (useNotify) {
            code += `        :do { /system script run notify "Update Disponible" $msg } on-error={ :log error "Script 'notify' no existe - configúralo primero" }\n`;
        }

        if (mode === 'download-only') {
            code += `\n        # Modo download-only: descarga el paquete pero NO reinicia\n`;
            code += `        :log info "Descargando paquetes..."\n`;
            code += `        /system package update download\n`;
            if (useNotify) {
                code += `        :do { /system script run notify "Update Descargado" ("Reinicia manualmente para aplicar " . $latest) } on-error={}\n`;
            }
        }

        if (mode === 'install-auto') {
            code += `\n        # Modo auto-install: PELIGROSO - el router reiniciará automáticamente\n`;
            if (inputs.backup_before_install) {
                code += `        :log warning "Generando backup pre-update..."\n`;
                code += `        :local bkName ("pre-update-" . $installed . "-to-" . $latest)\n`;
                code += `        /system backup save name=$bkName password="ChangeMe_PreUpdateBackup"\n`;
                code += `        /export file=$bkName\n`;
                code += `        :delay 5s\n`;
            }
            if (useNotify) {
                code += `        :do { /system script run notify "Update Iniciando" ("Instalando " . $latest . " - el router reiniciará") } on-error={}\n`;
                code += `        :delay 10s\n`;
            }
            code += `        :log warning "INSTALANDO update - el router reiniciará"\n`;
            code += `        /system package update install\n`;
        }
        code += `    } else={\n`;
        code += `        :log info ("Sistema al día. Versión: " . $installed . " (estado: " . $status . ")")\n`;
        code += `    }\n`;
        code += `}\n\n`;

        code += `# 3. Scheduler para revisión periódica\n`;
        code += `/system scheduler\n`;
        const startTime = mode === 'install-auto' ? inputs.install_window : inputs.check_time;
        code += `add name=routeros-update-check interval=${inputs.check_interval} start-time=${startTime} on-event="/system script run check-routeros-update" comment="Auto-check RouterOS update"\n\n`;

        code += `# ====================================================\n`;
        code += `# RECOMENDACIONES\n`;
        code += `# - Empieza con 'notify-only'. Decide tú cuándo instalar.\n`;
        code += `# - Antes de actualizar, lee siempre las release notes en mikrotik.com/download\n`;
        code += `# - Para hardware crítico (CCR, CHR producción): canal=long-term, modo=notify-only.\n`;
        if (mode === 'install-auto') {
            code += `# - MODO INSTALL-AUTO ACTIVADO: el router se reiniciará solo. Asegúrate de:\n`;
            code += `#   1. Tener acceso físico o IPMI/console si algo falla.\n`;
            code += `#   2. Que el backup pre-update se guarde (verifica al menos 1 vez manual).\n`;
            code += `#   3. Que la ventana de instalación (${inputs.install_window}) sea de baja actividad.\n`;
        }
        code += `# ====================================================\n`;
        code += `# COMANDOS ÚTILES:\n`;
        code += `#   /system package update print               (estado actual)\n`;
        code += `#   /system package update check-for-updates   (forzar revisión ahora)\n`;
        code += `#   /system package update download            (descargar manual)\n`;
        code += `#   /system package update install             (instalar y reiniciar)\n`;
        code += `#   /system script run check-routeros-update   (probar este script)\n`;
        code += `# REVERTIR si la nueva versión falla:\n`;
        code += `#   /system package downgrade                  (vuelve a la versión previa)\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
