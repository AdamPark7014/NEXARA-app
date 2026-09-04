# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — playback NVR: XML + go2rtc query PUT

Verificado en prod contra `.34`. El cableado JSON de ContentMgmt **no**
funcionaba.

### Fixes

1. **ContentMgmt/search** en **XML** (JSON → 400 `badXmlFormat`).
2. **go2rtc**: `PUT ?name=&src=` (aunque responda 400 YAML, **sí registra** en
   memoria). El PUT JSON a `/api/streams` en 1.9.7 **no añade**.
3. UI Video: 24h, Obtener, segmentos, Volver a vivo; playback **solo foco**.
4. Docs + tests.

(UI ops chrome / PTZ / Personas del hermano siguen en la rama.)

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109`

Verificar: Video → Support → Últimas 24h → Obtener → MSE en foco.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Re-aplicar FieldDetection en equipos tras sync/push install.
3. go2rtc.yaml en disco corruptible (400 al persistir) — streams viven en RAM.

## No tocar

Puente NAS, Traefik, credenciales, Face ID óptico inventado.
No pelear pad PTZ ni reescribir Personas CRUD del sibling.
