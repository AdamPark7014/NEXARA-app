# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Lookup fiscal SAT (RFC / régimen)

### Hecho

1. **Realidad SAT:** no hay API pública gratuita de Constancia (razón social + régimen inscrito). Solo validador web (RFC/nombre/CP).
2. **`SatService.lookupFiscalByRfc`**: validación local (formato + checksum) + catálogo `c_RegimenFiscal` filtrado PF/PM; si hay `FACTURAMA_*` valida existencia; si hay `SAT_DATOS_FISCALES_URL` + `API_KEY` intenta razón social/CP/régimenes.
3. Endpoints: `GET ventas/clientes/fiscal-lookup?rfc=` y `GET …/invoices/sat/fiscal-lookup/:rfc`.
4. UI: `FiscalRfcLookup` en **Nuevo cliente** y **CRM datos**; botón «Consultar SAT» + select de régimen (ya no texto libre tipo 503).
5. `.env.example` documenta vars opcionales.

### Verificar

1. Reiniciar API → `/erp/clientes/nuevo`
2. RFC moral 12 chars → régimenes 601…; «Consultar SAT» → mensaje + select.
3. Con Facturama en `.env` → status localizado/activo.
4. Razón social auto solo si `SAT_DATOS_FISCALES_*` está configurado.

### A medias

Nada.

### Siguiente

Si Adam quiere razón social 100% auto: dar API key de API Market/Singula/Paladins → se pega en env y ya.

### No tocar

Puente NAS. Credenciales PAC en repo.
