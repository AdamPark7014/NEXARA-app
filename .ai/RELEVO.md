# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — PTZ snappy arriba + presencia multi-caja

### PTZ (prioridad Adam)

1. **Pad ARRIBA del video** (`ptzChrome`): no enterrado bajo ACS/Vehículos.
   Visible aunque MSE diga «Conectando…».
2. **Hold continuo** (`continuous: true` → ISAPI `/continuous`, vel. 92):
   una orden al pulsar + `stop` al soltar (antes momentary cada ~320 ms).
3. Mensaje honesto: PTZ sin ANPR/FieldDetection.

### Overlay Meeting Room

- Label sin duplicar «sin ID» (`Humano` + `sin ID · Ns`).
- Sticky 90 s / VMD 75 s / seed 120 s; máx 8 tracks.
- Parser multi-TargetRect; FieldDetection todas las regiones sens. 95.

### Límite hardware

AcuSense empuja TargetRect por evento (a menudo 1 humano). Tres sentados
sin re-disparo no inventan cajas nuevas — sticky/VMD conserva las ya vistas.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109`

Verificar tras rebuild: Video→PTZ pad arriba + hold rápido; Meeting Room labels.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Re-aplicar FieldDetection en equipos tras sync/push install.

## No tocar

Puente NAS, Traefik, credenciales, Face ID óptico inventado.
People CRUD / playback (siblings — hubo rescue d92bd7e).
