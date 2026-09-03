# ADR-0021 · Alta automática de la caja on-site

## Status
Accepted / implemented — 2026-09-02

## Context

[ADR-0020](ADR-0020-integra-dial-home.md) fijó que un sitio `ISAPI` se alcanza
con una caja on-site que marca hacia afuera, y
[INTEGRA-LAN-ENLACE](INTEGRA-LAN-ENLACE.md) describe cómo montarla: generar un
par de claves WireGuard a mano, editar `/etc/wireguard/wg0.conf` en el servidor,
añadir el peer, reiniciar la interfaz.

Eso funciona para el primer sitio. Para el décimo es una lista de pasos manuales
sobre un archivo de producción, con un `systemctl restart` que afecta a los nueve
sitios anteriores cada vez que entra uno nuevo. Es el punto donde la instalación
deja de ser un producto y pasa a ser un servicio artesanal.

El modelo de referencia es el de un tótem de estacionamiento: el instalador lo
conecta a la luz y a la red, lo enciende, y el equipo se da de alta solo contra
la nube del fabricante. Nadie edita configuración por cada plaza.

## Decision

### 1. La caja se da de alta sola, con un token de un solo uso

Desde la consola se emite un token por sitio (`POST /api/integra/sites/:id/edge/token`).
Se muestra **una vez**: en la base solo queda su `sha256`. El instalador
(`GET /api/integra/edge/install.sh`) se ejecuta con ese token en la caja:

```
curl -fsSL https://<api>/api/integra/edge/install.sh | sudo bash -s -- <token>
```

La caja genera su propio par de claves —la privada **nunca** sale de ahí—,
manda la pública a `POST /api/integra/edge/enroll`, y recibe su IP del túnel,
la clave pública del servidor, el endpoint y un token permanente de agente.
Escribe `wg0.conf`, levanta el túnel, arranca go2rtc y queda latiendo.

Re-emitir el token invalida al agente anterior: si una caja se pierde o el token
se filtra, se corta desde la consola sin entrar a ningún equipo.

### 2. La API declara peers; el anfitrión los aplica

La API corre en un contenedor y **no** es root en el anfitrión. Solo escribe el
peer en `integra_edge_agents`. Un reconciliador (`deploy/edge/wg-reconcile.sh`,
timer de systemd cada minuto) lee `GET /api/integra/edge/peers` y aplica
`wg set` — altas, cambios de IP y bajas.

Se prefiere a darle capacidades de red al contenedor o a un sidecar
privilegiado: la superficie que se expone es una lista de claves públicas, y si
el reconciliador se cae, los túneles ya establecidos siguen funcionando.

`wg set` no reinicia la interfaz, así que dar de alta el sitio número diez no
interrumpe a los otros nueve.

### 3. `AllowedIPs` es siempre la red del túnel, nunca la LAN del cliente

El servidor habla con la caja (`10.77.0.x`, única por sitio) y la caja habla con
los equipos. Es la recomendación de INTEGRA-LAN-ENLACE, aquí impuesta por
código: el valor no es configurable por sitio y hay una prueba que lo fija.

Sin esto, el sitio número tres rompe: `192.168.1.0/24` es el default de medio
México y en cuanto dos clientes lo comparten, el servidor no puede decidir a qué
peer enrutar.

### 4. Latido cada minuto

La caja reporta versión, error y última sincronización. Sin latido en cinco
minutos, la consola la marca fuera de línea. El agente distingue dos averías que
de otro modo son silenciosas: túnel arriba **sin handshake reciente**, y go2rtc
caído.

## Consequences

- Dar de alta una sucursal es emitir un token y correr una línea en la caja.
  Nadie edita `wg0.conf`, y el alta no interrumpe a los sitios existentes.
- La clave privada de cada sitio vive solo en su caja. El servidor nunca la ve,
  así que un volcado de la base no compromete ningún túnel.
- Revocar es inmediato en la API y tarda hasta un minuto en la interfaz.
- **Falta la pata del inventario.** La caja hoy levanta el túnel y sirve video;
  el `integra:isapi:sync` sigue corriendo a mano desde dentro de la LAN. Con
  `AllowedIPs = /32` el cron del servidor no alcanza los equipos, así que el
  siguiente paso es que el agente haga el barrido local y empuje el espejo
  (`POST /api/integra/edge/mirror`). Está deliberadamente fuera de este ADR.
- El `/24` del túnel da para 253 sitios. Ampliarlo es cambiar
  `INTEGRA_EDGE_WG_SUBNET`; las IPs ya asignadas no se mueven.

## Refs
- ADR-0019 (HCT), ADR-0020 (dial-home y por qué no HikGateway en este servidor).
- [INTEGRA-LAN-ENLACE](INTEGRA-LAN-ENLACE.md) — topología y qué caja comprar.
