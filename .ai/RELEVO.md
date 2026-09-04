# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — ACS face al límite + build desbloqueado

Sin Face ID óptico sobre AcuSense. Maximizamos ACS + NEXARA.

### Face / push

1. Acceso ACS: JPEG enrolado **al instante** en el primer SSE.
2. Snapshot diferido canal **102→101** + re-SSE.
3. FaceDataRecord + **FDSearch** post-upload; JPEG 8 KB–1.8 MB.
4. Persistencia `uploads/integra-faces/`.

### Build fix (siblings)

- `identity-link`: `orgRoleKey` (no `roleKey`).
- `users.service`: quitó comparación `isActive` inexistente en DTO.
- tsc api limpio.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`./deploy/update.sh --force-all`

### Verificar

1. Hard refresh Personas → Alta JPEG → cara en ficha.
2. Pase puerta → banner con cara inmediata.
3. Eventos con foto.

## A medias

Portal empleado · ANPR · re-wire httpHosts.

## No tocar

Puente NAS · Traefik · Face ID inventado sobre RTSP.
