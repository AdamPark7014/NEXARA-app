# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-03
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Muro: por qué se quedaba en «Conectando»

`video-stream mode=mjpeg` **no entrega frames** con estos RTSP. Medido:
`/api/frame.jpeg?src=cam_…_101` → **200 / 16 KB**; el WS mjpeg del
componente se queda vacío → spinner eterno.

### Arreglo

- **Muro** → `<img>` a `/go2rtc/api/frame.jpeg?src=…` refrescado ~1 fps
  (escalonado). Se ven todas sin decodificar H.264 × N.
- **Foco** → MSE (`video-stream`), `src` se asigna **después** de
  `appendChild` (si no, `onconnect` sale con `isConnected=false`).

SSH: `-p 2222 root@5.78.215.109` → `/var/www/nexara-app`

## A medias

1. Desplegar este fix y hard-refresh del muro.
2. Personas sync + fotos.
3. TCPMSS / biblioteca init / empresas 1-2.

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
