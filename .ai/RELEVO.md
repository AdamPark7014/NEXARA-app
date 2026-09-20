# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** ddb0b023 feat(contabilidad): hub /erp/contabilidad workspace olas A-F

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho

1. Hub Contadora `/erp/contabilidad/*` completo (sidebar, CxC/CxP/facturas, movimientos, conciliación split, prenomina redirect, presupuestos, P&L proyecto, proveedores, reportes, cierres, auditoría).
2. `GET accounting/workspace/dashboard` + tests authz API/web.
3. Home contadora → `/erp/contabilidad`; módulo `erp-contabilidad` en Core.
4. Push a `origin/mejora/calidad-y-web`.

## A medias

- Deploy Hetzner: SSH desde este entorno = Permission denied (publickey). Adam debe correr en servidor `./deploy/update.sh --force-all` tras pull.
- Worktrees hardening: hard-rbac · hard-pdf · hard-act-photos · hard-act-flow · hard-tools-ui · hard-prenomina.

## Siguiente

1. Deploy + smoke login rol contabilidad → hub.
2. Merge olas hardening restantes.

## No tocar

Puente NAS.
