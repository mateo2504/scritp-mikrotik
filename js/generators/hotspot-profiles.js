// Perfiles de usuario Hotspot (fichas/vouchers) con vigencia automática vía on-login.
(function () {
    const definition = {
        key: 'hotspot-profiles',
        title: "Perfiles Hotspot (Fichas con Vigencia)",
        description: "Crea perfiles de usuario para Hotspot tipo ficha/voucher: velocidad, usuarios compartidos, timeouts recomendados, MAC cookie y script on-login que activa la vigencia en el primer login y elimina la ficha automáticamente al vencer.",
        fileName: "mikrotik_hotspot_profiles.rsc",
        inputs: [
            { id: "profile_name", label: "Nombre del Perfil", type: "text", default: "ficha-3dias", hint: "Identificador del perfil en /ip hotspot user profile" },
            { id: "rate_limit", label: "Velocidad (subida/bajada)", type: "text", default: "2M/5M", hint: "Formato rx/tx visto desde el cliente. Ej: 2M/5M. Vacío = sin límite" },
            { id: "shared_users", label: "Usuarios Compartidos (shared-users)", type: "text", default: "1", hint: "Dispositivos que pueden usar la misma ficha a la vez. Ej: 2 para compartir en pareja" },
            { id: "validity", label: "Vigencia de la Ficha", type: "text", default: "3d", hint: "Cuenta desde el PRIMER login (ej: 1h, 1d, 3d, 30d). Al vencer, la ficha se elimina sola" },
            { id: "on_login_expire", label: "Script on-login: vigencia automática y auto-eliminación", type: "checkbox", default: true, hint: "En el primer login crea un scheduler que al vencer la vigencia desconecta al usuario, borra la ficha y se borra a sí mismo" },
            { id: "session_timeout", label: "Session Timeout", type: "text", default: "", hint: "Corta la sesión tras este tiempo conectado (el cliente puede volver a loguearse). Recomendado: vacío, la vigencia ya controla la duración total" },
            { id: "idle_timeout", label: "Idle Timeout", type: "text", default: "5m", hint: "Recomendado 5m: libera la sesión de clientes inactivos (no consume shared-users)" },
            { id: "keepalive_timeout", label: "Keepalive Timeout", type: "text", default: "2m", hint: "Recomendado 2m: detecta dispositivos apagados o fuera de cobertura y libera la sesión" },
            { id: "mac_cookie", label: "MAC Cookie (re-login automático del dispositivo)", type: "checkbox", default: true, hint: "El cliente no vuelve a ver el portal mientras la ficha esté vigente. El mac-cookie-timeout se fija igual a la vigencia" },
            { id: "sample_user", label: "Crear Ficha de Prueba (opcional)", type: "text", default: "", hint: "Nombre de usuario de prueba con este perfil. Vacío = no crear" },
            { id: "sample_pass", label: "Contraseña de la Ficha de Prueba", type: "text", default: "1234" }
        ]
    };

    // Escapa un script para incrustarlo como valor entre comillas en un .rsc:
    // \ -> \\ , " -> \" , $ -> \$ (el $user debe sustituirse al ejecutar on-login, no al importar)
    function rscQuote(script) {
        return script
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$');
    }

    function generate(inputs, version) {
        const name = (inputs.profile_name || 'ficha-3dias').trim();
        const rate = (inputs.rate_limit || '').trim();
        const shared = (inputs.shared_users || '1').trim();
        const validity = (inputs.validity || '3d').trim();
        const sessionT = (inputs.session_timeout || '').trim();
        const idleT = (inputs.idle_timeout || '5m').trim();
        const keepT = (inputs.keepalive_timeout || '2m').trim();
        const sampleUser = (inputs.sample_user || '').trim();

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Perfil Hotspot tipo Ficha/Voucher con Vigencia\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${new Date().toLocaleDateString()}\n`;
        code += `# Perfil: ${name} | Velocidad: ${rate || 'sin límite'} | Vigencia: ${validity}\n`;
        code += `# ====================================================\n\n`;

        if (inputs.on_login_expire) {
            code += `# CÓMO FUNCIONA LA VIGENCIA:\n`;
            code += `# 1. En el PRIMER login de la ficha, el script on-login crea un scheduler\n`;
            code += `#    llamado "vig-<usuario>" con interval=${validity} (se ejecuta una sola vez,\n`;
            code += `#    ${validity} después del primer login).\n`;
            code += `# 2. Al vencer, el scheduler desconecta al usuario, elimina la ficha de\n`;
            code += `#    /ip hotspot user y se elimina a sí mismo. Sin residuos.\n`;
            code += `# 3. El comentario de la ficha registra fecha/hora del primer login.\n`;
            code += `# NOTA: las fichas que NUNCA inician sesión no expiran (no tienen scheduler).\n\n`;
        }

        // Script on-login almacenado en el perfil (los $ y " van escapados para el import).
        // El on-event del scheduler se construye en runtime concatenando el nombre del
        // usuario, porque $user no existe cuando el scheduler se ejecuta.
        const onLogin =
            ':if ([:len [/system scheduler find where name=("vig-" . $user)]] = 0) do={ ' +
            '/system scheduler add name=("vig-" . $user) interval=' + validity + ' ' +
            'start-date=[/system clock get date] start-time=[/system clock get time] ' +
            'comment=("Vigencia ' + validity + ' de la ficha " . $user) ' +
            'on-event=("/ip hotspot active remove [find where user=\\"" . $user . "\\"]; ' +
            '/ip hotspot user remove [find where name=\\"" . $user . "\\"]; ' +
            '/system scheduler remove [find where name=\\"vig-" . $user . "\\"]"); ' +
            '/ip hotspot user set [find where name=$user] ' +
            'comment=("Primer login: " . [/system clock get date] . " " . [/system clock get time] . " | vence en ' + validity + '") }';

        code += `# 1. Perfil de usuario Hotspot\n`;
        code += `/ip hotspot user profile\n`;
        let profileLine = `add name="${name}"`;
        if (rate) profileLine += ` rate-limit=${rate}`;
        profileLine += ` shared-users=${shared}`;
        if (sessionT) profileLine += ` session-timeout=${sessionT}`;
        profileLine += ` idle-timeout=${idleT}`;
        profileLine += ` keepalive-timeout=${keepT}`;
        if (inputs.mac_cookie) {
            profileLine += ` add-mac-cookie=yes mac-cookie-timeout=${validity}`;
        } else {
            profileLine += ` add-mac-cookie=no`;
        }
        if (inputs.on_login_expire) {
            profileLine += ` on-login="${rscQuote(onLogin)}"`;
        }
        code += profileLine + `\n\n`;

        if (sampleUser) {
            code += `# 2. Ficha de prueba con este perfil\n`;
            code += `/ip hotspot user\n`;
            code += `add name="${sampleUser}" password="${inputs.sample_pass || '1234'}" profile="${name}" comment="Ficha de prueba (sin usar)"\n\n`;
        }

        code += `# ====================================================\n`;
        code += `# NOTAS Y VALORES RECOMENDADOS\n`;
        code += `# - rate-limit: subida/bajada vista desde el cliente (rx/tx).\n`;
        code += `# - shared-users=${shared}: dispositivos simultáneos por ficha.\n`;
        code += `# - idle-timeout=${idleT}: libera sesiones inactivas para no agotar shared-users.\n`;
        code += `# - keepalive-timeout=${keepT}: detecta clientes apagados/fuera de cobertura.\n`;
        if (sessionT) {
            code += `# - session-timeout=${sessionT}: corta la sesión, pero el cliente puede reloguearse;\n`;
            code += `#   NO limita el tiempo total de la ficha (eso lo hace la vigencia).\n`;
        }
        if (inputs.mac_cookie) {
            code += `# - mac-cookie-timeout=${validity} (igual a la vigencia): el dispositivo entra\n`;
            code += `#   sin ver el portal mientras la ficha viva; al eliminarse la ficha, el\n`;
            code += `#   cookie deja de servir porque el usuario ya no existe.\n`;
        }
        code += `# - Si necesitas limitar HORAS DE USO acumuladas (no días corridos), usa\n`;
        code += `#   limit-uptime en cada usuario: /ip hotspot user set <ficha> limit-uptime=5h\n`;
        if (inputs.on_login_expire) {
            code += `#\n`;
            code += `# MONITOREO DE VIGENCIAS:\n`;
            code += `#   /system scheduler print where name~"vig-"     (fichas activadas y su vencimiento)\n`;
            code += `#   /ip hotspot user print detail                  (comentario = primer login)\n`;
            code += `# IMPORTANTE: usa nombres de ficha alfanuméricos (sin comillas ni espacios),\n`;
            code += `# el nombre se usa para crear el scheduler "vig-<usuario>".\n`;
        }
        code += `# ====================================================\n`;

        return code;
    }

    window.MTB.register(definition, generate);
})();
