# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-06
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Rescate del ejército paralelo INTEGRA + compilación verde

Siete agentes construyeron en paralelo paquetes nuevos (`ui/integra/{video,vehicles,schedules,detection,governance}` + data). El límite de sesión dejó WIP a medias. Cursor rescató, cerró huecos de compilación y dejó los contratos de cableado listos para Adam.

### Commits de este hilo

1. **`6eed0292`** — Rescate WIP del ejército (26 paths: data+UI de los 5 paquetes nuevos + paridad fuera de INTEGRA).
2. **`46e4f2d5`** — Fixes de compilación: `DetectionContract` (`const val`), Access unificado en `IntegraAccessScreen.kt`, `IntegraEspaciosScreen` + `IntegraMyProfileScreen`, `IntegraScreens` alineado al repo (`pushEvents`, attendance Instant, `RecurringResult`/`OccupancyResult`).
3. **Este cierre** — `online` de cámaras acepta Double Moshi (`1.0`); comentario `SchedulesRoutes` ↔ `onOpenSchedules`; RELEVO con contratos.

### Verificado

- `:app:compileDebugKotlin` OK
- Tests INTEGRA data: **125** (detection 31, vehicles 57, video 37) — 0 fallos
- **No se tocó** `IntegraNavHost.kt` ni `ModuleCatalog.kt` ni `ModulePanelMap.kt` (regla del ejército)

---

## INTEGRA móvil — estado real (corrige el 0 % del turno claude-code)

**No está al 0 %.** Ya hay 10 módulos vivos cableados en NavHost + ~9 paquetes nuevos sin cablear.

### Los 10 vivos (NavHost + catálogo)

| Clave | Ruta | Profundidad honesta |
|---|---|---|
| `integra-home` | `integra/home` | Hub de tarjetas |
| `integra-access` | `integra/access` | **NATIVO** — listado, live/mirror, control puerta con motivo (`IntegraAccessScreen`) |
| `integra-events` | `integra/events` | Lectura push events |
| `integra-people` | `integra/people` + detalle | **NATIVO** — CRUD, cara upload/delete |
| `integra-attendance` | `integra/attendance` | Lectura por rango Instant |
| `integra-visitors` | `integra/visitors` | Lectura + registro recurrente |
| `integra-alarms` | `integra/alarms` | Lectura + ack selección |
| `integra-occupancy` | `integra/occupancy` | Lectura `OccupancyResult` |
| `integra-devices` | `integra/devices` | Lectura equipos |
| `integra-sites` | `integra/sites` | Catálogo dice SOLO_LECTURA; el paquete detection trae Settings NATIVO sin cablear |

`PanelId.INTEGRA` ya existe. Arquitectura limpia (rutas / VM / repo). No hace falta cimientos.

### Paquetes nuevos listos — Adam cablea (NO tocar NavHost/Catalog desde agentes)

#### 1. Video — `IntegraVideoRoutes`

| | |
|---|---|
| Rutas | `integra/video`, `integra/video/{cameraId}` |
| Clave | `integra-video` |
| Pantallas | `IntegraVideoWallScreen`, `IntegraCameraDetailScreen` |
| Honestidad | Rejilla + preview autorregulada, PTZ presets, captura. **Sin badge «EN VIVO»**. No MSE/go2rtc WebSocket en móvil. |

#### 2. Vehículos / ANPR — `IntegraVehiclesRoutes` + `integraVehiclesGraph()`

| | |
|---|---|
| Rutas | `integra/vehicles`, `integra/anpr` |
| Claves | `integra-vehicles`, `integra-anpr` |
| Cableado | Una línea: `integraVehiclesGraph()` dentro del NavHost; `routeParaClave` / `tituloDe` |

#### 3. Horarios / Espacios — `SchedulesRoutes`

| | |
|---|---|
| Rutas | `integra/schedules`, `integra/espacios`, `integra/schedules/door/{doorId}` |
| Claves | `integra-schedules`, `integra-espacios` |
| Callback | `IntegraEspaciosScreen(onOpenSchedules = { … })` — **no** `onOpenSchedulesForDoor` |
| Door id | Codificar `|` con `schedulesForDoor()` / `decodeRouteArg` |

#### 4. Detección / Ajustes — `IntegraDetectionRoutes`

| | |
|---|---|
| Rutas | `integra/detection`, `…/camera/{id}`, `…/capabilities`, `integra/settings`, `…/new`, `…/site/{siteId}` |
| Claves | `integra-detection` (nueva), `integra-sites` (subir catálogo a NATIVO) |
| Honestidad | Polígonos de zona = **solo lectura** en móvil; resto escribe |

#### 5. Gobierno — `IntegraGovernanceRoutes`

| | |
|---|---|
| Rutas | `integra/audit`, `integra/notifications-center`, `integra/my-profile` |
| Claves | `integra-audit`, `integra-notifications`, `integra-my-profile` |
| Helpers | `rutaDeClave`, `tituloDeRuta` |

### Checklist cableado Adam (cuando lo haga)

1. `ModulePanelMap.INTEGRA_KEYS` — añadir las claves nuevas de arriba.
2. `ModuleCatalog.integra` — entradas + `parityStatus` honesto (sites → NATIVO si cablea Settings).
3. `IntegraNavHost` — composables + `integraRouteForKey` + títulos top bar.
4. Deep links opcionales en `DeepLinkParser`.

---

## A medias / decisiones de Adam (heredado + vivo)

1. **P0 SIN DESPLEGAR** — go2rtc streams expuestos con RTSP en claro. Traefik en rama; prod no cargó. Rotar passwords **después** del 404.
2. **Recompilar AAB** + confirmar `versionCode` en Play.
3. **Data Safety** desactualizado (Crashlytics vs Analytics).
4. **Datos históricos falsos** (comida/GPS) — sólo Adam decide limpia.
5. **Cablear NavHost/Catalog** de los 5 paquetes (este turno no lo tocó a propósito).
6. **Mapa + dashboard INTEGRA** — aún sin agente; lanzar cuando haya capacidad.
7. MFA móvil, refresh sesión, `X-Company-Id`, `DELETE push-token`, `?_nxt=` — siguen abiertos del informe 10/auditoría.

## No tocar

Puente NAS. Traefik/credenciales sin permiso. Face ID óptico inventado. Provider ISAPI. No inventar ANPR/FieldDetection en PTZ .179. No hls.js CDN. No fingir «EN VIVO» en preview. iOS fuera de v2.
