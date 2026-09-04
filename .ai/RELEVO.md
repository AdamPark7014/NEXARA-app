# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — fix PTZ + detecciones

**Bug PTZ:** en sync del NVR se anulaba `ptz` en todos los canales
(`c.ptz = null` porque PTZCtrl del grabador miente). La cámara «PTZ»
(`.179`) quedaba `ptz:false` → **no salía el mando** en Foco.

**Arreglo:** sondear PTZ/ANPR en la IP directa de cada cámara LAN; heurística
por nombre/modelo; listCameras y UI también reconocen «PTZ»/DF8. `ptzTarget`
habla a `.179` canal 1 aunque `reachableDirectly` viniera mal.

**Detecciones:** eventos `fielddetection` sí llegan (p.ej. `.173`). Overlay
ahora **siembra** los últimos ~6 s al abrir la cámara (antes solo veía lo
nuevo tras montar). TTL 6 s, poll 1.5 s. Etiqueta `Humano · sin ID` (no Face ID).

SSH: `-p 2222 root@5.78.215.109` → `/var/www/nexara-app`

Tras deploy: hard-refresh Video → Foco «PTZ» (debe verse el pad) → mover;
Foco Support (cajas al haber movimiento).

## Personas / placas / ocupación

Ver commit `9308b92`. CRUD ISAPI + foto FaceDataRecord; occupancy; vehicles
sin OCR falso.

## A medias

1. Portal empleado (User↔employeeNo).
2. httpHost NVR `.34`.
3. Cámara ANPR ITC si se quieren placas.
4. Micros / Hik-Connect — decisión Adam.
5. TCPMSS / biblioteca init / empresas 1-2.

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
