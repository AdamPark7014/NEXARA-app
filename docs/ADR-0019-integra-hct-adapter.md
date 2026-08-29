# ADR-0019 · Adapter Hik-Connect for Teams (HCT) bajo contrato Integra

## Status
Proposed / backlog P4 — 2026-08-29

## Context
El contrato de producto Integra (cámaras, puertas, personas, eventos, vehículos, stream) hoy está implementado sobre **HikCentral Professional Artemis**.
Algunos sitios de cliente solo tienen **Hik-Connect for Teams (HCT OpenAPI)** — cloud, sin Artemis on-prem. El video HCT no es RTSP LAN puro: suele ir por **EZUIKit / HLS cloud**, distinto del pipeline go2rtc←Artemis.

## Decision
1. Mantener la **API Nest `/api/integra/*` y la UI** como contrato estable.
2. Introducir un **adapter HCT** detrás de `IntegraSite` (campo futuro `provider: ARTEMIS | HCT`) que implemente el mismo surface:
   - list cameras/doors/people (mapeo a OpenAPI HCT)
   - stream: URL EZUIKit/HLS cloud (no go2rtc RTSP)
   - open door / events según endpoints HCT documentados
3. **No** mezclar credenciales HCT con Artemis en el mismo site row.
4. ISAPI / DeviceGateway queda como tercer provider para sitios sin HikCentral ni HCT.

## Non-goals (ahora)
- Implementar el cliente HCT en este PR (solo contrato + ADR).
- Skin / redistribuir Web Client Hikvision.

## Consequences
- UI Video debe tolerar `hls` cloud sin asumir go2rtc.
- Sync mirror sigue válido; IDs externos viven en `*IndexCode` / `personId` igual que Artemis.
- Licenciamiento y rate limits HCT son distintos — documentar en INTEGRA-OPS al implementar.

## Refs
- Skill `hikvision-api`, ADR-0017/0018, plan P4.
