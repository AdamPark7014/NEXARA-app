# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** gate/inv-catch
- **HEAD:** (pendiente commit) toast stamp/pay facturas

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

### Gate inv-catch — feedback stamp/pay

Worktree: `C:\dev\apps\_worktrees\nexara-gate-inv-catch` · branch `gate/inv-catch`

1. **Contabilidad facturas** (`ContabilidadInvoicesView.registerPayment`):
   - Lee respuesta del pago y toasts:
     - complemento UUID → success
     - `complementStampWarning` → **warning** (ya no se traga el fallo de timbrado PPD)
     - else → success “Pago registrado”
   - Catch de error sigue con `toast.error`

2. **Invoicing lista** (`erp/invoicing/page.tsx`):
   - Timbrar: `toast.success` tras PAC (antes solo reload silencioso)
   - Pago plano: `toast.success("Pago registrado")` cuando no hay complemento ni warning

## A medias / pendiente real

- Merge `gate/inv-catch` → `mejora/calidad-y-web`
- Deploy Hetzner sigue bloqueado
- EXEC-PACKET stale (Actividades 13-09)

## Siguiente

1. Merge gate/inv-catch
2. Adam: IP Hetzner si toca deploy

## No tocar

Puente NAS.
