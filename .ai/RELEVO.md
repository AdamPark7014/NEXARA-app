# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — delete personas + playback NVR + presencia ACS

### C) Delete personas (bug «no borra»)

Causa: `UserInfoDetail/Delete` es async; se borraba el espejo aunque el ACS
fallara → sync 15 min / live **re-importaba** a la persona. UI ignoraba
`success:false`.

Arreglo: face delete → Delete → poll `DeleteProcess` → verificar que ya no
está en UserInfo; **espejo solo si TODOS los ACS OK**; UI muestra error si
parcial/falla.

### B) Playback / grabación ISAPI

Antes solo Artemis. Ahora `POST .../playback` en sitio ISAPI usa
`ContentMgmt/search` en el NVR → `playbackURI` → go2rtc HLS y sustituye el
foco. Sin segmentos = nota clara.

### A) Sitting + identidad ACS (honesto)

TTL/hold overlay ~45 s; chip movimiento. Strip **Identidad ACS** (fotos de
ocupación/terminales) junto al foco de oficina — **no** Face ID sobre AcuSense.

SSH: `-p 2222 root@5.78.215.109` → `/var/www/nexara-app`

Verificar: Personas → Eliminar (debe fallar visible si un ACS falla);
Video → Playback última 1h en Support; Video Support → cajas + strip ACS.

## A medias

1. Portal empleado (User↔employeeNo).
2. httpHost NVR `.34`.
3. Cámara ANPR ITC.
4. Micros / Hik-Connect — decisión Adam.
5. TCPMSS / biblioteca init / empresas 1-2.

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
Face ID óptico inventado sobre AcuSense.
