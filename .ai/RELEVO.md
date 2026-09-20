# RELEVO

- **Último turno:** claude-code (tras cursor)
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** writers merge + P0 tenant UI Contadora

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

### Merges writers (post-flota)

- `gate/labels-rep` — enums ES balanza/gastos reportes (25/25)
- `feat/gate-toast-pre` — toast OT/batch PrenominaPanel
- `feat/gate-accounting-close-link` — accounting UI → `/erp/contabilidad/cierres`
- `feat/gate-erpFetch-spec` — `erp-api.spec.ts` 3/3
- `feat/gate-stamp-period-spec` — closed-period 10/10 (stamp+NC)
- `feat/gate-match-idor-spec` — gate-match-idor 2/2

### P0 follow-up auditorías

| Fix | Dónde |
|-----|--------|
| Hub dashboard → `erpFetch` | `contabilidad/page.tsx` |
| Export CSV movimientos → `withTenantHeaders` | `movimientos/page.tsx` |
| ContabilidadInvoicesView → `erpFetch` + STAMPING label | `ContabilidadInvoicesView.tsx` |
| Traspaso/ajuste muestran `monto` en grilla | `movimientos/page.tsx` |
| Pago CxC: toast éxito no se pisa si falla refresh | `CarteraView.tsx` |
| XML descarga + tenant | `CarteraView.tsx` |
| WAIVED match `getInvoice(..., companyId)` | ya en HEAD vía merge specs |

### Verificación

- closed-period-writes **10/10**
- gate-match-idor **2/2**
- erp-api.spec **3/3**
- lucide-react: **ausente** en contabilidad (gate viejo obsoleto)
- **MIGRATE REQUIRED: NO**

## A medias

- Deploy **BLOCKED** sin IP `hetzner-nexara` (`HostName REEMPLAZA…`; docs sugieren `5.78.215.109` + Port 2222).
- Portal CFDI / client-portal sin companyId (audit P0 — fuera Contadora staff).
- Viáticos/gastos sin assert periodo en dominio (solo vía journal al pagar).
- ~9 web tests ajenos (EvidenciaPorCampos, cotizaciones…) — no Contadora.

## Siguiente

1. Adam: IP en `~/.ssh/config` Host `hetzner-nexara` (+ Port 2222).
2. Push `mejora/calidad-y-web` → `./deploy/update.sh --force-all`.
3. Smoke Contadora.

## No tocar

Puente NAS.
