# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-26
- **Rama:** main

## Hecho en este turno
- **Sitio público:** UX nav/CTAs (commit `7780788`) desplegado.
- **Diagnóstico Studio:** API en crash-loop — `ServiceSheetsModule` registraba
  `ActivityLifecycleService` sin `NotificationsModule` → 500 en `/api/hero-video/public`
  y `/api/studio/page-content/*` (fotos/videos no cargaban).
- **Fix:** importar `ActivitiesModule` en `service-sheets.module.ts` (una instancia DI).

## A medias — CUIDADO
- nada

## Siguiente paso
1. Push + redeploy API en Hetzner (rebuild `nexara-api`).
2. Verificar `curl https://nexara.com.mx/api/hero-video/public` → 200.

## No tocar
- `apps/web/app/(subdomains)/tickets/layout.tsx` — el `<Suspense>` mantiene el build.
- `NEXARA-credenciales-usuarios-v4.xlsx` — fuera de git a propósito.
