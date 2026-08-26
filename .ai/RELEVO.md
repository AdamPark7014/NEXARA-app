# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-26
- **Rama:** seo-serp-favicon

## Hecho en este turno
- **Sitio público nexara.com.mx:** mejora UI en rutas principales y landings SEO.
- Nav: Proyectos + Cobertura en header/footer; CTA header oculto en `/contacto`.
- CTAs unificados a **«Cotiza tu proyecto»** (home, servicios, soluciones, proyectos,
  nosotros, cobertura, landings `[industry]`, `[service]`, blog, qa).
- Nosotros: `ctaBand` + enlace a `/proyectos`; Contacto: errores de envío visibles.
- Proyectos: cards con acciones; slug Educación corregido.
- `SeoInterlinkHub` en soluciones y cobertura; regiones cobertura clicables.
- Home: enlaces a casos de campo en hero e industrias.
- `C:\dev\AGENTS.md` — arranque relevo predeterminado para `C:\dev\apps`.

## A medias — CUIDADO
- nada

## Siguiente paso
1. Deploy web en producción (`deploy/update.sh --force-all` o push + rebuild).
2. Migración pendiente en API (otro bloque de trabajo):
   `apps/api/prisma/migrations/20260826100000_cotizacion_supplier_warehouse/`
3. Adam da OK explícito para deploy API con migrate.

## No tocar
- `apps/web/app/(subdomains)/tickets/layout.tsx` — el `<Suspense>` mantiene el build.
- `NEXARA-credenciales-usuarios-v4.xlsx` — fuera de git a propósito.
