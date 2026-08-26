# RELEVO

- **Último turno:** cursor-agent
- **Fecha:** 2026-08-26
- **Rama:** seo-serp-favicon

## Hecho en este turno
- **498/498 tests en verde** — desbloqueado para deploy.
- `ActivitiesController` spec: mock de `DomainEventBusService` (DI faltante).
- `CompanyService.resolveForUser`: respeta empresa default del usuario sin
  auto-inscribir en la primaria cuando la app móvil no manda `X-Company-Id`.
- `normalizeItems`: clamp de `tax` cuando el payload trae porcentaje explícito
  (antes caía al default 16% de pricing aunque el input fuera negativo).
- Build web sigue verde; `/tickets*` estáticas con el `<Suspense>` previo.

## Siguiente paso
1. Adam da OK explícito → `deploy.sh` (corre migración Prisma en producción).
2. Migración pendiente:
   `apps/api/prisma/migrations/20260826100000_cotizacion_supplier_warehouse/`

## No tocar
- `apps/web/app/(subdomains)/tickets/layout.tsx` — el `<Suspense>` mantiene el build.
- `NEXARA-credenciales-usuarios-v4.xlsx` — fuera de git a propósito.
