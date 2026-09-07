# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-07
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Auditoría: paridad iOS NO está fuerte

Adam preguntó si la paridad se había implementado «muy fuertemente» en Apple
porque pronto se sube. **Respuesta: no.** La paridad fuerte de estos días está
en Android. En iOS lo que hay listo es el **pipeline** de TestFlight (turno
claude-code), no el producto al nivel Android.

Revisión de solo lectura: 0 ficheros Swift modificados. Canvas:
`canvases/ios-parity-audit.canvas.tsx` (fuera del repo app).

### Hechos medidos en disco

| Métrica | Android | iOS |
|---|---|---|
| Ficheros | 282 `.kt` | 131 `.swift` |
| INTEGRA UI+data | 76 `.kt` | **0** (cero menciones «integra» en Swift) |
| `PanelId.INTEGRA` | sí | **no** (solo erp/crm/ops/studio/lab/portal) |
| Módulos INTEGRA catálogo | **21** cableados | **0** |
| Catálogo total | 133 (98 NATIVO / 35 SOLO_LECTURA) | 113 (todo `nativeImplemented=true` por defecto) |
| `check-app-web-parity.py` | sí | **no lee** `ModuleCatalog.swift` |
| `xcodebuild` | N/A | **nunca** corrido sobre estos 131 Swift |

### Brechas que importan para App Store

1. **INTEGRA = 0 % en iOS.** Los 21 módulos Android (acceso…dashboard) no
   existen. Publicar TestFlight hoy = ERP/CRM/OPS/Portal/Studio/Lab sin ACS.
2. **Catálogo «todo verde».** iOS no tiene `ParityStatus`; el default es nativo.
   Es exactamente el riesgo que ya se rechazó en Android.
3. **RBAC viejo.** `PanelAccessResolver.swift` sigue con `role.contains("rh")`
   / `ingenier` — Android ya pasó a `RolePanelMatrix` por igualdad exacta.
4. **Huecos fuera de INTEGRA.** `reuniones` ausente; `chat` y `smart-quote`
   tienen UI/router pero **no** están en el catálogo (mismo patrón huérfano).
5. **Errores crudos.** `ApiClient` iOS expone `HTTP \(code)`; no hay
   `toUserMessage()`.
6. **Pipeline ≠ binario.** `PUBLICAR-SIN-MAC.md` + Actions están; la primera
   compilación real probablemente falle — por eso `subir=false`.

### Decisión que necesita Adam

Antes de TestFlight, elegir alcance v1 iOS:

- **A)** Publicar sin INTEGRA, catálogo honesto (bajar a SOLO_LECTURA / ocultar
  lo ausente), copy de App Store que no prometa ACS.
- **B)** Portar INTEGRA mínimo (acceso / personas / eventos) antes de subir.
- **C)** Esperar paridad fuerte completa (21 módulos + redes) — semanas, no días.

## Turno anterior — iOS publicable sin Mac (claude-code)

Flujo GitHub Actions → TestFlight sin Mac física. Runbook:
`apps/mobile-native/ios/PUBLICAR-SIN-MAC.md`.

Correcciones: `INFOPLIST_FILE` (no regenerar plist), entitlements APNs
dev/prod, `schemes:` para XcodeGen, Firebase fuera (no hay `import Firebase`).
Disparador del workflow **manual** a propósito (repo público).

Trámites solo Adam: Developer Program, API key ASC, cert distribución, app en
ASC, seis secretos.

## Turno anterior — INTEGRA Android a 21 + paridad cerrada

Commits `df749076`…`f441d53f` / `9fc966db`: NavHost cableado, profundidad de
los 10 vivos, mapa/dashboard SOLO_LECTURA a propósito, catálogo sin mentir,
`IntegraWiringTest`. Verificado: compile OK · 401 tests · parity script OK.

Recortes dichosos (Android): video sin «EN VIVO»; polígonos detección RO;
pines mapa RO; alarmas con confirmación.

## A medias / decisiones de Adam

0. **Alcance v1 iOS** (A/B/C arriba) — bloquea el mensaje de App Store.
1. **Cinco trámites Apple** del playbook (sigue pendiente).
2. **P0 go2rtc** expuesto con RTSP en claro — desplegar Traefik → 404 → rotar.
3. **Data Safety** Play desactualizado.
4. **Datos históricos** comida/GPS — solo Adam decide limpia.
5. Contradicción AAB versionCode 5 vs 7 en relevos previos — Adam confirma Play.

## Abierto

- Portar INTEGRA / RolePanelMatrix / ParityStatus / toUserMessage a iOS.
- Extender `check-app-web-parity.py` a Swift.
- MFA, refresh sesión, `X-Company-Id`, `?_nxt=`, `DELETE push-token`.
- Primer `xcodebuild` con `subir=false`.

## No tocar

Puente NAS. Traefik/credenciales sin permiso. Face ID óptico inventado.
Provider ISAPI. No inventar ANPR/FieldDetection en PTZ .179. No hls.js CDN.
No fingir «EN VIVO». No marcar NATIVO en iOS lo que no escribe.
