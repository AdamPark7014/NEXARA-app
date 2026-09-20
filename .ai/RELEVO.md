# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** gate/toast-cxc
- **HEAD:** ui(cartera): toast.error en registrar cobro/pago CxC/CxP
- **Worktree:** C:\dev\apps\_worktrees\nexara-gate-toast-cxc

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Gate toast CxC — `CarteraView.registrarPago`:

- Éxito ya tenía `toast.success` (cobro/pago + monto + folio).
- Error de API y factura cerrada: además del `InlineAlert` (`setErrorPago`), ahora
  `toast.error` con el mismo mensaje. El formulario sigue abierto tras fallo.
- Validación de monto/fecha sigue bajo campo (`errorMonto`), sin toast fugaz.

Archivo: `apps/web/components/erp/CarteraView.tsx` (CxC y CxP comparten el motor).

## A medias / pendiente real

- Merge de `gate/toast-cxc` → `mejora/calidad-y-web` (rama creada detrás ~12 commits).
- Deploy Hetzner bloqueado (`HostName REEMPLAZA_CON_IP_HETZNER`).
- Smoke navegador con datos reales.

## Siguiente

1. Integrar este commit en la rama de calidad.
2. Adam: IP/llave Hetzner o deploy.

## No tocar

Puente NAS.
