# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** `744278ae` — Contabilidad unificada; **deployed** a Hetzner

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

### Deploy Hetzner (desbloqueado)
- SSH: `root@5.78.215.109` puerto **2222**, clave `id_ed25519_nexara_hetzner`
- `~/.ssh/config` host `hetzner-nexara`: HostName + Port actualizados
- Push `mejora/calidad-y-web` → origin (`5cef19f0..744278ae`)
- Servidor: `DEPLOY_BRANCH=mejora/calidad-y-web ./deploy/update.sh --force-all`
- Prod HEAD: `744278ae` · api healthy · web up · traefik sync ok
- Sin `--with-migrate` (gate: no migraciones en esta wave)

### Contabilidad (ya en ese HEAD)
Una Contabilidad en Core; pólizas en `/erp/contabilidad/polizas`; remap `/erp/accounting`.

## A medias

- Facturación/Bancos siguen como entradas Core aparte (FinanceModuleRail). Recorte opcional: solo ContabilidadSidebar.
- Verificar en browser prod: hub Contabilidad + herramientas MetricStrip.

## Siguiente

1. Smoke en prod: `/erp/contabilidad`, `/erp/contabilidad/polizas`, `/erp/almacen/herramientas`
2. Si Adam quiere: ocultar invoicing/banking del menú Core

## No tocar

Puente NAS.
