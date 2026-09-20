# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** fix(accounting): blindar periodo cerrado + MetricStrip href (rescate)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

### A) Blindaje periodo fiscal cerrado (API)

`assertDateNotInClosedPeriod` en escrituras críticas:

- `registerPayment`, `reconcileTransaction`, `cancelInvoice`, `createInvoice`,
  `updateInvoiceDraft`, `deleteInvoice`, `importBankTransactions`
- Suite: `closed-period-writes.spec.ts` — 8/8 PASS

### B) Audit UX Contabilidad/Finanzas (PRODUCTION blockers)

Pantallas revisadas: hub contabilidad, movimientos, CxC/CxP (`CarteraView`),
conciliación, cierres, proveedores, proyectos, presupuestos, reportes,
auditoría, pre-nómina, facturas; finance (gastos/viáticos/pagos);
invoicing (+ detalle); banking; accounting; shared UI
(MetricStrip, FileDropzone, ConfirmDialog, DataTable, InlineAlert).

**Crítico corregido** (en `8c7f8166` vía rescate):

- Hub Contabilidad MetricStrip: `onClick`+`router.push` → `href` (ctrl+clic /
  pestaña nueva). Quitado `useRouter`.

**Shared UI — OK sin cambio:**

- FileDropzone: `role=button` + Enter/Space
- ConfirmDialog: `whiteSpace: pre-line`
- DataTable: `role=region` + default `aria-label="Tabla de datos"`
- Finance submits: toast / InlineAlert / disable-while-saving en flujos
  principales (gastos, viáticos, pagos, cartera, cierres, conciliación)

**Diferido (no silent-submit crítico):**

- `accounting/page.tsx`: load de periodos/centros/presupuestos traga error →
  lista vacía (parece «sin datos»)
- Banking/invoicing: éxito cierra modal sin `toast.success` (hay feedback)
- Varias DataTable sin `ariaLabel` propio (default cubre)
- EXEC-PACKET en disco sigue stale (Actividades 13-09); no ejecutado

## A medias / pendiente real

- **Deploy bloqueado:** `hetzner-nexara` con `HostName REEMPLAZA_CON_IP_HETZNER`
- AuditLog sin estado anterior salvo cierre de periodo
- Smoke navegador con datos reales
- UI cierres (`proteccion.noBloqueado`) puede alinear copy con blindaje API

## Siguiente

1. Adam: IP/llave Hetzner o `./deploy/update.sh --force-all`
2. Opcional: errores visibles en tabs periodos/centros/presupuestos del libro
3. Claude: regenerar EXEC-PACKET si hace falta

## No tocar

Puente NAS.
