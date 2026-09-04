# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Estabilizar build API (desbloqueo deploy)

WIP concurrente de siblings rompía `nest build` / deploy Hetzner.
Sin expandir features: solo tipos, imports y stubs incompletos.

### Qué hay

1. **`npx prisma generate`** — cliente al día con SpacePolicy / RoomBooking /
   SocAlarm / acsEnteredAt (schema ya en disco).
2. **Compile fixes** — `normalizeEmpKey` import en `acs-ops-bridge`;
   narrowing `doorRole` en `integra-event-router`; plantillas schedules
   tipadas en controller; `filter` null-safe en `integra-spaces.detail`
   people.
3. **`nest build` apps/api** — OK (exit 0) tras clean dist.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `bash deploy/update.sh --force-all`

### Verificar

1. Contenedores `nexara-api` / `nexara-web` Up.
2. Logs API: Nest started / sin crash loop.
3. Hard refresh panels no 502.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Features sibling (Espacios UI, Horarios ACS, presence, SOC alarms) —
   compilan; no validadas en prod en este turno.
3. FieldDetection re-apply · employeeNumber↔personId Oficinas.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado.
No pelear hotpath push / PDF / PTZ del sibling mientras deploya.
