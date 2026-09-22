# RELEVO

- Último turno: cursor
- Fecha: 2026-09-22
- Rama: cursor/nexara-public-home-ux-7ae7

## Hecho

### Web pública NEXARA — ordenar home y navegación (sin vender paneles)
- Navegación compacta (5 ítems): Soluciones, Servicios, Proyectos, Cobertura, Contacto. Inicio vive en el logo; Nosotros queda en footer.
- Home enfocada en 4 capacidades (CCTV, Redes/Wi‑Fi, Infraestructura, Soporte). Se retira “Plataformas a medida” del bloque principal (queda sólo como oferta secundaria en footer).
- Cookie banner menos intrusivo: copy breve; botón primario “Solo necesarias”; secundario “Aceptar todas”; tamaños reducidos.
- Footer: acceso discreto a login mediante link “Acceso”.
- Build y typecheck web verificados: `npm run typecheck:web` y `npm run build:web` OK.

Rutas/archivos claves:
- `apps/web/components/Header.tsx`
- `apps/web/app/(public)/nexara/page.tsx`
- `apps/web/components/CookieConsentBanner.tsx` y `.module.css`
- `apps/web/app/components/Footer.tsx`

## A medias
- Nada pendiente de esta intervención.

## No tocar
Puente NAS · keystore Play · credenciales. `NO TOCAR LIBREMENTE`.
