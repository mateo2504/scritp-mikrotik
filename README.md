# MikroTik Script Builder 🚀
Un generador interactivo y visual de scripts avanzados y optimizados para **MikroTik RouterOS v6 & v7**. Esta herramienta ayuda a los administradores de redes a generar configuraciones robustas de forma rápida y sin errores de sintaxis.

Diseñado con una interfaz moderna, responsive, en modo oscuro y con efectos visuales premium.

---

## 🌟 Características y Módulos

El configurador está dividido en categorías clave que cubren la administración profesional de equipos MikroTik:

### 🛣️ Enrutamiento Avanzado
* **Balanceo PCC (Múltiples WAN)**: Distribuye el tráfico equitativamente entre 2 y 5 líneas de Internet.
* **Failover Recursivo**: Monitoreo inteligente mediante Ping a hosts externos (ej: Google DNS) con conmutación automática.
* **Policy Based Routing (PBR)**: Ruteo por políticas para desviar tráfico específico (IPs, interfaces, puertos) por una WAN dedicada (soporta Mangle y Routing Rules en v7).

### 🏠 Red Local (LAN)
* **Servidor DHCP + Reservas**: Configuración de DHCP pools con amarres estáticos de IP por dirección MAC.
* **VLAN sobre Bridge (v7)**: Configuración recomendada para segmentación de redes locales con filtrado VLAN por hardware.

### 🛡️ Seguridad, Firewall y NAT
* **Firewall Básico**: Reglas de filtrado esenciales y seguras para proteger el router y los clientes de la LAN.
* **Redirección de Puertos (DST-NAT)**: Apertura y mapeo de puertos hacia servidores o cámaras locales.
* **Hairpin NAT (Loopback)**: Resuelve el acceso a servicios locales desde la red interna usando la IP pública.
* **Anti Brute-Force**: Bloqueo dinámico por etapas de IPs que intentan accesos no autorizados a servicios del router.
* **Blocklist desde URL**: Descarga y actualización periódica de listas de IPs maliciosas y spammers.
* **Port Knocking**: Mecanismo de seguridad para abrir puertos de administración únicamente tras una secuencia secreta de llamadas.
* **Bloqueo Layer 7**: Reglas regex para bloquear torrents, descargas o contenido no deseado.

### 📊 Control de Tráfico y QoS
* **Colas Simples (Simple Queues)**: Control básico de ancho de banda por IP o subred.
* **QoS Avanzado (Queue Tree + PCQ)**: Priorización por servicio (VoIP, DNS, Gaming, Video, Streaming, Redes Sociales, Normal y Bulk) con reparto equitativo.
* **Generador de Ráfagas (Rate-Limit)**: Calculadora dedicada para generar la cadena exacta de ráfagas (ej: `2M/10M 4M/20M 1.5M/8M 16/16 8 1M/5M`) usada en perfiles PPPoE, Secrets y Hotspot.
* **Priorización por Address-List**: Priorización de clientes VIP sobre el resto de la red.
* **CAKE / SQM (Anti-Bufferbloat)**: Cola avanzada en RouterOS v7 para mantener baja la latencia incluso con la red saturada.

### 🔒 VPNs y Servicios
* **Servidor VPN WireGuard (v7)**: Túnel VPN ultrarrápido y moderno.
* **Cliente VPN WireGuard**: Enruta el tráfico de tu LAN a través de un proveedor VPN comercial.
* **Túneles Site-to-Site (IPsec / EoIP / GRE)**: Interconexión de oficinas o sucursales de capa 2 o capa 3.
* **Servidor PPPoE**: Autenticación punto a punto para clientes de red local.
* **Hotspot (Portal Cautivo)**: Autenticación de usuarios por tiempo y perfiles para redes WiFi públicas o de invitados.

### 🛰️ Operación y Monitoreo
* **Alertas por Email y Telegram**: Recibe notificaciones automáticas ante fallas de enlaces, logins, etc.
* **Auto-Update**: Script para actualizar automáticamente RouterOS de forma segura con backup previo.
* **NTP y Zona Horaria**: Sincronización horaria exacta en el equipo.
* **Monitoreo SNMP**: Configuración de comunidades SNMP v2c y v3 para sistemas de monitoreo como Zabbix o PRTG.

---

## 🛠️ Arquitectura Técnica

El proyecto está diseñado bajo un enfoque modular y extremadamente ligero:
* **Frontend**: HTML5 semántico, lógica en JavaScript puro (Vanilla JS) y hojas de estilo CSS3 personalizadas.
* **Sin Dependencias**: No requiere frameworks complejos ni bases de datos. Se ejecuta enteramente del lado del cliente.
* **Generadores Autónomos**: Cada herramienta de script está desacoplada en la carpeta `js/generators/<key>.js`. Se registra dinámicamente en el core de la aplicación utilizando:
  ```javascript
  window.MTB.register(definition, generateFunction);
  ```

---

## 🚀 Cómo Ejecutar el Proyecto

### Localmente (Simple)
Al ser una aplicación web estática, simplemente descarga o clona el repositorio y abre el archivo `index.html` en tu navegador web favorito:
```bash
double-click index.html
```

### Ejecutar con Docker 🐳
El proyecto incluye un entorno preconfigurado en un servidor web ultraligero (Nginx Alpine).

1. **Construir la imagen de Docker**:
   ```bash
   docker build -t mikrotik-script-builder .
   ```

2. **Iniciar el contenedor**:
   ```bash
   docker run -d -p 8080:80 --name mt-builder mikrotik-script-builder
   ```

3. **Acceder a la aplicación**:
   Abre tu navegador e ingresa a `http://localhost:8080`.

---

## 📝 Licencia
Este proyecto es de código abierto. Siéntete libre de adaptarlo, mejorarlo y agregar nuevos generadores para la comunidad.
