# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-08-26
- **Rama:** seo-serp-favicon

## Hecho en este turno
- Rescate de 324 archivos que estaban sin commitear (commit `f13fdc4`, WIP de
  autoría desconocida — probablemente Cursor).
- `.gitignore`: excluido `*credenciales*.xlsx`. El archivo
  `NEXARA-credenciales-usuarios-v4.xlsx` estaba sin rastrear y a punto de entrar
  al historial. Sigue en disco, fuera de git.
- **Arreglado el build.** `apps/web/app/(subdomains)/tickets/layout.tsx` monta
  `PortalShell`, que llama a `useSearchParams()`. Sin `<Suspense>` por encima,
  el prerender estático de `/tickets`, `/tickets/ayuda`, `/tickets/mis-servicios`
  y `/tickets/mis-sucursales` hacía bail-out y tumbaba `web#build`. Envuelto en
  `<Suspense fallback={null}>`. Build verde: las cuatro vuelven a ser estáticas.

## A medias — CUIDADO

**El WIP `f13fdc4` está incompleto. NO desplegar hasta cerrarlo.**
`npm run test`: 7 fallos de 498, en tres frentes que el WIP tocó:

1. `apps/api/src/activities/` — `ActivitiesController › should be defined`
   falla, o sea el módulo ni siquiera instancia. En el log sale
   `this.prisma.user.findMany is not a function`. Wiring/DI roto en
   `activities.module.ts` o mock desalineado. **Es el más grave: mira este primero.**
2. `apps/api/src/company/company-tenant-pin.spec.ts` — espera empresa `7`,
   recibe `1`. El spec describe conducta nueva ("no debe auto-inscribir la
   cuenta en la empresa primaria") que aún no está implementada en
   `resolveForUser`. El test es el objetivo, no el error.
3. `apps/api/src/cotizaciones/cotizacion-totals.spec.ts` — `normalizeItems`
   debería acotar porcentajes a [0,100] y devuelve 16 donde se espera 0.

Los specs 2 y 3 los escribió el propio WIP: son la especificación de lo que
faltaba implementar. No los borres para poner el build en verde.

**Migración sin aplicar:** `apps/api/prisma/migrations/20260826100000_cotizacion_supplier_warehouse/`.
`deploy.sh` corre `deploy/update.sh --with-migrate`, así que desplegar la
ejecuta contra la BD de producción. No es reversible con un revert.

## Siguiente paso
1. Arreglar el wiring de `activities` (fallo 1) — sin eso el API no levanta bien.
2. Implementar el tenant pinning de `resolveForUser` (fallo 2).
3. Arreglar el clamp de `normalizeItems` (fallo 3).
4. Con los 498 tests en verde: `npm run build` y recién entonces `deploy.sh`,
   pidiéndole a Adam el OK explícito por la migración.

## No tocar
- `apps/web/app/(subdomains)/tickets/layout.tsx` — el `<Suspense>` es lo único
  que mantiene el build en pie. Si lo quitas, vuelve a romperse.
- `NEXARA-credenciales-usuarios-v4.xlsx` — fuera de git a propósito.
