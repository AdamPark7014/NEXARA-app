# ADR-0020 · Dial-home para sitios Integra, y por qué no en el servidor actual

## Status
Accepted — 2026-08-31

## Context

Integra alcanza los equipos de un cliente de tres formas (ADR-0017/0019). Dos de
ellas exigen que **el servidor entre** a la red del cliente:

- `ARTEMIS` — HikCentral on-premise, alcanzable desde fuera.
- `ISAPI` — equipos en LAN pura. Necesita túnel y una caja on-site
  ([INTEGRA-LAN-ENLACE](INTEGRA-LAN-ENLACE.md)), ~1,500–4,500 MXN **por sitio**.

La alternativa es invertir la dirección: que **el equipo llame hacia afuera** y
mantenga la conexión abierta. Sin puerto entrante, sin IP fija, sin VPN. Es lo
que hace Hik-Connect, y lo que Hikvision documenta como
«la opción recomendada para dispositivos con IP dinámica o detrás de NAT»
(ISUP/EHome).

Hay dos maneras de tener dial-home:

| | Dónde marca el equipo | Infraestructura propia |
|---|---|---|
| **HCT** | nube de Hikvision | ninguna |
| **HikGateway** | un gateway tuyo | un servidor Linux |

## Decision

### 1. HCT es la vía por defecto para sitios sin HikCentral

Ya está implementado (ADR-0019) y desplegado. Cuesta cero infraestructura y cero
hardware en sitio. `INTEGRA_HIK_*` está vacío en producción: lo único que falta
es el App Key del portal HCT.

`ISAPI` + caja on-site queda para el cliente que **exige** que el video no salga
de su edificio. Ahí el fierro es argumento de venta, no costo hundido.

### 2. HikGateway, si se adopta, va en un VPS propio — nunca en el servidor actual

Medido el 31-08-2026 sobre `5.78.215.109`:

- `traefik-main` ocupa **80 y 443** y sirve **40 dominios de siete negocios**
  (nexara.com.mx y ~25 subdominios, acrobat.mx, artaproducciones.com,
  zynoratek.com, experiencebt.com.mx, delpozodelvalle.com, udlagora.com).
- El servidor tiene **una sola IPv4** (`5.78.215.109/32`). No hay dónde poner un
  segundo juego de 80/443.
- HikGateway reclama 80, 443, 554, 7660–7667 y 15000–17000.
- El gateway soporta CentOS 7, Ubuntu 20.04 o RHEL 9; el servidor es
  **Ubuntu 24.04**.

**Mover Traefik de puerto no es una opción.** Los navegadores van a 80/443: los
40 dominios dejarían de responder. Y Let's Encrypt valida por el **puerto 80**,
así que los certificados dejarían de renovarse y en semanas todos esos sitios
mostrarían advertencia de seguridad. Sería una caída de negocios de terceros
ajenos a NEXARA.

Un VPS chico (~€5/mes) con IP propia resuelve las cuatro cosas a la vez. Y es
**uno para toda la operación, no uno por cliente**: a partir del segundo sitio
sale más barato que las cajas on-site.

### 3. Ese servidor no es de NEXARA

Hospeda 28 contenedores de ~10 proyectos. Cualquier cambio de puertos, firewall
o disco se evalúa contra esa realidad, no contra NEXARA sola. Ya obligó a liberar
caché de build antes de un despliegue (estaba al 84%).

## Consequences

- Onboarding de un sitio nuevo, en orden de preferencia:
  1. **HCT** — App Key y listo. Sin fierro, sin túnel.
  2. **ISAPI + caja** — cuando el cliente exige on-premise.
  3. **HikGateway** — cuando exige dial-home *y* que no toque la nube de
     Hikvision. Requiere el VPS y decidir el licenciamiento.
- El cuarto provider (`GATEWAY`) **no se implementa todavía**: sin gateway real
  no hay contra qué verificarlo, y el costo de licencia está sin cotizar. La
  documentación local (`HIKVISION-apps/docs/API-DOCS/HIKVISION/HikGateway/`)
  tiene la referencia completa cuando toque.
- Sigue pendiente: el servidor **no tiene firewall de host** (`ufw` inactivo,
  `iptables INPUT` en `ACCEPT`). Con 28 contenedores de producción encima, es
  una revisión aparte y prioritaria.

## Refs
ADR-0017, ADR-0019, [INTEGRA-LAN](INTEGRA-LAN.md),
[INTEGRA-LAN-ENLACE](INTEGRA-LAN-ENLACE.md).
