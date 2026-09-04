# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — audio roto + cajas/vehículos honestos

**Audio:** `setChannelAudio` tenía el regex corrupto (`<Audio\x08…>`) → **nunca
encendía el mic**. Arreglado + enciende 101/102 en IP directa (no solo NVR).
UI: si `hasAudio`, el foco abre stream con audio; botón «🔇 Sonido» más visible
(el navegador exige gesto para oír).

**Support (.173):** FieldDetection SÍ manda `human`+TargetRect, pero es
**intrusión puntual** (no tracking continuo). Gente sentada = sin caja nueva.
Overlay: TTL 25 s, hold con VMD, chip «Detección activa / Movimiento».

**PTZ (.179):** FieldDetection/LineDetection = **403 notSupport**. Cero eventos
push de esa IP. No puede pintar vehículos ni placas — mensaje claro en panel.
Hace falta ITC/AcuSense vehicle para cajas de coche.

Tras deploy: hard-refresh Video → PTZ debe mostrar «🔇 Sonido» → clic para oír;
Support: caminar en zona → cajas; sentados solo chip de movimiento.
Script one-shot en prod: habilitar audio en cámaras LAN con mic.

SSH: `-p 2222 root@5.78.215.109` → `/var/www/nexara-app`

## A medias

1. Portal empleado (User↔employeeNo).
2. httpHost NVR `.34`.
3. Cámara ANPR ITC si se quieren placas / vehicle boxes en parking.
4. Micros / Hik-Connect — decisión Adam.
5. TCPMSS / biblioteca init / empresas 1-2.

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
Face ID óptico sobre AcuSense (no inventar matching).
