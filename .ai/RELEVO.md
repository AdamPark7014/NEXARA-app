# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-23
- **Rama:** claude/web-publica-premium = mejora/calidad-y-web (fcfeaeb8), desplegada en nexara.com.mx
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

## Segunda pasada, merge y deploy (23-09, tarde)
- Nosotros reescrito en el nuevo sistema (datos operativos sobre el hero, split con foto real,
  principios como tarjetas, banda navy "En campo", equipo, certificaciones). Mapa de Contacto en
  claro. Foco visible homogéneo. Header, hero y footer alineados a 1320 px.
- El servidor tenía commits propios en `mejora/calidad-y-web` (nav en caja normal, HomeHero sin
  brillos, mapa por Maps Embed, footer "Acceso", cookies "Solo necesarias" primero). Se trajeron
  con `git fetch ssh://root@5.78.215.109:2222/var/www/nexara-app HEAD`, se mergearon aquí
  (`fcfeaeb8`, conservando el DS claro y el header alineado) y se hizo `git push origin
  HEAD:mejora/calidad-y-web` (fast-forward). No existe rama `dev`; esa es la rama que despliega.
- Deploy hecho: `./deploy/update.sh --force-all --with-migrate` (log `/root/deploy-web-premium-20260923-2148.log`).
  Build web en intento 1 con revisión de tipos; sin migraciones pendientes; `nexara-web` y
  `nexara-api` arriba. nexara.com.mx sirve el diseño nuevo (fotos reales 200, tarjeta de cifras).

## A medias / pendiente
- **Studio en producción** guarda `heroDesktopUrl` de Soluciones (`/images/hero/hero-03.png`) y
  Contacto (`/images/hero/hero-01.png`): cambiarlos desde Studio o vaciarlos para que tomen los
  defaults nuevos. Sus slots ya tienen fotos reales.
- `case-studies/public` y `projects` vacíos en producción: Proyectos muestra galería fija y
  referencias por vertical hasta que se publiquen casos desde Studio.
- `main` sigue en `756d66e8`: no se tocó. Si Adam quiere `main` al día, es un fast-forward de
  `mejora/calidad-y-web`.
- Disco del servidor al 85 %.

## Ojo (no es mío)
- El dev server de Cursor (pid 41580) murió a media tarde; levanté el mío con la entrada
  `nexara-web` de `C:\dev\.claude\launch.json` (mismo checkout, puerto 3000).
- `nexara_review_demo.mp4` en la raíz está sin trackear desde antes; no lo toqué.
- `apps/web/app/(public)/.ai/` (índice de Ollama) se borró antes del commit.

## No tocar
Puente NAS · keystore Play · `NO TOCAR LIBREMENTE`.
