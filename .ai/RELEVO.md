# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-08
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Barrido de paridad web ⇄ Android ⇄ iOS

Adam: «las aplicaciones están disparejas … hay muchas funciones que tenemos en
web y en las apps no». Seis agentes en paralelo con propiedad exclusiva de
ficheros, sobre una **medición** en vez de sobre la matriz escrita a mano.

### El hallazgo que ordenó todo lo demás

**La app iOS nunca se había compilado.** 45.000 líneas de Swift y el único flujo
que tocaba ese código era `ios-testflight.yml`, que exige seis secretos de Apple
inexistentes hasta que termine el alta. Compilar **no necesita cuenta de
Apple**: con SDK de simulador y firma desactivada, `xcodebuild` verifica igual.
Ya es un trabajo de CI que corre en cada push.

Consecuencias que salieron al mirar:

| Fallo | Estado |
|---|---|
| `ActivityParse` y `MapPin` declarados dos veces | corregido |
| 27 ficheros con APIs de iOS 17 y objetivo en 16.0 | mínimo subido a iOS 17 |
| Llave de más en `PortalScreens.swift` (cerraba el `struct`) | corregido |
| 3 `toUserMessage("…")` sin etiqueta `fallback:` | corregidos |

### Medición (`scripts/parity-report.py`, 08-09-2026)

| | web | Android | iOS |
|---|---|---|---|
| Endpoints consumidos | 235 | 361 | 413 |

Huecos: **46** la web y ninguna app · **12** Android sin iOS · **64 iOS sin
Android** ← deuda abierta.

### Herramientas nuevas (esto es lo que queda, más que el código)

- `scripts/parity-report.py` — paridad medida desde el código, no declarada.
- `scripts/ios-static-check.py` — sin Mac: redeclaraciones, balance de
  delimitadores (respeta cadenas, interpolación y comentarios anidados) y
  **claves de catálogo sin caso en el router**.
- `ConsoleWiringTest.kt` (Android, 8 pruebas) — el hermano de
  `IntegraWiringTest` que la consola no tenía, y es donde vive la mayoría de
  módulos. Obligó a sacar `ConsoleModuleKeys.HANDLED` fuera del composable.
- CI: trabajos `ios-estructura` (ubuntu) e `ios` (macos-15, compila simulador).

### Verificado

- `ios-static-check.py` limpio: 221 ficheros, 824 tipos, 160 claves, 0 huérfanas.
- Android: `assembleDebug test` **BUILD SUCCESSFUL**, 0 fallos.
- `typecheck:api` y `typecheck:web` limpios.
- **iOS sigue sin pasar por `xcodebuild`**: el primer CI en macOS dirá la verdad.

### Dos bugs de la web que nunca han funcionado

- `crm/leads/[id]` pedía `sales/leads/:id`; no existe `@Controller('sales')`.
  404 siempre. Corregido a `ventas/leads/:id`.
- STUDIO pedía `newsletter/stats`, inexistente, dentro de un `allSettled`:
  fallaba en silencio. Implementado devolviendo **solo** lo que la tabla sabe
  (total, altas 30 días, última). Sin `activeSubscribers` ni campañas: no hay
  marca de baja ni modelo de campañas.

## Decisiones que esperan a Adam

1. **Android ya publicó `journal-entries/{id}/post` y `POST journal-entries`**
   —contabilizar y dar de alta asientos— y siguen vivas en Google Play
   (`ExtraApi.kt:948-951`). Es de la zona sin autorizar. **No se han retirado**:
   quitar funcionalidad publicada es decisión suya.
2. **Aprobar órdenes de compra** desde el móvil quedó activo; **aprobar multas**
   quedó fuera (se descuenta de la nómina del trabajador).
3. **Mínimo iOS 17** (iPhone XS en adelante). Volver a 16 exige reescribir 27
   ficheros.
4. La lista completa de escrituras sin autorizar está en
   `docs/native-parity-matrix.md`.

## Siguiente paso natural

**Pasada de Android para los 64 endpoints en los que iOS va por delante**
(contabilidad, evidencias de actividad, usuarios, ventas). Sin eso, las dos
tiendas no reciben lo mismo. El agente de Android dejó además una lista de
fichas que sí son de móvil y no entraron: `maintenance/work-orders/:id`,
`viatics/:id`, `fines/:id`, `tenders/:id`, `sales-targets/performance`,
`service-clients/:id/snapshot`, `workflow/instances/:id`.

## Heredado vivo

- Demo store: `play.review@nexara.com.mx`; creds en `C:\dev\secrets\nexara-store\`.
- **Contraseña del revisor rotada el 07-09 con la app en revisión** — sin cerrar.
- Enrollment Apple `49J96Q3WQ3` — esperando correo/pago.
- Rotar contraseñas de cámaras (fuga de go2rtc cerrada, exposición pasada no).

## No tocar

Puente NAS. Credenciales Apple. No fingir EN VIVO en INTEGRA. Contraseña del
revisor fuera de git. **No marcar `NATIVO` lo que solo lista.**
