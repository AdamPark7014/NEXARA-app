# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** Contabilidad unificada bajo ERP hub (sin duplicado sidebar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Adam: Contabilidad duplicada en sidebar Core y rutas alternas (`/erp/accounting`) abrían otro rail.

### Una sola Contabilidad
- Módulo `accounting`: `visible: false` + `shouldShowModuleInSidebar` → `false`
- Solo `erp-contabilidad` en menú Core (label «Contabilidad»)
- Access-tree admin: grupo «Finanzas» / toggle «Pólizas y cuentas»

### Rutas limpias bajo hub
- `/erp/contabilidad/polizas` reutiliza la UI de pólizas con `ContabilidadSidebar`
- Remap: `/erp/accounting` → `/erp/contabilidad/polizas`
- `/finance` → redirect `/erp/contabilidad`
- ACCOUNTANT home ya en `/erp/contabilidad`
- `FinanceModuleRail`: hub + pólizas del hub (sin segunda «Contabilidad»)
- Dashboard/executive: links a hub/pólizas, no a `/erp/accounting`

### Tests
- `legacy-path-remap` + `role-modules`: **74 pass**

**Nota:** no está en prod hasta push + deploy (BLOCKED sin IP Hetzner).

## A medias

- Deploy BLOCKED: `HostName REEMPLAZA…`
- Facturación/Bancos siguen como entradas Core aparte (van a `/erp/invoicing` / `/erp/banking` con FinanceModuleRail). Si Adam quiere que también desaparezcan del menú Core y vivan solo en ContabilidadSidebar, es el siguiente recorte.

## Siguiente

1. Adam: IP Hetzner.
2. Push + `./deploy/update.sh --force-all`.
3. Verificar en prod: una Contabilidad → hub; pólizas con ContabilidadSidebar.

## No tocar

Puente NAS.
