# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-20
- **Rama:** feat/cont-cxc (worktree `_worktrees/nexara-cont-cxc`, base `mejora/calidad-y-web` @ 07016b6c)
- **HEAD base:** merge 6 hardening (pdf, rbac, tools-ui, act-photos, act-flow, prenomina)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho en esta rama

Cuentas por cobrar y por pagar dejan de ser la lista genérica de facturas.

1. API — archivos nuevos en `apps/api/src/accounting/`:
   - `workspace-ar-ap.service.ts` — cartera con antigüedad, días vencido,
     calendario de obligaciones y detalle con pagos aplicados. Todo `where`
     pasa por `requireCompanyId` + `companyWhere`.
   - `workspace-ar-ap.controller.ts` — `GET /accounting/workspace/cxc|cxp`,
     `/cxp/calendario`, `/{cxc,cxp}/:id`, `/{cxc,cxp}/:id/xml`.
   - `workspace-ar-ap.spec.ts` — 39 pruebas: aislamiento por empresa, tramos
     de antigüedad con casos borde y contrato de autorización.
   - `accounting.module.ts`: una línea de provider y una de controller.
2. Web:
   - `apps/web/components/erp/CarteraView.tsx` — tabla densa, chips de
     antigüedad que filtran, detalle con pagos/documentos/historial, registro
     de pago y calendario de vencimientos en CxP.
   - `cuentas-por-cobrar/page.tsx` y `cuentas-por-pagar/page.tsx` reescritas.
   - `ContabilidadInvoicesView.tsx` queda intacto: sigue sirviendo /facturas.

Fechas: los vencimientos se comparan como día calendario (las columnas
`@db.Date` llegan a medianoche UTC). Leerlas con `getDate()` corría un día
los "días vencido" en un servidor en UTC-6.

## A medias / heredado

- `apps/web/lib/module-guides.ts` no tiene la entrada `erp-contabilidad` y
  `ModuleId` la exige → `tsc -p apps/web` falla desde antes de esta rama. El
  archivo es generado (`.ai/gen-module-guides.py`), y `.ai/module-guides.json`
  tampoco trae el módulo: hay que regenerarlo, no escribirlo a mano.
- Jest: `accounting/workspace-dashboard.spec.ts` importa de `vitest` y no
  corre bajo jest. Fallan también `activities.controller.spec.ts`,
  `entrega-herramienta.spec.ts` y `me/team-board-periodo.spec.ts` (heredado).
- El cliente Prisma estaba desfasado (faltaba `ActivityPeerRequest`); se
  regeneró con `npm run prisma:generate --workspace=apps/api`.
- Deploy Hetzner sigue pendiente (SSH Permission denied desde este entorno).

## Siguiente

1. Revisar la cartera con datos reales: CxC y CxP, chips y calendario.
2. Regenerar `module-guides` para desbloquear el typecheck de web.
3. `./deploy/update.sh --force-all` en servidor + smoke contadora.

## No tocar

Puente NAS. `ContabilidadInvoicesView.tsx` (lo usa /facturas).
