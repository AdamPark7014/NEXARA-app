# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-23
- **Rama:** claude/web-publica-premium (creada sobre `cursor/public-site-doctrine-b26c` @ 5cc5f126, PR #39)
- **Checkout:** `C:\Users\adpoz\Projects\NEXARA-app` (el que sirve localhost:3000). `C:\dev\apps\NEXARA-app` sigue en `main`.

## Hecho

### Sitio público: rediseño "premium tipo ETEK" (Adam rechazó el PR #39 tal cual)
Diagnóstico: el sitio usaba las mismas 3 imágenes `/images/hero/hero-0x.png` (fotos de Puebla con
tinte verde horneado) en Inicio/Servicios, Proyectos salía vacío (APIs de casos devuelven `[]`
también en producción) y `public/example` traía fotos de banco (una mujer con perro). Adam pidió
referencia ETEK: cuerpo claro, tarjetas con icono, cifras, fotos reales.

- `apps/web/app/(public)/_shared/public.module.css` reescrito: tokens claros, bandas navy
  (`.sectionNavy`, `.ctaBand`), `.statsCard` que monta sobre el hero, `.iconCard`, `.split`,
  `.mosaic`, `.gallery`, `.caseCard`, `.industryCard`. Todas las clases históricas se conservan
  (Nosotros, Cobertura, Soluciones, Contacto, Blog las usan).
- Nuevo `app/components/PublicIcon.tsx` (iconos SVG inline).
- Reescritas `nexara/page.tsx` (Inicio), `servicios/page.tsx`, `proyectos/page.tsx` y
  `nexara/home-sections.module.css`.
- Fotos reales: 13 JPEG bajadas del Studio de producción a `apps/web/public/fotos/` (racks,
  torniquetes con reconocimiento facial, video wall, antenas, equipo). `resolvePageMediaUrl`
  acepta `/fotos/`; `DEFAULT_PAGE_VISUALS`, blog, cobertura, Nexara-Ingenieros, soluciones/[industry]
  y `public-news` ya no usan los PNG tintados.
- Módulos de Nosotros, Cobertura, Contacto, Blog, landings y `EditorialImage`/`LogoStrip`
  retematizados a claro. `/qa` envuelto en `shared.page`.
- Header, hero (`PublicPageHero`, `HomeHero`) y footer alineados al mismo ancho que `.inner`
  (1320 px + padding). El hero deja 80 px extra abajo para la tarjeta de cifras (Adam vio los
  botones tapados). `HomeHero .dots` subidos por lo mismo.
- Borrado: `public/example/*`, `VisualEvidenceGrid`, `CinematicMosaic`, `FeatureStrip` (sin usos).
- Verificado: `npx tsc --noEmit` limpio (2 veces); auditoría DOM a 1536×791 y 390×844 en
  `/`, `/servicios`, `/proyectos`, `/nosotros`, `/contacto`, `/blog`, `/cobertura/puebla`,
  `/cobertura/puebla/camaras-cctv`, `/soluciones/retail`, `/soluciones/manufactura/camaras-cctv`,
  `/qa`: sin solapes, sin desborde horizontal, sin imágenes rotas, sin texto con contraste < 3
  (salvo el botón verde de WhatsApp, que ya existía).

## A medias / pendiente
- **Adam debe dar el visto bueno visual** (recarga fuerte en localhost:3000). Las capturas del
  navegador integrado se cuelgan en este sitio; la verificación fue por DOM.
- **Sin desplegar.** Cuando apruebe: merge de esta rama (incluye todo el PR #39 + estos cambios;
  ya no hace falta mergear el #39 por separado) y deploy al Hetzner desde la PC "Adam".
- **Studio en producción** guarda `heroDesktopUrl` de Soluciones (`/images/hero/hero-03.png`) y
  Contacto (`/images/hero/hero-01.png`): cambiarlos desde Studio o vaciarlos para que tomen los
  defaults nuevos. Sus slots ya tienen fotos reales.
- `case-studies/public` y `projects` vacíos en producción: Proyectos muestra galería fija y
  referencias por vertical hasta que se publiquen casos desde Studio.

## Ojo (no es mío)
- El dev server de Cursor (pid 41580) murió a media tarde; levanté el mío con la entrada
  `nexara-web` de `C:\dev\.claude\launch.json` (mismo checkout, puerto 3000).
- `nexara_review_demo.mp4` en la raíz está sin trackear desde antes; no lo toqué.
- `apps/web/app/(public)/.ai/` (índice de Ollama) se borró antes del commit.

## No tocar
Puente NAS · keystore Play · `NO TOCAR LIBREMENTE`.
