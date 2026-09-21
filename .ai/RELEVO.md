# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-21
- **Rama:** mejora/calidad-y-web

## Hecho

### Deploy prod (Hetzner)
- `011969f5` en servidor; `nexara-api` healthy + `nexara-web` up.
- https://core.nexara.com.mx/erp/vehiculos y `/erp/finance/viatics` → 200.
- Incluye: Agregar flotilla, Asignar viático (lote), FormField UX.

### Fix build
- Tipado `puedeGestionarInventarioVehiculos` (`permissions: null` → `undefined`).

## A medias
- Play Console (AAB/capturas).
- Más FormField: OpsActivity, VehicleCheckout, proyectos/procurement.
- Documentos nativos / tope cotizaciones / tools.manage.

## No tocar
Puente NAS · keystore Play · `NO TOCAR LIBREMENTE`.
