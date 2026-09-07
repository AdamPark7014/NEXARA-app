# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-07
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Segunda ola de profundidad iOS (paridad real, no solo catálogo)

Adam: el catálogo ya emparejaba claves; el hueco era **LOC/operabilidad**
(~7.8k → **~10.2k** líneas INTEGRA iOS vs ~25k Android; app completa ~42k vs ~94k).

Tres agentes en paralelo + cableado settings:

| Agente | Qué profundizó |
|---|---|
| Core INTEGRA | Home summary vivo, Access live/mirror+página, Events cursor, People/Alarms/Visitors profundidad |
| Advanced INTEGRA | Video FramePacing, Vehicles/ANPR, Schedules/Espacios, Detection, Settings create/delete/sync, Gov, Map/Dashboard — **cero DataStub** |
| Consola no-INTEGRA | Evidencias multi-reject, viáticos/gastos «Marcar pagado», documentos approve, recruiting moveCv, settings api-keys |

Parent: `IntegraSettingsRepository.swift` (POST/PATCH/DELETE `integra/sites` + sync).

### Verificado

- Diff ~+3545/−870 en 37 archivos iOS
- Catálogo console/ventas/contabilidad/studio/integra: **mismas claves** que Android
- Honestidad intacta: sin EN VIVO, mapa RO, polígonos RO

### Aún falta (honesto)

1. **xcodebuild nunca corrido** — primera CI fallará.
2. INTEGRA iOS ~40 % LOC de Android — más pulido fino (agrupación alarmas, PTZ edge cases, fanout ACS UI).
3. MFA / refresh sesión / X-Company-Id en iOS (también abiertos en Android).
4. Apple enrollment + TestFlight pipeline (Adam).

## Heredado vivo

- Demo store: `play.review@nexara.com.mx` en prod; creds en `C:\dev\secrets\nexara-store\`.
- Enrollment Apple `49J96Q3WQ3` — esperar correo/pago.
- P0 go2rtc Traefik prod.

## No tocar

Puente NAS. Credenciales Apple. No fingir EN VIVO. Password revisor fuera del git.
