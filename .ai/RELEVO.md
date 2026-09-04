# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — playback NVR verificado (Track Recording)

Adam: «FALTA TODO EL TEMA DE GRABACION». El cableado previo de
`ContentMgmt/search` **no funcionaba** en el DS-7616 real; verificado por smoke
en prod contra `192.168.9.34`.

### Causa raíz

1. JSON `?format=json` → **400 badXmlFormat**. Hace falta **cuerpo XML**.
2. go2rtc `PUT ?name=&src=` → **400 YAML** si el `playbackURI` trae
   `?starttime=&endtime=`. Registro con **JSON body** `{name:[rtsp]}`.
3. Track = `channelId` del espejo (`501`…). Hay segmentos en 24h+; 1h a veces
   vacía.

### Qué quedó usable

- API XML search + `segmentIndex` + publish JSON → MSE.
- UI Video: 24h default, Obtener, lista de segmentos, Volver a vivo; playback
  **solo en foco** (muro vivo).
- Docs `INTEGRA-LAN.md` con límites.
- Tests unitarios playback XML.

(PTZ pad arriba / continuous del turno hermano sigue en la rama — no tocado.)

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109`

Verificar: Video → Support → Últimas 24h → Obtener → segmentos → MSE en foco.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Re-aplicar FieldDetection en equipos tras sync/push install.

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
Face ID óptico inventado sobre AcuSense.
