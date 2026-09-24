# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-23
- **Rama:** claude/web-publica-premium = mejora/calidad-y-web (f8616092), desplegada en nexara.com.mx
- **Checkout:** `C:\Users\adpoz\Projects\NEXARA-app` (el que sirve localhost:3000). `C:\dev\apps\NEXARA-app` sigue en `main`.

## Hecho

### Sitio público embebible desde zynoratek.com (23-09, tarde)
`apps/web/middleware.ts`: el host apex (`nexara.com.mx` / `www`) responde con
`Content-Security-Policy: frame-ancestors 'self' https://zynoratek.com https://*.zynoratek.com`
y sin `X-Frame-Options`, para que zynoratek.com/proyectos muestre la portada en un iframe.
Los paneles (core., admin, etc.) siguen con `frame-ancestors 'none'` + `DENY`. `next.config.js`
no se tocó: el middleware sobrescribe la CSP (en producción solo se ve la del middleware).
Deploy: `deploy/update.sh` en `/var/www/nexara-app` (rebuild de `nexara-web`).


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

## Tercera ronda (23-09, 16:00-16:25): mapa, cifras, colores
- **Mapa gris en Contacto y footer (causa raíz):** la CSP no declaraba `frame-src` (caía en
  `default-src 'self'`) y el header `Cross-Origin-Embedder-Policy: credentialless` bloqueaba
  cualquier iframe externo; nada usa SharedArrayBuffer, se retiró. Además la clave
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` NO tiene habilitada Maps Embed API (Google responde «not
  authorized») y el embed sin clave contesta `X-Frame-Options: SAMEORIGIN`. Nueva ruta
  `apps/web/app/mapa/proveedor/route.ts` (probar Google desde el servidor, caché 1 h, si no →
  OpenStreetMap) y hook `useMapProvider` usado por `Map.tsx` y `Footer.tsx`. Hoy sirve OSM;
  cuando Adam habilite Maps Embed API en la clave, cambia solo a Google.
- **Cifras:** ya no se montan sobre el hero ni el video; franja blanca (`.statsBand`) debajo.
- **Colores homologados:** un solo color de acción (cian de marca) en botones primarios y CTA
  del header; sin morados; WhatsApp de Contacto dentro del sistema; radios 8/12/16.
- Footer: columnas Sitio/Capacidades/Cobertura alineadas arriba.
- Se integró el commit `1c913ec9` de otra sesión (frame-ancestors para zynoratek.com) que
  llegó a `mejora/calidad-y-web` en paralelo; ojo: hay más de un agente sobre esa rama.
- Deploys 2 y 3 hechos (`update.sh --force-all --with-migrate`, build web en intento 1 con
  tipos). Producción verificada: `frame-src` presente, sin COEP, sin violaciones CSP en vivo,
  iframes OSM cargando, cifras a ras del hero, CTA del header cian, columnas del footer alineadas.

## Cuarta ronda (23-09, 16:25-16:40): jerarquía de color tonal, cifras discretas, mapa al sitio
- Adam: «de repente es muy claro y luego mega oscuro… no hay jerarquía de colores premium».
  El cuerpo pasó de claro a un **sistema tonal navy continuo** (hero, cuerpo y footer en la
  misma familia): `--ds-bg #070f1e`, `--ds-bg-alt #0a1628`, `--ds-surface #0e1a30`,
  `--ds-surface-2 #132340`; jerarquía por capas y líneas finas. Todos los módulos públicos
  quedaron en tokens `--ds-*` (sin hex claros fijos): cambiar el tema es tocar un bloque.
- Cifras (+10, +200, Puebla·CDMX, <24 h): fila discreta `.factsInline` dentro de «Una sola
  firma del diagnóstico al soporte»; la franja se eliminó (inner pages conservan su fila de
  tiles como parte de la primera sección, sin fondo).
- Mapa: OpenStreetMap llevado al navy con `filter: invert(0.92) hue-rotate(185deg)…` en
  Contacto y footer; botón «Cómo llegar» → https://maps.app.goo.gl/uJBZyNeAApgAri536 (también en
  la tarjeta de Contacto y en el footer).
- Deploy 4 hecho y verificado en producción (fondo tonal, cifras inline, mapa filtrado, CTA).

## Quinta ronda (23-09, 16:40-17:10): mapa de marca vectorial (brief "Design Director")
- **Qué:** el iframe de OpenStreetMap con filtro CSS salía café. Se reemplazó por un mapa
  vectorial renderizado en el sitio: `apps/web/app/components/BrandMap.tsx` con **MapLibre GL 5
  (variante CSP)** y el estilo `positron` de **OpenFreeMap** (`https://tiles.openfreemap.org`),
  repintado al cargar con la paleta `--ds-*` (fondo navy, agua azul profundo, calles azul-gris,
  principales más luminosas, edificios sutiles, etiquetas gris, POIs ocultos). Pin propio cian con
  halo; CTA «Cómo llegar» (sistema de botones del sitio) → https://maps.app.goo.gl/uJBZyNeAApgAri536.
- **Por qué no Google:** la clave web no tiene Maps Embed API ni facturación (JS API), y el embed
  sin clave devuelve X-Frame-Options SAMEORIGIN. No se inventaron credenciales.
- **Composición:** Contacto ahora es editorial (copy, dirección, visitas, cobertura y CTAs a la
  izquierda; mapa 4:3 a la derecha; apila en ≤980 px). Footer: `BrandMap compact`.
- **Configuración requerida:** ninguna clave. El worker vive en
  `apps/web/public/maplibre-gl-csp-worker.js` (la CSP no permite `blob:`); al actualizar
  `maplibre-gl` hay que volver a copiarlo desde `node_modules/maplibre-gl/dist/`. CSP: `frame-src`
  añadido y COEP retirado (ronda 3); `connect-src/img-src/font-src https:` ya cubren OpenFreeMap.
- **Carga:** MapLibre se importa dinámicamente cuando el mapa se acerca al viewport (no pesa en el
  First Load de ninguna página). Sin WebGL → tarjeta con la dirección (fallback).
- **Archivos:** `BrandMap.tsx` (nuevo), `Map.tsx`, `Map.module.css` (reescrito), `Footer.tsx`,
  `Footer.module.css`, `contacto/ContactoClient.tsx`, `contacto/page.module.css`,
  `lib/maplibre-csp.d.ts` (nuevo), `public/maplibre-gl-csp-worker.js` (nuevo), `package.json`,
  `package-lock.json`. Eliminados: `app/mapa/proveedor/route.ts`, `useMapProvider.ts`.
- **Comandos:** `npm install maplibre-gl@^5 -w apps/web` · `npx tsc --noEmit -p apps/web/tsconfig.json`
  (limpio) · `npm test --workspace=apps/web` (597 ok, 1 falla previa en `recursos-core.spec.ts`,
  ver «Ojo») · `npm run build --workspace=apps/web` (intento 1 con tipos, OK) · auditoría DOM a
  1440/1280/1024/768/430/390/375 sin desbordes y con CTA visible. No hay eslint config en web
  (ESLint 10 exige flat config): lint no ejecutado.
- **Limitaciones:** el navegador integrado de Claude Code no tiene WebGL (ahí siempre cae al
  fallback); se verificó el render real en Chrome. Teselas OpenFreeMap = servicio comunitario sin
  SLA; si algún día se quiere Google, habilitar Maps Embed API o facturación en la clave.

## Sexta ronda (23-09, 17:10-18:20): jerarquía por capas y tema claro/oscuro
- **Capas con propósito (Tier 1-5):** base navy → superficie (`.sectionAlt`, `.sectionNavy` sin
  brillo morado) → **una capa editorial de contraste por página** (`.sectionLight`: en tema oscuro
  es clara; en tema claro es navy) → CTA band siempre navy. Home: «Por qué NEXARA»; Servicios:
  certificaciones; Proyectos: referencias por vertical; Nosotros: principios; Contacto: formulario.
- **Menos tarjeta, más composición:** pasos (`.stepItemOpen`), principios e industrias pasan a
  composición abierta con regla superior y numerales grandes; se quitaron los iconos repetidos de
  los pasos. Radios de una familia (8/12/16/pill), botón secundario dirigido por tokens.
- **Tema claro/oscuro:** `<html data-public-theme>` lo fija un script inline en `app/layout.tsx`
  (localStorage `nexara:public-theme` → si no, `prefers-color-scheme`; por defecto oscuro).
  Conmutador `components/PublicThemeToggle.tsx` en header (junto al CTA) y footer (fila legal).
  Tokens claros en `public.module.css` (`html[data-public-theme="light"] .page`), header claro al
  hacer scroll (`Header.module.css`), mapa con paleta clara (`BrandMap` escucha el evento
  `nexara:public-theme`). Hero, header sobre hero y footer siguen oscuros en ambos temas.
- Verificado en local, ambos temas, 5 páginas: sin contraste < 3 salvo WhatsApp verde, header
  claro con texto navy al hacer scroll, persistencia entre páginas. Ojo: en el navegador
  integrado las transiciones se congelan (pestaña oculta): para medir estilos tras cambiar el tema
  hay que inyectar `*{transition:none}`; si no, los valores calculados salen viejos.

## A medias / pendiente
- **Google Maps:** habilitar «Maps Embed API» en la clave web (Google Cloud Console) para que
  el mapa vuelva a ser de Google; hoy es OpenStreetMap.
- **Adam sigue pidiendo más pulido "premium":** no pude ver capturas (el panel se cuelga);
  pedirle capturas concretas de lo que no le convence.
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
