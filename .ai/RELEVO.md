# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — CRM docs: cotización PDF = familia OC + Excel/UI

Ownership Sales/CRM document outputs. **No** se tocó Integra Hikvision.

### Cotización PDF (unificado con OC)

1. `cotizacion-pdf.ts` alineado a la familia de `purchase-order-pdf.ts`:
   membrete con **CompanyProfile** (razón social, RFC, domicilio fiscal,
   contacto), acento CRM, logo compartido, multipágina con pie.
2. Filas de **altura dinámica** (ya no recorta descripción/SKU).
3. Tabla con UdM + columnas escaladas al ancho; totales MXN es-MX.
4. `CotizacionesService.buildPdf` / `findOne` cargan `company`.

### Excel + botones claros

1. Lista cotizaciones: **Descargar PDF** / **Descargar Excel** (periodo).
2. Detalle cotización: **Descargar PDF**, PDF interno, **Descargar Excel**
   de partidas con resumen subtotal/IVA/total.
3. Clientes: **Descargar Excel** con teléfono + resumen.
4. Compras (OC libre): etiquetas **Descargar PDF** / **Descargar Excel**
   (PDF OC ya estaba listo; no se reescribió el generador).

### Concurrente — no pisar

ACS face / live detection / FieldDetection / hybrid warehouse.
**No** matching Face ID inventado.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh`

### Verificar (hard refresh)

1. CRM → Cotizaciones → **Descargar PDF** en lista o ficha: membrete
   fiscal, partidas legibles, totales, páginas numeradas.
2. En ficha → **Descargar Excel** de partidas.
3. Lista → **Descargar Excel** del periodo (con KPIs arriba).
4. ERP → Compras → **Descargar PDF** en OC (sin regresión).

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Re-wire httpHosts si cambia PUBLIC_API_URL.
3. CaptureFaceData en sensor (si firmware Oficinas lo expone).
4. PDF legacy `ventas/pdf-generator.service.ts` (oportunidad/template) —
   aún paralelo; el camino CRM principal es `cotizaciones/:id/pdf`.

## No tocar

Puente NAS, Traefik, credenciales.
**No** matching Face ID inventado sobre RTSP/AcuSense.
