# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** merge a11y-dropzone + datatable-aria; CarteraView tenant ya en HEAD

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

### Follow-up flota

- [Audit remaining gate branches] inventarió 27 ramas con código vs origin; 14 ya en HEAD local.
- Merged: `feat/gate-a11y-dropzone`, `feat/gate-datatable-aria` (RELEVO-ours).
- Abortados (conflicto real): `feat/gate-factura`, `feat/gate-period-lock` (specs/period ya cubiertos en HEAD).
- CarteraView P0 toast+refresh + P1 XML `withTenantHeaders`: **ya en HEAD** (limpio).

### Pendiente de merge (conflicto / solape)

`feat/gate-labels-cx`, `feat/gate-labels-all`, `feat/gate-money-align`, `gate/labels-mov`, `feat/gate-uuid-*`, `feat/gate-confirm-ws`, `feat/gate-cierres-*`, `feat/gate-factura`.

### Verificación previa

closed-period 10/10 · match-idor 2/2 · erp-api 3/3 · **MIGRATE REQUIRED: NO**

## A medias

- Deploy BLOCKED: `HostName REEMPLAZA_CON_IP_HETZNER` (+ Port 2222).
- Portal CFDI tenant gaps (fuera Contadora staff).

## Siguiente

1. Adam pone IP Hetzner.
2. Push + `./deploy/update.sh --force-all`.
3. Cherry-pick selectivo de labels-cx / uuid si hace falta.

## No tocar

Puente NAS.
