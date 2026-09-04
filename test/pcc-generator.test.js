'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const generatorPath = path.join(__dirname, '..', 'js', 'generators', 'pcc.js');
const context = {
    window: {
        MTB: {
            register(definition, generateFn) {
                this.definition = definition;
                this.generate = generateFn;
            }
        }
    },
    Date
};
vm.runInNewContext(fs.readFileSync(generatorPath, 'utf8'), context);

const generate = context.window.MTB.generate;
assert.equal(typeof generate, 'function', 'el generador PCC no se registró');

function baseInputs(overrides = {}) {
    return {
        recursive_routes: 'no',
        wan_count: '2',
        lan_match_type: 'in-interface',
        lan_interface: 'bridge-lan',
        lan_interface_list: 'LAN',
        lan_address_list: 'PCC-Clients',
        lan_network: '192.168.88.0/24',
        extra_connected_networks: '',
        hotspot_compatibility: 'no',
        hotspot_interface: 'bridge-hotspot',
        pcc_type: 'both-addresses-and-ports',
        wan1_interface: 'ether1',
        wan1_gateway: '192.168.1.1',
        wan1_network: '192.168.1.0/24',
        wan2_interface: 'ether2',
        wan2_gateway: '192.168.2.1',
        wan2_network: '192.168.2.0/24',
        ...overrides
    };
}

function assertIncludes(script, snippet, message) {
    assert.ok(script.includes(snippet), message || `no se encontró: ${snippet}`);
}

function assertNotIncludes(script, snippet, message) {
    assert.ok(!script.includes(snippet), message || `no debería existir: ${snippet}`);
}

let passed = 0;
function test(name, fn) {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
}

test('v7 genera tablas FIB, PCC 2/0 y 2/1, y NAT por WAN', () => {
    const script = generate(baseInputs(), 'v7');
    assertIncludes(script, '/routing table add name=to_ether1 fib');
    assertIncludes(script, '/routing table add name=to_ether2 fib');
    assertIncludes(script, 'per-connection-classifier=both-addresses-and-ports:2/0');
    assertIncludes(script, 'per-connection-classifier=both-addresses-and-ports:2/1');
    assertIncludes(script, 'routing-table=to_ether1');
    assertIncludes(script, 'new-routing-mark=to_ether1');
    assertIncludes(script, 'add chain=srcnat out-interface=ether1 action=masquerade');
    assertIncludes(script, 'add chain=srcnat out-interface=ether2 action=masquerade');
});

test('v6 usa routing-mark y no crea /routing table', () => {
    const script = generate(baseInputs(), 'v6');
    assertNotIncludes(script, '/routing table add');
    assertNotIncludes(script, 'routing-table=to_ether1');
    assertIncludes(script, 'routing-mark=to_ether1');
    assertIncludes(script, 'routing-mark=to_ether2');
});

test('usa el prefijo WAN indicado y no inventa un /24 del gateway', () => {
    const script = generate(baseInputs({
        wan1_gateway: '203.0.113.129',
        wan1_network: '203.0.113.128/30',
        wan2_network: ''
    }), 'v7');
    assertIncludes(script, 'add address=203.0.113.128/30 list=connected-networks');
    assertNotIncludes(script, '203.0.113.0/24');
    assertIncludes(script, '# WAN2: sin prefijo CIDR');
});

test('PCC y mark-routing excluyen destinos connected-networks', () => {
    const script = generate(baseInputs(), 'v7');
    assertIncludes(script, 'dst-address-list=!connected-networks connection-mark=no-mark per-connection-classifier');
    assertIncludes(script, 'dst-address-list=!connected-networks action=mark-routing');
});

test('marca conexiones entrantes en prerouting con connection-state=new', () => {
    const script = generate(baseInputs(), 'v7');
    assertIncludes(script, 'chain=prerouting in-interface=ether1 connection-state=new connection-mark=no-mark action=mark-connection');
    assertIncludes(script, 'chain=prerouting in-interface=ether2 connection-state=new connection-mark=no-mark action=mark-connection');
});

test('incluye PCC en output para tráfico iniciado por el router', () => {
    const script = generate(baseInputs(), 'v7');
    assertIncludes(script, 'chain=output connection-state=new dst-address-type=!local');
    assertIncludes(script, 'chain=output connection-mark=ether1_conn dst-address-list=!connected-networks action=mark-routing');
});

test('Hotspot en otra interfaz aplica PCC a clientes autenticados', () => {
    const script = generate(baseInputs({ hotspot_compatibility: 'yes' }), 'v7');
    assertIncludes(script, 'in-interface=bridge-hotspot hotspot=!auth action=accept');
    assertIncludes(script, 'in-interface=bridge-hotspot hotspot=auth connection-state=new');
    assertIncludes(script, 'in-interface=bridge-hotspot hotspot=auth connection-mark=ether1_conn');
});

test('Hotspot en la misma interfaz LAN no duplica reglas PCC', () => {
    const script = generate(baseInputs({
        hotspot_compatibility: 'yes',
        hotspot_interface: 'bridge-lan'
    }), 'v7');
    assertIncludes(script, 'hotspot=!auth action=accept');
    assertNotIncludes(script, 'hotspot=auth connection-state=new');
});

test('rutas recursivas v7 usan probe@main y excluyen probes del PCC de output', () => {
    const script = generate(baseInputs({
        recursive_routes: 'yes',
        ping_host1: '8.8.8.8',
        ping_host2: '1.1.1.1'
    }), 'v7');
    assertIncludes(script, 'add address=8.8.8.8 list=pcc-probes');
    assertIncludes(script, 'add chain=output dst-address-list=pcc-probes action=accept');
    assertIncludes(script, 'dst-address=8.8.8.8/32 gateway=192.168.1.1%ether1 scope=10');
    assertIncludes(script, 'gateway=8.8.8.8@main');
    assertIncludes(script, 'target-scope=11');
});

test('hosts de monitoreo duplicados no generan script ejecutable', () => {
    const script = generate(baseInputs({
        recursive_routes: 'yes',
        ping_host1: '8.8.8.8',
        ping_host2: '8.8.8.8'
    }), 'v7');
    assertIncludes(script, '# ERROR: no se generó un script RouterOS ejecutable');
    assertIncludes(script, 'está repetido');
    assertNotIncludes(script, 'per-connection-classifier=');
});

test('3 WANs generan restos 0, 1 y 2', () => {
    const script = generate(baseInputs({
        wan_count: '3',
        wan3_interface: 'ether3',
        wan3_gateway: '192.168.3.1',
        wan3_network: '192.168.3.0/24'
    }), 'v7');
    assertIncludes(script, 'both-addresses-and-ports:3/0');
    assertIncludes(script, 'both-addresses-and-ports:3/1');
    assertIncludes(script, 'both-addresses-and-ports:3/2');
});

test('agrega redes extra a connected-networks', () => {
    const script = generate(baseInputs({
        extra_connected_networks: '10.10.10.0/24, 172.16.0.0/12'
    }), 'v7');
    assertIncludes(script, 'add address=10.10.10.0/24 list=connected-networks');
    assertIncludes(script, 'add address=172.16.0.0/12 list=connected-networks');
});

test('es idempotente y protege FastTrack sin mutar reglas ajenas', () => {
    const script = generate(baseInputs(), 'v7');
    assertIncludes(script, '/ip firewall mangle remove [find where comment~"^MTB-PCC"]');
    assertIncludes(script, '/ip route remove [find where comment~"^MTB-PCC"]');
    assertIncludes(script, 'action=fasttrack-connection');
    assertIncludes(script, 'connection-mark=!no-mark action=accept');
    assertNotIncludes(script, '/ip firewall filter set $ftId connection-mark=no-mark');
});

test('reutiliza tablas v7 existentes activando fib', () => {
    const script = generate(baseInputs(), 'v7');
    assertIncludes(script, '/routing table add name=to_ether1 fib');
    assertIncludes(script, '/routing table set [/routing table find where name="to_ether1"] fib=yes');
    assertIncludes(script, '/routing table set [/routing table find where name="to_ether2"] fib=yes');
});

test('ata el gateway IPv4 a su interfaz para evitar WANs con subredes solapadas', () => {
    const script = generate(baseInputs(), 'v7');
    assertIncludes(script, 'gateway=192.168.1.1%ether1@main');
    assertIncludes(script, 'gateway=192.168.2.1%ether2@main');
});

test('rechaza CIDR LAN inválido', () => {
    const script = generate(baseInputs({ lan_network: '192.168.88.0' }), 'v7');
    assertIncludes(script, '# ERROR:');
    assertIncludes(script, 'red LAN');
});

test('definición incluye 4 pasos de Wizard con requisitos indispensables y checklist', () => {
    const def = context.window.MTB.definition;
    assert.ok(Array.isArray(def.steps), 'def.steps debe ser un array');
    assert.equal(def.steps.length, 4, 'debe tener exactamente 4 pasos de Wizard');

    const [s1, s2, s3, s4] = def.steps;
    assert.equal(s1.step, 1);
    assert.ok(s1.requirementTitle.includes('Requisito Indispensable'));
    assert.ok(s1.requirementText.includes('Add Default Route'));

    assert.equal(s2.step, 2);
    assert.ok(s2.requirementTitle.includes('Exclusión de Tráfico Local'));

    assert.equal(s3.step, 3);
    assert.ok(s3.requirementTitle.includes('FastTrack Bypass'));

    assert.equal(s4.step, 4);
    assert.equal(s4.isChecklist, true);
    assert.ok(s4.checklistItems.length >= 4, 'debe contener al menos 4 ítems de checklist');
    assert.ok(s4.verificationCommands.length >= 3, 'debe contener comandos de verificación');
});

console.log(`\n${passed} pruebas PCC OK`);

