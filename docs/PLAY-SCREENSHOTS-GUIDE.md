# Guía de capturas para Play Store — NEXARA Android

Carpeta de salida: `apps/mobile-native/play-assets/screenshots/phone/`

## Automatización completa (recomendado)

```powershell
# 1. Provisionar cuenta demo (una vez)
cd apps/api
npm run seed:play-reviewer
# Copia la contraseña que imprime el script

# 2. Variables de entorno (sesión actual)
$env:PLAY_REVIEWER_EMAIL = "play.review@nexara.com.mx"
$env:PLAY_REVIEWER_PASSWORD = "..."   # la del seed

# 3. Emulador + build + login + 8 capturas
npm run mobile:android:preview      # si no tienes emulador corriendo
npm run mobile:android:screenshots
```

El script `scripts/capture-play-screenshots.ps1`:

- Compila **debug** apuntando a API de producción (`-PSCREENSHOT_API=true`)
- Prepara la app (`nexara://debug/screenshot-prep`: onboarding OK, sin app lock)
- Auto-login en debug (`nexara://debug/auto-login?email=...&password=...`)
- Navega por **deep link** a cada pantalla y guarda PNG

### Capturas generadas

| Archivo | Deep link |
|---------|-----------|
| `01-ventas-dashboard.png` | `nexara://ventas/dashboard` |
| `02-smart-quote.png` | `nexara://ventas/smart-quote` |
| `03-chat.png` | `nexara://erp/chat` |
| `04-actividades.png` | `nexara://operacion/activities` |
| `05-tickets.png` | `nexara://portal/tickets` |
| `06-notificaciones.png` | `nexara://erp/notifications-center` |
| `07-mapa-gps.png` | `nexara://operacion/gps` |
| `08-selector-paneles.png` | `nexara://panels` |

### Flags útiles

```powershell
# Ya logueado — solo capturar
npm run mobile:android:screenshots -- -SkipBuild -SkipLogin

# Ver rutas sin capturar
npm run mobile:android:screenshots -- -ManualOnly

# Más tiempo de carga entre pantallas (red lenta)
npm run mobile:android:screenshots -- -NavWaitSec 8
```

---

## Requisitos Play Store

- Mínimo **2** capturas, hasta **8**; PNG o JPEG
- Lado corto ≥ 320 px, lado largo ≤ 3840 px
- Recomendado: **1080×1920** portrait (el script ajusta `wm size` y `density`)

---

## Preparar entorno manual

### Emulador

```bash
npm run mobile:android:preview
```

### Resolución consistente

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb shell wm size 1080x1920
& $adb shell wm density 420
```

### Captura manual (una pantalla)

```powershell
$adb exec-out screencap -p > apps\mobile-native\play-assets\screenshots\phone\01-ventas-dashboard.png
```

---

## Subir a Play Console

1. Play Console → tu app → **Ficha de Play Store** → **Gráficos**
2. **Capturas de pantalla de teléfono** → sube los PNG de `screenshots/phone/`
3. Orden sugerido: ventas → smart quote → chat → actividades → tickets → notificaciones → GPS → paneles

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| `adb: device offline` | `adb kill-server && adb start-server`; reinicia emulador |
| Login falla en auto-login | Verifica `PLAY_REVIEWER_*`; vuelve a correr `seed:play-reviewer` |
| Pantalla de login en capturas | Aumenta `-NavWaitSec` o revisa credenciales |
| Smart Quote vacío | Normal si el catálogo demo no tiene productos; la UI del wizard sigue siendo válida |
| Mapa en blanco | API key Maps con SHA-1 de debug en Google Cloud Console |

---

Ver también: [`PLAY-STORE-LISTING.md`](./PLAY-STORE-LISTING.md)
