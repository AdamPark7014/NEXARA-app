# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-22
- **Rama:** cursor/relocate-integra-shared-a46f

## Hecho

### ERP-only en producción (web) y paridad móvil
- Verificado móvil: Android e iOS ya son Core-only (ERP) para personal; iOS sin selector de paneles, igual que Android.
- ERP web ya no depende de `components/crm`: Compras usa `components/erp/erp-chrome.module.css`.
- `.dockerignore` ahora excluye:
  - `apps/web/app/(panels)/{finance,hr,integra}/**`
  - `apps/web/components/{studio,crm}/**`
- Doc de despliegue: `deploy/SERVER-ERP-ONLY.md` (qué entra, qué se excluye, riesgos).
 - FIX urgente: se movieron los helpers compartidos de Integra fuera de `app/(panels)/integra/**`:
   - Nuevos: `apps/web/lib/integra-shared/_lib.ts`, `apps/web/lib/integra-shared/_caps.ts`
   - Nuevo comp: `apps/web/components/presence/_PersonFace.tsx`
   - Importadores actualizados (`AppShell`, `presence/*`, `lib/presence-api.ts`).
   - Build verificado: `npm run build --workspace=apps/web` OK.

## A medias
- Sin cambios pendientes de esta tarea.

## No tocar
Puente NAS · keystore Play · `NO TOCAR LIBREMENTE`.
