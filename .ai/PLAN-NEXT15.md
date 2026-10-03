# Plan: Next.js 14.2.35 → 15.5.x (web)

**Estado:** propuesta, **sin aplicar**. Falta el visto bueno de Adam.
**Por qué:** trivy (03-10-2026) marca 2 CRITICAL y 8 HIGH en `next@14.2.35`; las correcciones solo existen en 15.5.24+ y 16.3.3+.

## Exposición real hoy

| Hallazgo | ¿Nos pega? |
|---|---|
| GHSA-2xp9-vwfh-vxw4 (RCE en Image Optimization con AVIF) | No. `images.unoptimized: true` y `https://nexara.com.mx/_next/image?...` responde 404. |
| CVE-2026-75604 (RCE en servidores Windows) | No. Producción corre en Linux (Docker `node:22-slim`). |
| 8 HIGH restantes de `next` (bypass de middleware con i18n en Pages Router, etc.) | Ninguno se pudo confirmar contra nuestro uso (App Router, sin i18n de Next), pero no se revisaron uno por uno. |

No hay urgencia de producción, pero 14.x ya no recibe parches: cada auditoría va a sumar hallazgos nuevos.

## Destino recomendado: 15.5.x (no 16)

- 15.5 corrige todo lo que marca trivy y conserva el acceso síncrono a `params`/`cookies()` con aviso, así que se puede migrar por partes.
- 16 quita ese modo de compatibilidad, cambia `middleware.ts` por `proxy.ts` y usa Turbopack por defecto para el build. Nuestro middleware tiene ~650 líneas (subdominios, CSP, redirecciones): mejor como un segundo paso aparte.
- Versión: la última 15.5.x con al menos una semana publicada (hoy 15.5.27; la 15.5.24 tiene las correcciones).

## Qué cambia y cuánto nos toca (medido en el repo)

| Cambio en Next 15 / React 19 | Qué hay en `apps/web` | Trabajo |
|---|---|---|
| App Router exige **React 19** | `react`/`react-dom` 18.2.0; `@types/react` 18 | Subir los 4. MUI 7, Emotion, Recharts 3, Testing Library 16, react-easy-crop y react-phone-number-input ya aceptan React 19. |
| `params` / `searchParams` **asíncronos** en páginas, layouts, rutas y `generateMetadata` | **8 archivos de servidor** (login, layout de actividad, blog/[slug], cobertura/[city] y [service], soluciones/[industry] y [service], `ct-media/route.ts`) + 14 `generateMetadata` | Codemod `npx @next/codemod@latest next-async-request-api` y revisión a mano. Las 32 páginas cliente que usan `useParams`/`useSearchParams` no cambian. |
| `cookies()` / `headers()` asíncronos | 1 archivo (`(auth)/login/page.tsx`) | Lo cubre el codemod. |
| `fetch` del servidor **ya no se cachea por defecto**; las rutas GET tampoco | `lib/hero-*`, `page-content-api`, `public-news` ya fijan `revalidate`; `app/feed.xml/route.ts` y `ct-media` tienen opciones de caché | Revisar los `fetch` de servidor sin opción explícita en el sitio público (p. ej. Nosotros) y decidir `revalidate` por página. Los `lib/*-api.ts` del ERP corren en el navegador: no les afecta. |
| `swcMinify` se elimina | `next.config.js:14` | Borrar la línea. |
| Tipos de React 19 (`JSX` global, `useRef` sin argumento, `ReactElement` con props `unknown`, callbacks de ref) | 1 uso de `JSX.Element` global, 0 `useRef()` vacíos, 7 `forwardRef` (siguen funcionando) | Lo que diga `tsc`; estimado bajo. |
| Sass: sass-loader 16 con API moderna | 13 `.scss` | Revisar avisos de `@import`; no deberían romper. |
| Librería sin mantenimiento | `@react-pdf-viewer/core` está en `package.json` pero **ya no se importa** (solo un comentario en `VistaPrevia.tsx`) | Quitarla antes de subir: es la que más probabilidad tiene de chocar con React 19. |

## Pasos

1. Sin rama: todo en `main`, en commits chicos y sin desplegar hasta el final.
2. Quitar `@react-pdf-viewer/core`; quitar `swcMinify`.
3. `next@15.5.x`, `react@19`, `react-dom@19`, `@types/react@19`, `@types/react-dom@19`.
4. Codemod de APIs asíncronas; revisar los 8 archivos y los 14 `generateMetadata` a mano.
5. `tsc` web en 0; arreglar tipos de React 19.
6. Auditoría de caché del sitio público (qué páginas deben seguir estáticas o con `revalidate`).
7. Verificación: vitest web completo; `next build` (normal **y** `build:lowmem`, que es la variante que ignora tipos y ya dejó pasar errores); barrido headless de las rutas públicas (Inicio, Servicios, Proyectos, Contacto con el mapa, blog, landings de cobertura/soluciones) y del ERP (login, pizarra, actividad, cotizaciones con vista previa PDF, chat con socket, almacén) en claro/oscuro y a 1536/390 px.
8. Despliegue con `deploy/update.sh` y plan de vuelta atrás: el commit anterior queda anotado y la imagen previa del contenedor `web` no se borra hasta confirmar.

## Estimación

**1.5 a 2 días de trabajo enfocado (≈ 10–14 h)**: 1 h dependencias y codemod, 2–4 h tipos de React 19, 1–2 h caché del sitio público, 3–4 h verificación (build + barrido), 1 h despliegue y monitoreo. Puede crecer si aparece una librería incompatible con React 19 que no salió en el inventario.

## Riesgos

- **Hidratación:** React 19 es más estricto con diferencias servidor/cliente (fechas, `localStorage`, el script de tema). Errores que hoy son avisos pueden pintarse como errores.
- **Caché:** con el cambio de defaults, páginas públicas que eran estáticas pueden volverse dinámicas (más llamadas a la API por visita) o al revés. Se mide con la salida de `next build` (○ vs ƒ) antes y después.
- **Memoria del build en el servidor:** el build `lowmem` usa 1.5 GB de heap y el disco está al ~85 %; Next 15 puede necesitar más. Probar `build:lowmem` en local con el mismo límite antes de desplegar.
- **Apps nativas:** no dependen de Next, pero comparten la API; no hay cambio de contrato.
- **Trabajo en paralelo:** el rediseño v2 (Etapas 5–6) toca muchas páginas del ERP. Conviene migrar cuando esas etapas estén commiteadas, para que el codemod y los arreglos de tipos no choquen con archivos a medio editar.

## Fuera de este plan (HIGH que quedan tras el 03-10)

- `xlsx@0.18.5`: la versión corregida solo se publica en el CDN de SheetJS, no en npm. Hoy solo lee archivos que genera nuestra propia API (`ExcelDownloadModal`). Opción: tarball de `cdn.sheetjs.com` o cambiar a `exceljs`, que ya usa la API.
- `pdfjs-dist@3.11.174`: mitigado (`isEvalSupported: false` en `PDFViewer` y `VistaPrevia`). Pasar a 4.x/5.x pide Safari ≥ 17.4 por `Promise.withResolvers`.
- `basic-ftp@5.3.1`: el último HIGH pide 6.x (major); solo lo usa el conector FTP de CT.
- `node-forge@1.4.0`: sin versión corregida.
- `postcss`, `brace-expansion`, `braces`, `picomatch`, `glob`, `tmp`, `browserslist`, `js-yaml`: herramientas de build y pruebas, no corren en producción.
- `DS-0002` en los 3 Dockerfiles: los contenedores corren como root.
