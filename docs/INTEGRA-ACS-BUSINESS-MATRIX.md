# Matriz ACS ↔ negocio (homologación)

Tabla de enrutado que implementa `IntegraEventRouterService`
(`POST/GET /api/integra/event-router/*`). Los siblings de ingest/UI/Ops
llaman `route()`; no duplicar lógica de clasificación en otro módulo.

Puente LAN: NAS `192.168.9.32` (no cambiar). Fuente de eventos: push
`AccessControllerEvent` (major=5). Sin inventar Face ID ni rutas ISAPI
no verificadas.

## Casos

| Caso | Condición ACS | Destino negocio | Estado glue |
|------|---------------|-----------------|-------------|
| **Entrada empleado** | Concedido + puerta general/otra + persona con vínculo ERP | `Attendance` tipo `entrada` + presencia Ops (`integra:ops-presence`) | **E2E** |
| **Salida** | Concedido + minor 76 **o** ya estaba en sitio | Cierra presencia Ops; `Attendance` `salida` si hay jornada abierta | **E2E** |
| **Visita** | Concedido + `userType=visitor` (o sin ERP en Sala Juntas) | Audit `acs.visitor.arrived` + aviso al host de reserva si existe | Parcial (CRM lead requiere vínculo) |
| **Denegado** | major=5 + minor denegado | Alarma operativa (notif alta + audit); no inventa ticket OPS automático | **E2E** |
| **Sala juntas** | Concedido + puerta meeting | Audit `acs.meeting.usage` (+ nota en `IntegraRoomBooking` activa) | **E2E** |
| **Gerencia / privados** | Concedido + puerta restringida | **Solo** `AuditLog` (`acs.restricted.access`) — sin asistencia ni CRM | **E2E** |
| **Primer acceso del día** | Primera concesión del día (persona) | Notif opcional al host de reserva (`INTEGRA_HOST_NOTIFY=1`) | Opcional |

## Prioridad de rutas (misma persona, mismo evento)

1. `denied` → alarma (corta el resto de escrituras de negocio).
2. Puerta restringida → solo audit.
3. Puerta meeting → uso de sala (+ visita si aplica).
4. Empleado vinculado → entrada/salida + presencia.
5. Primer acceso → notif host (si flag).

Ops→actividad del día (check-in en OT) es ownership de sibling distinto;
este router emite presencia para que Ops/UI se enganchen sin acoplar nómina.

## Flags

| Env | Default | Efecto |
|-----|---------|--------|
| `INTEGRA_EVENT_ROUTER` | `1` | `0` desactiva enrutado en ingest |
| `INTEGRA_ACS_ATTENDANCE` | `1` | Escribe checador ERP desde ACS |
| `INTEGRA_HOST_NOTIFY` | `0` | Notifica host en primer acceso |

## API para siblings

- `GET /api/integra/event-router/matrix` — esta tabla (JSON).
- `POST /api/integra/event-router/route` — replay / prueba con payload normalizado.
- `GET /api/integra/event-router/recent` — últimos enrutados (ring buffer).

Hook automático: tras `IntegraPushService.ingest` en eventos ACS.
