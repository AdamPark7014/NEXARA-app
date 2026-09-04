# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-03
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Muro: todas visibles con MJPEG

El tope de 4 MSE dejaba el muro en «En cola». Ahora:

- **Muro** → go2rtc `mode=mjpeg` (JPEG por WS, sin decodificador H.264 por tile)
- **Foco** → `mode=mse` (calidad)
- Sin cupo de 4; stagger corto 180 ms al abrir

Deploy: `ssh -p 2222 root@5.78.215.109` → `/var/www/nexara-app`

## A medias / siguiente

1. Verificado deploy MJPEG be2ec76; falta hard-refresh del usuario. Fix IgBadge muted→neutral pendiente en prod si rebuild limpio que 3×3 / 4×4 muestran todas (MJPEG).
2. Personas UI+API ya en rama; sync + fotos.
3. TCPMSS / biblioteca init / empresas 1-2.

## No tocar

Puente NAS, Traefik ports, credenciales en repo, rutas ISAPI no verificadas.
