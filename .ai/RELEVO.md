# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** fix(accounting): blindar periodo cerrado en escrituras

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Blindaje de periodo fiscal cerrado en escrituras financieras críticas:

- `assertDateNotInClosedPeriod` ahora se llama desde:
  - `registerPayment` → `paymentDate`
  - `reconcileTransaction` → `transactionDate`
  - `cancelInvoice` → `issueDate` + hoy
  - `createInvoice` → `issueDate`
  - `updateInvoiceDraft` → `dto.issueDate` o `invoice.issueDate`
  - `deleteInvoice` → `issueDate`
  - `importBankTransactions` → cada `transactionDate`
- Ya cubierto antes: `reverseJournalEntry`; crear/postear pólizas vía `resolveOpenFiscalPeriodId`.
- Suite nueva: `apps/api/src/accounting/closed-period-writes.spec.ts` — **8/8 PASS**.

## A medias / pendiente real

- **Deploy bloqueado:** `~/.ssh/config` tiene `hetzner-nexara` con
  `HostName REEMPLAZA_CON_IP_HETZNER`. Falta IP/llave. En servidor:
  `./deploy/update.sh --force-all`
- **AuditLog no guarda el estado anterior** salvo en el cierre de periodo.
- Bonos/descuentos no existen en pre-nómina (no inventados).
- Sin smoke de navegador contra datos reales.
- UI de cierres (`proteccion.noBloqueado`) puede actualizarse a reflejar el
  blindaje API; no se tocó web en este turno.

## Siguiente

1. Adam da IP/llave Hetzner o corre deploy.
2. Smoke contadora contra datos reales.
3. Opcional: alinear copy de UI cierres con el blindaje API.
4. AuditLog `previousData` en updates.

## No tocar

Puente NAS.
