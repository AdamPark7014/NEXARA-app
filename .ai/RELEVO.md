# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Face recognition UX ACS (fotos + alta + eventos)

Prioridad Adam: reconocimiento facial “ineficiente”. No inventamos Face ID
sobre AcuSense. Maximizamos identidad ACS + JPEG en NEXARA.

### Qué cambió

1. **Persistencia JPEG** `uploads/integra-faces/{company}/{personId}.jpg` al
   subir FaceDataRecord; proxy `GET people/:id/face` sirve local primero.
2. **`_PersonFace.tsx`**: thumb con tenant headers + cache blob (arregla
   AcsIdentityStrip que usaba `<img src>` sin X-Company-Id).
3. **Live banner / RecentAccess / Occupancy / ACS strip**: foto evento o
   enrolada; prefetch en SSE.
4. **Personas UI**: wizard Nombre → Código → **Foto JPEG obligatoria** →
   Guardar (alta + fan-out face); ficha con Face/Huella; **zona peligro**
   delete; prefetch listado (6 workers, sin N+1 bloqueante).
5. **Eventos**: timeline con cara + tarjeta de identidad grande.
6. **Huella** (secundario): CaptureFingerPrint → Download; plantilla en
   `uploads/integra-fp/` si el ACS exporta.
7. Docs `INTEGRA-LAN.md` rutas Face/FP.

### Concurrente (siblings — no pisar)

CRM OC PDF · stock historial · asistencia híbrida · PTZ.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app`

### Verificar (hard refresh)

1. Integra → Personas → **Ctrl+Shift+R** → Alta → foto JPEG → Guardar.
2. Listado/ficha deben mostrar la cara (no inicial vacía).
3. Eventos ACS → cards con foto; detalle identidad grande.
4. Video → pase por puerta → banner + RecentAccess con cara.
5. Ficha → zona roja Eliminar (todos los ACS).

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Re-aplicar FieldDetection; alinear employeeNumber↔personId Oficinas.
3. Batch face endpoint (ahora prefetch+cache); captura huella en prod Oficinas.

## No tocar

Puente NAS, Traefik, credenciales, Face ID óptico inventado sobre AcuSense.
CRM/stock/asistencia siblings.
