# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-07
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — iOS al nivel Android (5 agentes) + cuenta demo en prod

### A) Cuenta revisor App Store / Play — LISTA EN PRODUCCIÓN

- Seeder `seed-play-reviewer` corrido en `nexara-api` (Hetzner).
- Login verificado `POST https://api.nexara.com.mx/api/auth/login` → 200.
- Usuario: `play.review@nexara.com.mx` · nombre «Revisor App Store / Google Play»
- Tenant: `nexara-demo` (id=2), MFA off, rol ceo del demo.
- Credenciales: `C:\dev\secrets\nexara-store\reviewer-credentials.txt` (NO en git).
- Doc: `docs/STORE-REVIEWER-ACCOUNT.md`.

### B) Paridad iOS — ejército de 5 agentes + cableado

Commits: `57df20f5` (rescate WIP agentes) + este cierre.

| Agente | Entregable |
|---|---|
| Fundación | `PanelId.integra`, `ParityStatus`, `RolePanelMatrix`, `PanelAccessResolver` sin contains, `ModulePanelMap` 21 keys, catálogo con 21 INTEGRA + honestidad, `ApiErrors.toUserMessage` |
| Data | `Data/Integra/*` (8 repos) |
| Core UI | Home…Sites + `IntegraRootView` |
| Advanced UI | video (sin EN VIVO), vehicles/ANPR, schedules, detection RO polígonos, governance, map/dashboard RO |
| Orphans | `MeetingsRepository` + `MeetingsView` (lista completa de asistentes), router reuniones/chat/smart-quote |

Cableado parent: `NexaraApp` monta `IntegraRootView`; `ModuleRouter` caso `.integra`.

### Conteos disco (aprox.)

- `UI/Integra/`: 32 Swift
- `Data/Integra/`: 8 Swift
- Catálogo iOS ahora incluye integra + chat/reuniones/smart-quote

### Honestidad (igual Android)

- Video = preview/PTZ/captura, **sin «EN VIVO»**
- Detección: polígonos solo lectura
- Mapa: sin escritura de pines
- Catálogo: map/dashboard `soloLectura`

### Lo que NO está verificado

**Ningún `xcodebuild`.** Primera compilación CI con `subir=false` va a fallar; ciclo de arreglos previsto.

## Cuando Apple active la membresía (Enrollment `49J96Q3WQ3`)

Orden (runbook `apps/mobile-native/ios/PUBLICAR-SIN-MAC.md`):

1. Completar pago cuando llegue el correo.
2. Portal: Team ID, App ID `mx.nexara.mobile.NexaraApp` + Push, subir `.csr` → `.cer`, API key ASC `.p8`, alta app.
3. `crear-certificado.ps1 -Paso p12` + `subir-secretos.ps1` (tras `gh auth login`).
4. `gh workflow run ios-testflight.yml --repo AdamPark7014/NEXARA-app -f version=1.0.0 -f subir=false`
5. Arreglar Swift hasta verde → `subir=true` → TestFlight.
6. Fase 5 tienda: capturas + demo account (`play.review@…`) + decidir App Store público vs Custom Apps ABM.

## A medias / Adam

0. Esperar correo Apple + pago (vía org, D-U-N-S ya ok).
1. `gh auth login`.
2. P0 go2rtc Traefik prod.
3. Primero `xcodebuild` CI.

## No tocar

Puente NAS. Credenciales Apple/tarjeta. No fingir EN VIVO. No meter password del revisor en el git.
