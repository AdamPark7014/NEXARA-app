# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — mega-opt live detecciones / identidad

**Límite de hardware (sigue igual):** AcuSense = cajas `human`/`vehicle` **sin
nombre**. Identidad real solo en terminales ACS (`personName` + FaceRect).

**Qué se optimizó:**

1. **SSE `GET integra/push/stream`** + poll incremental `afterId` cada **400 ms**
   (antes solo poll 1.5 s). Entrega casi al instante vía Subject en ingest.
2. **listEvents** acepta `afterId` / `sinceMs` / `live=1`.
3. Overlay: TTL 10–14 s, **fusión IoU** de cajas (track continuo), semilla
   `sinceMs`, fade CSS alineado, transición de posición.
4. Banner sitio **LiveAccess** cuando alguien pasa por ACS (aunque mires oficina).
5. Occupancy se refresca al vuelo con accesos; RecentAccess 60 s + semilla.
6. FieldDetection wire: `sensitivity=90`, `timeThreshold=0`.

SSH: `-p 2222 root@5.78.215.109` → `/var/www/nexara-app`

Tras deploy: hard-refresh Video → caminar frente a Support (cajas más rápidas);
pasar por puerta (banner + nameplate en cámara-puerta). Re-wire detección en
Sitios si las cámaras aún tienen umbrales viejos:
`POST .../sites/:id/push/wire` con `{ detection: true }`.

## A medias

1. Portal empleado (User↔employeeNo).
2. httpHost NVR `.34`.
3. Cámara ANPR ITC si se quieren placas.
4. Micros / Hik-Connect — decisión Adam.
5. TCPMSS / biblioteca init / empresas 1-2.

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
Face ID óptico sobre AcuSense (no inventar matching).
