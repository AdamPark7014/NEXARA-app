# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/gate-invoice-feedback
- **HEAD:** (pendiente de cerrar) feedback visible en create/pay/stamp de facturas

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Puerta de producción: create / pay / stamp de facturas ya no tragan el error en silencio.

| Pantalla | Qué se cerró |
|----------|--------------|
| `contabilidad/facturas` (`ContabilidadInvoicesView`) | Pago: `payErr` + `InlineAlert` en el modal + toast; validación de monto bajo el campo; cerrojo anti doble clic; sin sesión deja de quedar en «Cargando…» |
| `erp/invoicing` (lista) | Crear: validación con `formErr` (antes return mudo); catch con `formatApiError` + toast; Timbrar/Cancelar: `actionError` persistente (el ConfirmDialog mata el toast solo); Pago: toast + `paymentErr` |
| `erp/invoicing/[id]` | Pago: toast + inline; Timbrar / complemento: `actionError` + toast con `formatApiError` |

Patrón alineado con `feat/gate-gastos` y `feat/gate-cartera`: error junto a la acción, no solo un toast que se va detrás del modal.

## A medias

- Sin smoke en navegador contra API real (PAC / timbrado).
- `validateRfc` / carga de PAC e issuer siguen fallando en silencio a `null` (no son create/pay/stamp).

## Siguiente

1. Integrar `feat/gate-invoice-feedback` en `mejora/calidad-y-web` cuando Adam lo pida.
2. Smoke: crear borrador incompleto, timbrar con PAC caído, registrar pago inválido — debe verse alert/toast.

## No tocar

Puente NAS.
