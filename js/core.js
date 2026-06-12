// MikroTik Script Builder - Core
// UI + Registry. Each generator lives in /js/generators/<key>.js and
// registers itself via window.MTB.register(definition, generatorFn).

(function () {
    const registry = {
        definitions: {},
        generators: {},
        register(definition, generator) {
            if (!definition || !definition.key) {
                console.error('[MTB] register: missing definition.key', definition);
                return;
            }
            this.definitions[definition.key] = definition;
            this.generators[definition.key] = generator;
        }
    };
    window.MTB = registry;
})();

// App State
let currentScript = '';
let routerOsVersion = 'v7';
const formValues = {};
let currentGeneratedCode = '';

// Syntax Highlighter for RouterOS scripting language (single-pass to prevent nested tag corruption)
function highlightRSC(code) {
    let escaped = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const regex = /(#[^\n]*)|(".*?")|(\/[a-zA-Z0-9\-\/]+)|(\$[a-zA-Z0-9_]+)|([a-zA-Z0-9\-]+)=([a-zA-Z0-9\.\-\/\\:_]+)?/g;

    return escaped.replace(regex, (match, comment, string, command, variable, paramKey, paramValue) => {
        if (comment !== undefined) return `<span class="mt-comment">${comment}</span>`;
        if (string !== undefined) return `<span class="mt-string">${string}</span>`;
        if (command !== undefined) return `<span class="mt-command">${command}</span>`;
        if (variable !== undefined) return `<span class="mt-variable">${variable}</span>`;
        if (paramKey !== undefined) {
            if (paramValue !== undefined) {
                return `<span class="mt-param">${paramKey}</span>=<span class="mt-value">${paramValue}</span>`;
            }
            return `<span class="mt-param">${paramKey}</span>=`;
        }
        return match;
    });
}

function updateLineNumbers(code) {
    const lines = code.split('\n').length;
    const numbersContainer = document.getElementById('code-line-numbers');
    if (!numbersContainer) return;
    let numbersHtml = '';
    for (let i = 1; i <= lines; i++) numbersHtml += `${i}<br>`;
    numbersContainer.innerHTML = numbersHtml;
}

function updateScript() {
    const def = window.MTB.definitions[currentScript];
    if (!def) return;

    const currentInputs = {};

    def.inputs.forEach(input => {
        const el = document.getElementById(input.id);
        if (el) {
            if (input.type === 'checkbox') {
                currentInputs[input.id] = el.checked;
                formValues[`${currentScript}_${input.id}`] = el.checked;
            } else {
                currentInputs[input.id] = el.value;
                formValues[`${currentScript}_${input.id}`] = el.value;
            }
        } else {
            currentInputs[input.id] = formValues[`${currentScript}_${input.id}`] !== undefined
                ? formValues[`${currentScript}_${input.id}`]
                : (input.default !== undefined ? input.default : '');
        }
    });

    // PCC/Failover/ECMP: lectura de los inputs WAN dinámicos generados después de wan_count
    if (currentScript === 'pcc' || currentScript === 'failover' || currentScript === 'ecmp') {
        const wanCount = parseInt(currentInputs.wan_count || 2);
        const hostDefaults = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222", "8.8.4.4", "1.0.0.1", "4.2.2.1", "4.2.2.2", "208.67.220.220", "149.112.112.112"];

        for (let i = 1; i <= wanCount; i++) {
            const interfaceId = `wan${i}_interface`;
            const gatewayId = `wan${i}_gateway`;

            const interfaceEl = document.getElementById(interfaceId);
            if (interfaceEl) {
                currentInputs[interfaceId] = interfaceEl.value;
                formValues[`${currentScript}_${interfaceId}`] = interfaceEl.value;
            } else {
                currentInputs[interfaceId] = formValues[`${currentScript}_${interfaceId}`] !== undefined
                    ? formValues[`${currentScript}_${interfaceId}`]
                    : `ether${i}`;
            }

            const gatewayEl = document.getElementById(gatewayId);
            if (gatewayEl) {
                currentInputs[gatewayId] = gatewayEl.value;
                formValues[`${currentScript}_${gatewayId}`] = gatewayEl.value;
            } else {
                currentInputs[gatewayId] = formValues[`${currentScript}_${gatewayId}`] !== undefined
                    ? formValues[`${currentScript}_${gatewayId}`]
                    : `192.168.${i}.1`;
            }

            const recursiveWan = (currentScript === 'pcc' || currentScript === 'ecmp') && (currentInputs.recursive_routes || formValues[`${currentScript}_recursive_routes`]) === 'yes';
            if (currentScript === 'failover' || recursiveWan) {
                const hostId = `ping_host${i}`;
                const hostEl = document.getElementById(hostId);
                if (hostEl) {
                    currentInputs[hostId] = hostEl.value;
                    formValues[`${currentScript}_${hostId}`] = hostEl.value;
                } else {
                    currentInputs[hostId] = formValues[`${currentScript}_${hostId}`] !== undefined
                        ? formValues[`${currentScript}_${hostId}`]
                        : (hostDefaults[i - 1] || "8.8.8.8");
                }
            }
        }
    }

    const generator = window.MTB.generators[currentScript];
    if (generator) {
        currentGeneratedCode = generator(currentInputs, routerOsVersion);
    } else {
        currentGeneratedCode = '# Error: Generador no registrado para "' + currentScript + '".';
    }

    const highlighted = highlightRSC(currentGeneratedCode);
    const codeOutputEl = document.getElementById('code-output');
    if (codeOutputEl) codeOutputEl.innerHTML = highlighted;

    const fileNameEl = document.getElementById('script-file-name');
    if (fileNameEl) fileNameEl.innerText = def.fileName;

    updateLineNumbers(currentGeneratedCode);
}

function initializeFormValues(scriptKey) {
    const def = window.MTB.definitions[scriptKey];
    if (!def) return;

    def.inputs.forEach(input => {
        const key = `${scriptKey}_${input.id}`;
        if (formValues[key] === undefined) formValues[key] = input.default;
    });

    if (scriptKey === 'pcc' || scriptKey === 'failover' || scriptKey === 'ecmp') {
        const wanCountKey = `${scriptKey}_wan_count`;
        if (formValues[wanCountKey] === undefined) formValues[wanCountKey] = "2";
        const hostDefaults = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222", "8.8.4.4", "1.0.0.1", "4.2.2.1", "4.2.2.2", "208.67.220.220", "149.112.112.112"];
        for (let i = 1; i <= 10; i++) {
            const wanInterfaceKey = `${scriptKey}_wan${i}_interface`;
            const wanGatewayKey = `${scriptKey}_wan${i}_gateway`;

            if (formValues[wanInterfaceKey] === undefined) formValues[wanInterfaceKey] = `ether${i}`;
            if (formValues[wanGatewayKey] === undefined) formValues[wanGatewayKey] = `192.168.${i}.1`;

            if (scriptKey === 'failover') {
                const pingHostKey = `${scriptKey}_ping_host${i}`;
                if (formValues[pingHostKey] === undefined) {
                    formValues[pingHostKey] = hostDefaults[i - 1] || "8.8.8.8";
                }
            }
        }
    }
}

function renderInputs() {
    const def = window.MTB.definitions[currentScript];
    const container = document.getElementById('dynamic-inputs');
    if (!container || !def) return;

    container.innerHTML = '';

    if (def.isV7Only && routerOsVersion === 'v6') {
        const warning = document.createElement('div');
        warning.className = 'warning-box';
        warning.innerHTML = `
            <strong>Requiere RouterOS v7</strong>
            Este script utiliza funciones que solo existen en la versión v7. Cambia el selector de RouterOS arriba a la derecha a 'v7' para configurarlo.
        `;
        container.appendChild(warning);
        return;
    }

    if (currentScript === 'firewall') {
        const info = document.createElement('div');
        info.className = 'info-box';
        info.innerHTML = `
            <strong>Tip Pro:</strong> Si piensas usar colas simples (Simple Queues) o Balanceo PCC, se recomienda desactivar <em>FastTrack</em>, ya que este atajo del kernel se salta las marcas de mangle y de colas.
        `;
        container.appendChild(info);
    }

    def.inputs.forEach(input => {
        if (currentScript === 'pcc') {
            const matchType = formValues['pcc_lan_match_type'] || 'in-interface';
            if (input.id === 'lan_interface' && matchType !== 'in-interface') return;
            if (input.id === 'lan_interface_list' && matchType !== 'in-interface-list') return;
            if (input.id === 'lan_address_list' && matchType !== 'src-address-list') return;
        }

        if (currentScript === 'pbr') {
            const targetType = formValues['pbr_target_type'] || 'src-address';
            if (input.id === 'src_address' && targetType !== 'src-address') return;
            if (input.id === 'in_interface' && targetType !== 'in-interface' && targetType !== 'port-protocol') return;
            if (input.id === 'protocol' && targetType !== 'port-protocol') return;
            if (input.id === 'dst_port' && targetType !== 'port-protocol') return;
            if (input.id === 'method_v7' && targetType === 'port-protocol') return;
        }

        if (currentScript === 'rate-limit') {
            const useBurst = formValues['rate-limit_use_burst'] !== undefined ? formValues['rate-limit_use_burst'] : true;
            const usePriorityLimitAt = formValues['rate-limit_use_priority_limitat'] !== undefined ? formValues['rate-limit_use_priority_limitat'] : true;
            
            const burstFields = ['upload_burst', 'download_burst', 'upload_threshold', 'download_threshold', 'upload_time', 'download_time'];
            const priorityFields = ['priority', 'upload_limit_at', 'download_limit_at'];
            
            if (!useBurst && burstFields.includes(input.id)) return;
            if (!usePriorityLimitAt && priorityFields.includes(input.id)) return;
        }

        if (currentScript === 'public-ip') {
            const method = formValues['public-ip_method'] !== undefined ? formValues['public-ip_method'] : 'nat11';
            
            const natFields = ['client_private_ip', 'server_wan'];
            const routedFields = ['subnet_mask', 'gateway_ip'];
            const pppoeFields = ['pppoe_user', 'pppoe_pass', 'pppoe_service'];
            
            if (method !== 'nat11' && natFields.includes(input.id)) return;
            if (method !== 'routed' && routedFields.includes(input.id)) return;
            if (method !== 'pppoe' && pppoeFields.includes(input.id)) return;
        }

        const group = document.createElement('div');
        const storedVal = formValues[`${currentScript}_${input.id}`];
        const val = storedVal !== undefined ? storedVal : (input.default !== undefined ? input.default : '');

        if (input.type === 'checkbox') {
            group.className = 'form-group checkbox-group';
            group.innerHTML = `
                <input type="checkbox" id="${input.id}" ${val ? 'checked' : ''}>
                <label for="${input.id}">
                    ${input.label}
                    ${input.hint ? `<span class="hint">${input.hint}</span>` : ''}
                </label>
            `;
            const checkbox = group.querySelector('input');
            checkbox.addEventListener('change', () => {
                formValues[`${currentScript}_${input.id}`] = checkbox.checked;
                if (input.id === 'use_burst' || input.id === 'use_priority_limitat') {
                    renderInputs();
                }
                updateScript();
            });
        } else if (input.type === 'select') {
            group.className = 'form-group';
            let optionsHtml = '';
            input.options.forEach(opt => {
                optionsHtml += `<option value="${opt.value}" ${opt.value == val ? 'selected' : ''}>${opt.label}</option>`;
            });
            group.innerHTML = `
                <label for="${input.id}">
                    ${input.label}
                    ${input.hint ? `<span class="hint">${input.hint}</span>` : ''}
                </label>
                <select id="${input.id}" class="form-control">
                    ${optionsHtml}
                </select>
            `;
            const select = group.querySelector('select');
            select.addEventListener('change', () => {
                formValues[`${currentScript}_${input.id}`] = select.value;
                if (input.id === 'wan_count' || input.id === 'lan_match_type' || input.id === 'recursive_routes' || input.id === 'target_type' || input.id === 'method') {
                    renderInputs();
                }
                updateScript();
            });
        } else if (input.type === 'textarea') {
            group.className = 'form-group';
            group.innerHTML = `
                <label for="${input.id}">
                    ${input.label}
                    ${input.hint ? `<span class="hint">${input.hint}</span>` : ''}
                </label>
                <textarea id="${input.id}" class="form-control" rows="6">${val}</textarea>
            `;
            const textarea = group.querySelector('textarea');
            textarea.addEventListener('input', () => {
                formValues[`${currentScript}_${input.id}`] = textarea.value;
                updateScript();
            });
        } else {
            group.className = 'form-group';
            group.innerHTML = `
                <label for="${input.id}">
                    ${input.label}
                    ${input.hint ? `<span class="hint">${input.hint}</span>` : ''}
                </label>
                <input type="text" id="${input.id}" class="form-control" value="${val}" placeholder="${input.default || ''}">
            `;
            const textInput = group.querySelector('input');
            textInput.addEventListener('input', () => {
                formValues[`${currentScript}_${input.id}`] = textInput.value;
                updateScript();
            });
        }

        container.appendChild(group);

        // Dynamic WAN fields after wan_count (PCC y Failover)
        if (input.id === 'wan_count') {
            renderDynamicWanFields(parseInt(val), container);
        }
    });
}

function renderDynamicWanFields(N, container) {
    const hostDefaults = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222", "8.8.4.4", "1.0.0.1", "4.2.2.1", "4.2.2.2", "208.67.220.220", "149.112.112.112"];

    const wanFieldsContainer = document.createElement('div');
    wanFieldsContainer.className = 'dynamic-wan-fields';
    wanFieldsContainer.style.display = 'flex';
    wanFieldsContainer.style.flexDirection = 'column';
    wanFieldsContainer.style.gap = '16px';
    wanFieldsContainer.style.marginTop = '16px';
    wanFieldsContainer.style.padding = '12px';
    wanFieldsContainer.style.borderLeft = '2px solid var(--primary)';
    wanFieldsContainer.style.background = 'rgba(255, 255, 255, 0.01)';

    for (let i = 1; i <= N; i++) {
        const subheader = document.createElement('h4');
        subheader.innerText = `Línea WAN ${i}`;
        subheader.style.fontSize = '0.9rem';
        subheader.style.color = 'var(--primary)';
        subheader.style.marginTop = i > 1 ? '12px' : '0';
        wanFieldsContainer.appendChild(subheader);

        appendDynamicTextField(wanFieldsContainer, `wan${i}_interface`, `Interfaz WAN ${i}`, `ether${i}`);
        appendDynamicTextField(wanFieldsContainer, `wan${i}_gateway`, `Gateway WAN ${i}`, `192.168.${i}.1`);

        const recursiveWan = (currentScript === 'pcc' || currentScript === 'ecmp') && formValues[`${currentScript}_recursive_routes`] === 'yes';
        if (currentScript === 'failover' || recursiveWan) {
            appendDynamicTextField(wanFieldsContainer, `ping_host${i}`, `Host Monitoreo WAN ${i}`, hostDefaults[i - 1] || "8.8.8.8");
        }
    }
    container.appendChild(wanFieldsContainer);
}

function appendDynamicTextField(parent, id, label, defaultVal) {
    const stored = formValues[`${currentScript}_${id}`];
    const val = stored !== undefined ? stored : defaultVal;

    const group = document.createElement('div');
    group.className = 'form-group';
    group.innerHTML = `
        <label for="${id}">${label}</label>
        <input type="text" id="${id}" class="form-control" value="${val}">
    `;
    const input = group.querySelector('input');
    input.addEventListener('input', () => {
        formValues[`${currentScript}_${id}`] = input.value;
        updateScript();
    });
    parent.appendChild(group);
}

function copyToClipboard() {
    navigator.clipboard.writeText(currentGeneratedCode).then(() => {
        const copyBtn = document.getElementById('btn-copy');
        if (!copyBtn) return;
        copyBtn.classList.add('copied');
        copyBtn.querySelector('.btn-text').innerText = '¡Copiado!';
        copyBtn.querySelector('.btn-icon').innerText = '✅';

        setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.querySelector('.btn-text').innerText = 'Copiar';
            copyBtn.querySelector('.btn-icon').innerText = '📋';
        }, 2000);
    }).catch(err => {
        console.error('Error al copiar al portapapeles: ', err);
    });
}

function downloadScript() {
    const def = window.MTB.definitions[currentScript];
    const fileName = def ? def.fileName : 'mikrotik_script.rsc';

    const blob = new Blob([currentGeneratedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

window.addEventListener('DOMContentLoaded', () => {
    const pageScript = document.body.getAttribute('data-script');
    if (!pageScript) return;

    currentScript = pageScript;

    // Solo se inicializa la página actual (cada HTML carga solo su generador)
    initializeFormValues(currentScript);

    const selectedVersionRadio = document.querySelector('input[name="routeros-version"]:checked');
    if (selectedVersionRadio) routerOsVersion = selectedVersionRadio.value;

    document.querySelectorAll('input[name="routeros-version"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            routerOsVersion = e.target.value;
            renderInputs();
            updateScript();
        });
    });

    const btnCopy = document.getElementById('btn-copy');
    if (btnCopy) btnCopy.addEventListener('click', copyToClipboard);

    const btnDownload = document.getElementById('btn-download');
    if (btnDownload) btnDownload.addEventListener('click', downloadScript);

    const def = window.MTB.definitions[currentScript];
    if (def) {
        const titleEl = document.getElementById('current-script-title');
        const descEl = document.getElementById('current-script-description');
        if (titleEl) titleEl.innerText = def.title;
        if (descEl) descEl.innerText = def.description;

        renderInputs();
        updateScript();
    } else {
        console.error('[MTB] No hay definición registrada para "' + currentScript + '". Verifica que el script src en el HTML cargue el generador correcto.');
    }
});
