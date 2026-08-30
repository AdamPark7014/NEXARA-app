# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Integra Professional SOC (olas A+B+C)

**Ola A — Trust**
- Door control: motivo obligatorio + modal confirm (Ops + Accesos); API `reason` en audit.
- `canControlDoors` en capabilities (cliente = false).
- `IntegraAlarmAck` + cola `GET alarms/queue` + ack/clear; UI Alarmas SOC.
- Página `/integra/audit`; módulos Plano + Auditoría en matrix.
- Cliente: page-matrix sin settings/audit; mapa permitido.

**Ola B — Live**
- SSE `GET integra/events/stream` (poll bridge 4s).
- `IntegraDoor.regionIndexCode` + sync drain/prune; tree por código.
- PlaybackJump ±30s; video wall layouts 1/4/9; tiles live en Ops.

**Ola C — Context**
- Floorplans + pins (`/integra/map`).
- EZUIKit player HCT.
- Visitors inbox (`visitors/search`).
- Settings muestra último SyncRun + error.

## A medias
- Deploy prod pendiente en este cierre.

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS

## Siguiente paso
1. Deploy `--force-all` + hard-refresh.
2. Validar Artemis alarm IDs estables y EZUIKit allowlist en `integra.nexara.com.mx`.

## Estado
- Listo para cerrar + deploy.
