# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** P0 tenant/stamp/match/cierre + merges gate + hub

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

### Merges gate (toast/labels/money/inv)

Integrados en `mejora/calidad-y-web` (RELEVO-ours en conflictos `.ai/`):

- `feat/gate-proteccion-spec`, `gate/ds-gastos`, `gate/toast-cierre`
- `feat/gate-toast-con`, `gate/toast-cxc`, `feat/gate-labels-con/fac`
- `feat/gate-status-labels`, `feat/gate-invoice-feedback`, `gate/inv-catch`, `gate/money2`
- `feat/gate-hub` (merge `b99c6e99`) — hub silencioso + nuestros Money/MetricStrip/labels

Abortados por conflicto real (reintento en cloud writers): `gate/labels-mov`, `feat/gate-labels-cx`.

### P0 seguridad / tenant / periodo

| Fix | Dónde |
|-----|--------|
| `erpFetch` → `withTenantHeaders` | `apps/web/lib/erp-api.ts` (`ba9b05ce` Claude + confirmado) |
| `stampInvoice` + `createCreditNote` → `assertDateNotInClosedPeriod` | `accounting.service.ts` |
| `evaluateThreeWayMatch` → `companyWhere` + `assertCompanyAccess`; controller pasa `companyId` | service + `invoices.controller.ts` |
| PATCH `fiscal-periods/:id/close` ya no cierra en silencio | `accounts.controller` → `PeriodCloseService.closePeriod` (checklist) |

### Verificación

- `closed-period-writes.spec` 8/8 PASS
- `period-close.spec` 22/22 PASS
- `apps/api` `tsc --noEmit` PASS
- Flota micro-agentes explore + cloud writers en paralelo (labels-mov-v2, accounting-close-link, erpFetch-spec, match-idor-spec, stamp-period-spec)

### Migraciones

**MIGRATE REQUIRED: NO**

## A medias / pendiente real

- **Deploy BLOCKED:** `~/.ssh/config` Host `hetzner-nexara` → `HostName REEMPLAZA_CON_IP_HETZNER`. Llave `id_ed25519_nexara_hetzner` existe.
- Cloud writers pueden traer ramas `feat/gate-*` listas para merge (labels-mov-v2, close-link, specs).
- UI vieja `erp/accounting` aún ofrece botón Cerrar; backend ya exige checklist (fallará con pendientes) — preferir `/erp/contabilidad/cierres`.
- ~67 `apiFetch` locales sin tenant (CRM/OPS/…) — anotado por Claude, fuera de Contadora.
- Smoke navegador Contadora con datos reales.

## Siguiente

1. Adam pone IP Hetzner en `HostName` (o la da por nombre).
2. Merge cloud writers listos si pasan review.
3. `./deploy/update.sh --force-all` + smoke Contadora.

## No tocar

Puente NAS.
