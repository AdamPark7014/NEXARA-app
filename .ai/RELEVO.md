# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — ERP stock/compras: PDF + Excel + UI

Huecos de documentos Purchasing / Inventory / Warehouse (sin tocar Integra ni cotizaciones CRM).

### Backend

1. **Recepción GR PDF** — `goods-receipt-pdf.ts` + `GET procurement/goods-receipts/:id/pdf`
   (+ `GET :id`). Listado enriquece warehouse / supplier / partidas.
2. **Kardex PDF** — `stock-movement-pdf.ts` + `GET stock/movements/pdf` (filtros)
   + `GET stock/movements/:id/pdf` (comprobante traspaso/ajuste/entrada).
3. Tema `PDF_MODULE_ACCENTS.warehouse` vía `nexara-pdf-theme`.

### Frontend

1. Almacén: PDF kardex, PDF historial producto, PDF por fila; Excel solo con
   datos; limpiar filtros; Excel lotes/valuación; ajuste alta/baja.
2. Tablas movimientos: SKU, cant., almacén, usuario, fecha/hora, referencia.
3. Compras → Recepciones: columnas almacén/partidas/landed + PDF + Excel.

### Concurrente — no pisar

Integra / ACS face · CRM cotizaciones PDF · asistencia · FieldDetection.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh`

### Verificar (hard refresh)

1. ERP → Almacén → Movimientos → PDF kardex / Excel / Limpiar filtros.
2. Fila movimiento → PDF comprobante; historial producto → PDF + Excel.
3. ERP → Compras → Recepciones → Excel + PDF por fila.
4. Formulario movimiento: Ajuste (alta) y Ajuste (baja).

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Re-wire httpHosts si cambia PUBLIC_API_URL.
3. CaptureFaceData en sensor (si firmware Oficinas lo expone).
4. Hub `/erp/exports` aún sin cards de stock (opcional).

## No tocar

Puente NAS, Traefik, credenciales.
**No** matching Face ID inventado sobre RTSP/AcuSense.
**No** cotizaciones CRM PDF (sibling).
