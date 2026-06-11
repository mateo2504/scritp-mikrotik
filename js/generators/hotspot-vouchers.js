// Fichas Hotspot en lote: script .rsc con los usuarios + vouchers listos para imprimir.
(function () {
    const definition = {
        key: 'hotspot-vouchers',
        title: "Fichas Hotspot (Lote + Impresión)",
        description: "Genera un lote de fichas/vouchers para Hotspot: el script .rsc con todos los usuarios listos para importar y las fichas en formato imprimible (código, WiFi, precio y vigencia). Compatible con los perfiles del generador de Perfiles Hotspot.",
        fileName: "mikrotik_hotspot_fichas.rsc",
        inputs: [
            { id: "voucher_count", label: "Cantidad de Fichas", type: "text", default: "30", hint: "Número de fichas a generar (máx. 500)" },
            { id: "profile", label: "Perfil de Usuario Hotspot", type: "text", default: "ficha-3dias", hint: "Debe existir en /ip hotspot user profile (créalo con el generador de Perfiles Hotspot)" },
            { id: "mode", label: "Tipo de Ficha", type: "select", options: [
                { value: "code", label: "Código único (usuario = contraseña)" },
                { value: "userpass", label: "Usuario y contraseña distintos" }
            ], default: "code", hint: "El código único es más cómodo para el cliente: escribe lo mismo en ambos campos" },
            { id: "charset", label: "Caracteres del Código", type: "select", options: [
                { value: "digits", label: "Solo números (ej: 483920)" },
                { value: "upper", label: "Mayúsculas + números, sin ambiguos (ej: K7PM2X)" },
                { value: "lower", label: "Minúsculas + números, sin ambiguos (ej: k7pm2x)" }
            ], default: "digits", hint: "Sin ambiguos = se excluyen 0/O, 1/I/l para evitar errores al teclear" },
            { id: "code_length", label: "Longitud del Código", type: "text", default: "6", hint: "Entre 4 y 12 caracteres" },
            { id: "prefix", label: "Prefijo del Usuario (opcional)", type: "text", default: "", hint: "Ej: 'fc-' genera fc-483920. Útil para identificar lotes" },
            { id: "limit_uptime", label: "Límite de Horas de Uso (opcional)", type: "text", default: "", hint: "limit-uptime por ficha (ej: 5h). Vacío = sin límite. La vigencia en días la controla el perfil" },
            { id: "batch_comment", label: "Comentario del Lote", type: "text", default: "Lote fichas", hint: "Se guarda en el comentario de cada usuario junto a la fecha" },
            { id: "wifi_name", label: "Nombre de la Red WiFi (para la ficha impresa)", type: "text", default: "WiFi Zone", hint: "SSID que verá el cliente en la ficha" },
            { id: "plan_label", label: "Plan / Vigencia (texto en la ficha)", type: "text", default: "3 días - 5 Mbps", hint: "Texto descriptivo impreso en cada ficha" },
            { id: "price_label", label: "Precio (texto en la ficha, opcional)", type: "text", default: "", hint: "Ej: $10. Vacío = no se imprime" }
        ]
    };

    const CHARSETS = {
        digits: "0123456789",
        upper: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
        lower: "abcdefghjkmnpqrstuvwxyz23456789"
    };

    // Lote cacheado: los códigos solo se re-sortean si cambian los parámetros que
    // los definen (no al editar textos de la ficha) o al pulsar "Regenerar códigos".
    let cachedKey = null;
    let cachedBatch = null;
    let lastInputs = null;

    function randomCode(charset, length) {
        const out = [];
        const buf = new Uint32Array(length);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(buf);
        } else {
            for (let i = 0; i < length; i++) buf[i] = Math.floor(Math.random() * 4294967296);
        }
        for (let i = 0; i < length; i++) out.push(charset[buf[i] % charset.length]);
        return out.join('');
    }

    function buildBatch(count, mode, charset, length, prefix) {
        const seen = new Set();
        const batch = [];
        while (batch.length < count) {
            const code = randomCode(charset, length);
            if (seen.has(code)) continue;
            seen.add(code);
            if (mode === 'userpass') {
                batch.push({ user: prefix + code, pass: randomCode(charset, length) });
            } else {
                batch.push({ user: prefix + code, pass: prefix + code });
            }
        }
        return batch;
    }

    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function voucherCardHtml(v, inputs, mode) {
        const wifi = escapeHtml(inputs.wifi_name || 'WiFi');
        const plan = escapeHtml(inputs.plan_label || '');
        const price = escapeHtml(inputs.price_label || '');
        let credentials;
        if (mode === 'userpass') {
            credentials = `<div class="v-cred"><span>Usuario:</span> <b>${escapeHtml(v.user)}</b></div>` +
                `<div class="v-cred"><span>Clave:</span> <b>${escapeHtml(v.pass)}</b></div>`;
        } else {
            credentials = `<div class="v-cred v-code"><b>${escapeHtml(v.user)}</b></div>`;
        }
        return `<div class="voucher">` +
            `<div class="v-head">📶 ${wifi}${price ? `<span class="v-price">${price}</span>` : ''}</div>` +
            credentials +
            `<div class="v-plan">${plan}</div>` +
            `<div class="v-foot">Conéctate a la red y escribe el código en el portal</div>` +
            `</div>`;
    }

    function renderPreview(batch, inputs) {
        const container = document.getElementById('voucher-preview');
        if (!container) return;
        const mode = inputs.mode || 'code';
        container.innerHTML = batch.map(v => voucherCardHtml(v, inputs, mode)).join('');
        const counter = document.getElementById('voucher-count-label');
        if (counter) counter.innerText = `${batch.length} fichas`;
    }

    function printVouchers() {
        if (!cachedBatch || !lastInputs) return;
        const mode = lastInputs.mode || 'code';
        const cards = cachedBatch.map(v => voucherCardHtml(v, lastInputs, mode)).join('\n');
        const win = window.open('', '_blank');
        if (!win) { alert('El navegador bloqueó la ventana de impresión. Permite los pop-ups para este sitio.'); return; }
        win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Fichas Hotspot - ${escapeHtml(lastInputs.wifi_name || 'WiFi')}</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #000; padding: 8mm; }
    .sheet { display: flex; flex-wrap: wrap; gap: 4mm; }
    .voucher { width: 62mm; border: 1px dashed #888; border-radius: 2mm; padding: 3mm; page-break-inside: avoid; }
    .v-head { font-size: 3.6mm; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 1.5mm; margin-bottom: 2mm; display: flex; justify-content: space-between; align-items: center; }
    .v-price { font-size: 3.6mm; }
    .v-cred { font-size: 3.4mm; margin: 1mm 0; }
    .v-cred b { font-family: 'Courier New', monospace; font-size: 4.2mm; letter-spacing: 0.5mm; }
    .v-code { text-align: center; margin: 2mm 0; }
    .v-code b { font-size: 6mm; letter-spacing: 1mm; }
    .v-plan { font-size: 3mm; text-align: center; color: #333; margin-top: 1.5mm; }
    .v-foot { font-size: 2.4mm; color: #666; text-align: center; margin-top: 1.5mm; border-top: 1px solid #eee; padding-top: 1mm; }
    @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="sheet">
${cards}
</div>
<script>window.onload = function () { window.print(); };<\/script>
</body>
</html>`);
        win.document.close();
    }

    function generate(inputs, version) {
        let count = parseInt(inputs.voucher_count) || 30;
        if (count < 1) count = 1;
        if (count > 500) count = 500;
        let length = parseInt(inputs.code_length) || 6;
        if (length < 4) length = 4;
        if (length > 12) length = 12;
        const mode = inputs.mode || 'code';
        const charset = CHARSETS[inputs.charset] || CHARSETS.digits;
        const prefix = (inputs.prefix || '').trim();
        const profile = (inputs.profile || 'ficha-3dias').trim();
        const uptime = (inputs.limit_uptime || '').trim();

        const key = JSON.stringify([count, mode, inputs.charset, length, prefix]);
        if (key !== cachedKey) {
            cachedKey = key;
            cachedBatch = buildBatch(count, mode, charset, length, prefix);
        }
        lastInputs = inputs;
        const batch = cachedBatch;

        const today = new Date().toLocaleDateString();
        const comment = `${(inputs.batch_comment || 'Lote fichas').trim()} ${today}`;

        let code = `# ====================================================\n`;
        code += `# SCRIPT: Lote de ${batch.length} Fichas Hotspot\n`;
        code += `# RouterOS Version: ${version.toUpperCase()}\n`;
        code += `# Generado: ${today}\n`;
        code += `# Perfil: ${profile} | Tipo: ${mode === 'userpass' ? 'usuario y contraseña' : 'código único'}\n`;
        code += `# ====================================================\n`;
        code += `# IMPORTANTE: el perfil "${profile}" debe existir en /ip hotspot user profile.\n`;
        code += `# Créalo con el generador "Perfiles Hotspot (Fichas con Vigencia)".\n`;
        code += `# Usa el botón "Imprimir fichas" de esta página para los vouchers en papel.\n`;
        code += `# ====================================================\n\n`;

        code += `/ip hotspot user\n`;
        batch.forEach(v => {
            let line = `add name="${v.user}" password="${v.pass}" profile="${profile}"`;
            if (uptime) line += ` limit-uptime=${uptime}`;
            line += ` comment="${comment}"\n`;
            code += line;
        });

        code += `\n# ====================================================\n`;
        code += `# GESTIÓN DEL LOTE:\n`;
        code += `#   Ver fichas:     /ip hotspot user print where comment="${comment}"\n`;
        code += `#   Borrar el lote: /ip hotspot user remove [find where comment="${comment}"]\n`;
        if (uptime) {
            code += `#   limit-uptime=${uptime}: tiempo de conexión ACUMULADO por ficha.\n`;
        }
        code += `# ====================================================\n`;

        renderPreview(batch, inputs);
        return code;
    }

    window.addEventListener('DOMContentLoaded', () => {
        const btnPrint = document.getElementById('btn-print-vouchers');
        if (btnPrint) btnPrint.addEventListener('click', printVouchers);
        const btnRegen = document.getElementById('btn-regen-codes');
        if (btnRegen) btnRegen.addEventListener('click', () => {
            cachedKey = null;
            if (typeof updateScript === 'function') updateScript();
        });
    });

    window.MTB.register(definition, generate);
})();
