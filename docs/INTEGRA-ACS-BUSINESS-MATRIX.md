# Matriz ACS ↔ negocio (homologación)

Tabla de enrutado que implementa `IntegraEventRouterService`
(`POST/GET /api/integra/event-router/*`). Los siblings de ingest/UI/Ops
llaman `route()` / `onPushEvent`; no duplicar lógica de clasificación en
otro módulo.

Puente LAN: NAS `192.168.9.32` (no cambiar). Fuente de eventos: push
`AccessControllerEvent` (major=5). Sin inventar Face ID ni rutas ISAPI
no verificadas.

## Casos

| Caso | Condición ACS | Destino negocio | Estado glue |
|------|---------------|-----------------|-------------|
| **Ops actividad** | Concedido/denegado Acceso General + `employeeNumber` en OT del día | `AcsOpsBridgeService` (check-in / salida / notif) | **E2E** |
| **Denegado → alarma** | major=5 + minor denegado | `IntegraAcsAlarmsService` → `integra_soc_alarms` (+ ticket si umbral) | **E2E** |
| **Entrada/salida ERP** | Empleado vinculado | Stub: **no** escribe `Attendance` (hybrid es lectura) | Stub |
| **Visita / sala / gerencia / host** | Según puerta + userType | Audit stub (`acs.*`) | Stub |
| **Presencia «en sitio»** | Deducción de push | Lectura vía `IntegraPresenceService` | Lectura |

## Prioridad de rutas (misma persona, mismo evento)

1. `denied` → alarma SOC + ops_activity (notif).
2. Puerta restringida → solo audit (+ ops_activity).
3. Puerta meeting → uso de sala (+ visita si aplica).
4. Empleado vinculado → flags entrada/salida (stub nómina) + ops.
5. Primer acceso → notif host (stub/audit si flag).

## Flags

| Env | Default | Efecto |
|-----|---------|--------|
| `INTEGRA_EVENT_ROUTER` | `1` | `0` desactiva enrutado en ingest |
| `ACS_OPS_BRIDGE` | `1` | Sellos Ops en OT |
| `ACS_OPS_NOTIFY_DENIED` | `1` | Notif Ops en denegado |
| `INTEGRA_HOST_NOTIFY` | `0` | Reservado (stub) |

## API para siblings

- `GET /api/integra/event-router/matrix` — esta tabla (JSON).
- `POST /api/integra/event-router/route` — dry-run / prueba con payload normalizado.
- `GET /api/integra/event-router/recent` — últimos enrutados (ring buffer).

Hook automático: tras `IntegraPushService.ingest` en eventos ACS.
