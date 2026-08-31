# ADR-0019 · Adapter Hik-Connect for Teams (HCT) bajo contrato Integra

## Status
Accepted / implemented — 2026-08-29

## Context
El contrato de producto Integra (cámaras, puertas, personas, eventos, vehículos, stream) hoy está implementado sobre **HikCentral Professional Artemis**.
Algunos sitios de cliente solo tienen **Hik-Connect for Teams (HCT OpenAPI)** — cloud, sin Artemis on-prem. El video HCT no es RTSP LAN puro: suele ir por **EZUIKit / HLS cloud**, distinto del pipeline go2rtc←Artemis.

## Decision
1. Mantener la **API Nest `/api/integra/*` y la UI** como contrato estable.
2. `IntegraSite.provider` = `ARTEMIS` | `HCT` | `ISAPI` (default `ARTEMIS`). Credenciales cifradas en la misma fila; **no** mezclar providers en un site.
3. Adapter HCT (`apps/api/src/hikvision-hct/`):
   - health / token
   - sync espejo: cameras, doors, devices
   - stream: `streamtoken` → payload EZUIKit (sin go2rtc)
   - open door remoto documentado
4. Operaciones Artemis-only (people CRUD, privilege, vehicles, ANPR, visitas, playback Artemis) responden 400 claro en sitios HCT.
5. ISAPI / DeviceGateway como tercer provider para sitios sin HikCentral ni HCT.
   **Implementado 31-08-2026** — `apps/api/src/hikvision-isapi/`, ver
   [INTEGRA-LAN](INTEGRA-LAN.md). Digest MD5 contra cada equipo; el grabador es
   el equipo cabecera y sus canales son el inventario de video (única vía para
   las cámaras en plug & play). Sin personas/vehículos/ANPR: 400, como HCT.

## Consequences
- UI Video tolera `provider: HCT` (note + token; no asume HLS go2rtc).
- Sync mirror válido para ambos providers; IDs externos viven en `*IndexCode` / ids HCT mapeados.
- Rate limits y licenciamiento HCT: ver [INTEGRA-OPS](INTEGRA-OPS.md).
- ISAPI obliga a que **go2rtc corra dentro de la LAN** del sitio: el droplet no
  tiene ruta al RTSP de los equipos. Ver [INTEGRA-LAN](INTEGRA-LAN.md).

## Refs
- Skill `hikvision-api`, ADR-0017/0018, plan Absolute Upgrade P4.
