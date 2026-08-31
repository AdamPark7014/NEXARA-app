# Play Store — assets gráficos NEXARA

Referencia de dimensiones y archivos requeridos para la ficha en [Google Play Console](https://play.google.com/console).

Textos y checklist operativo: [`docs/PLAY-STORE-LISTING.md`](../../../docs/PLAY-STORE-LISTING.md) · guía de capturas: [`docs/PLAY-SCREENSHOTS-GUIDE.md`](../../../docs/PLAY-SCREENSHOTS-GUIDE.md).

---

## Inventario actual

| Archivo | Dimensiones | Formato | Estado | Uso en Play Console |
|---|---|---|---|---|
| `icon-512.png` | **512 × 512 px** | PNG opaco (sin transparencia) | ✅ Presente | Icono de la aplicación en la ficha |
| `feature-graphic-1024x500.png` | **1024 × 500 px** | PNG o JPEG | ✅ Presente | Gráfico destacado (obligatorio) |
| `screenshots/phone/` | ver abajo | PNG o JPEG | ❌ Pendiente | Capturas de teléfono (mín. 2, máx. 8) |

---

## Requisitos por tipo de asset

### Icono de la ficha

| Propiedad | Valor |
|---|---|
| Tamaño | **512 × 512 px** |
| Formato | PNG de 32 bits, **fondo opaco** (Google rechaza transparencia en el icono de ficha) |
| Contenido | Mismo branding que el icono de launcher; sin texto promocional ni badges de “nuevo” |
| Archivo en repo | `icon-512.png` |

> **Los dos iconos tienen que ser la misma imagen.** El de 512 px va a la tienda y el del
> `mipmap` es el que se instala en el teléfono, pero Google los compara: si no coinciden,
> rechaza la app por *política de afirmaciones engañosas* (“la ficha no coincide con la
> aplicación”). Nos pasó el 31-08-2026.
>
> Por eso los genera el mismo script, desde `drawable/logo_nexara.png`:
>
> ```
> npm run mobile:android:icons
> ```
>
> Eso reescribe `icon-512.png`, los `mipmap-*/ic_launcher*.png` y los
> `drawable-*/ic_launcher_foreground.png`. **Si el 512 cambia, hay que volver a subirlo a
> Play Console**, o vuelven a divergir.
>
> Ojo con el `logo_nexara.png` de origen: el wordmark “NEXARA” es blanco, así que sobre
> fondo claro hay que recolorearlo (el script ya lo hace).

### Gráfico destacado (feature graphic)

| Propiedad | Valor |
|---|---|
| Tamaño | **1024 × 500 px** (relación ~2:1) |
| Formato | PNG o JPEG |
| Peso máximo | 15 MB (típicamente < 1 MB) |
| Contenido | Banner de marca; legible en móvil y en la web de Play. Evita texto pequeño en los bordes (recorte en algunas vistas) |
| Archivo en repo | `feature-graphic-1024x500.png` |

### Capturas de teléfono

| Propiedad | Valor |
|---|---|
| Cantidad | **Mínimo 2**, máximo **8** por tipo de dispositivo |
| Resolución recomendada | **1080 × 1920 px** (portrait) |
| Límites Play | Lado corto ≥ 320 px · lado largo ≤ 3840 px |
| Relación de aspecto | Entre **16:9** y **9:16** |
| Formato | PNG o JPEG |
| Carpeta en repo | `screenshots/phone/` |

#### Capturas sugeridas (5 principales + 3 opcionales)

| Archivo | Pantalla |
|---|---|
| `01-ventas-dashboard.png` | Ventas — Dashboard CRM |
| `02-smart-quote.png` | Cotizador inteligente |
| `03-chat.png` | Chat en tiempo real |
| `04-actividades.png` | Actividades (OPS) |
| `05-tickets.png` | Portal de tickets |
| `06-notificaciones.png` | Centro de notificaciones *(opcional)* |
| `07-mapa-gps.png` | Mapa / GPS en campo *(opcional)* |
| `08-selector-paneles.png` | Selector de paneles *(opcional)* |

Leyendas de marketing por captura: [`PLAY-STORE-LISTING.md` § Leyendas](../../../docs/PLAY-STORE-LISTING.md).

### Capturas de tablet *(opcional)*

| Propiedad | Valor |
|---|---|
| Cantidad | Hasta 8 |
| Resolución recomendada | **1200 × 1920 px** o **1600 × 2560 px** (portrait) |
| Carpeta sugerida | `screenshots/tablet/` |

No son obligatorias si la app no está optimizada para tablet como dispositivo principal.

### Video promocional *(opcional)*

| Propiedad | Valor |
|---|---|
| Fuente | URL de YouTube (pública o no listada) |
| Duración recomendada | 30–120 segundos |
| Contenido | Demo de login → panel Ventas → cotización → OPS; sin datos reales de clientes |

---

## Checklist antes de subir

- [ ] `icon-512.png` existe y mide exactamente 512 × 512 px, sin canal alpha.
- [ ] `feature-graphic-1024x500.png` existe y mide exactamente 1024 × 500 px.
- [ ] Al menos 2 capturas en `screenshots/phone/` con datos ficticios del tenant `nexara-demo`.
- [ ] Mismo tema visual (claro u oscuro) en todas las capturas.
- [ ] Sin credenciales, PII real ni marcas de terceros no autorizadas visibles.
- [ ] Nombres de archivo en minúsculas con guiones (`01-ventas-dashboard.png`).

---

## Verificación rápida de dimensiones

En PowerShell (desde la raíz del monorepo):

```powershell
Add-Type -AssemblyName System.Drawing
Get-ChildItem apps\mobile-native\play-assets\*.png | ForEach-Object {
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  "$($_.Name): $($img.Width)x$($img.Height)"
  $img.Dispose()
}
```

Salida esperada:

```
feature-graphic-1024x500.png: 1024x500
icon-512.png: 512x512
```

---

## Relación con el APK/AAB

| Asset de tienda | ¿Viene del build? |
|---|---|
| Icono 512, feature graphic, screenshots | **No** — se suben manualmente en Play Console |
| Icono de launcher (`mipmap-*`) | **Sí** — empaquetado en el AAB |

El icono es el único asset que vive en los dos lados a la vez: se genera una vez con
`npm run mobile:android:icons`, entra al AAB solo, y el 512 se sube a mano. Revisa que
sigan siendo iguales antes de cada envío a revisión.
| Gráfico de notificación, splash | **Sí** — recursos Android del proyecto |
