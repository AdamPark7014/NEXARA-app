# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — PTZ snappy arriba + presencia multi-caja

### PTZ (prioridad Adam)

1. **Pad ARRIBA del video** (`ptzChrome`): ya no queda enterrado bajo
   Identidad ACS / Vehículos. Visible aunque MSE diga «Conectando…».
2. **Hold continuo** (`continuous: true` → ISAPI `/continuous` a velocidad 92):
   una sola orden al pulsar + `stop` al soltar. Antes `momentary` cada ~320 ms
   sumaba RTT Tailscale y se sentía lento.
3. Mensaje honesto: PTZ sin ANPR/FieldDetection; mando útil sin video.

### Overlay Meeting Room (sitting)

- Label: `Humano` + `sin ID · Ns` (antes «Humano · sin ID sin ID · ahora»).
- Sticky 90 s / VMD hold 75 s / seed 120 s; merge multi-track (máx 8) sin
  reemplazar todas las cajas por la última.
- Parser: `TargetRectList`, X/x, todas las `DetectionRegionEntry`.
- FieldDetection: habilita **todas** las regiones del canal, sens. 95.

### Límite hardware (no mentir)

AcuSense FieldDetection empuja TargetRect por evento — a menudo **1 humano
por aviso**, no tracking continuo de 3 sentados. Si solo dispara uno, solo
hay una caja nueva; las demás viven del sticky/VMD si ya se pintaron antes.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app`

Verificar: Video → PTZ → pad arriba + hold snappy; Meeting Room → labels
sin duplicar «sin ID»; cajas sticky multi-persona cuando el equipo dispara.

## A medias

1. Portal empleado (User↔employeeNo).
2. httpHost NVR `.34`.
3. Cámara ANPR ITC.
4. Micros / Hik-Connect — decisión Adam.
5. TCPMSS / biblioteca init / empresas 1-2.
6. Re-aplicar FieldDetection en prod tras deploy (push install / sync).

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
Face ID óptico inventado sobre AcuSense. People CRUD / playback (siblings).
