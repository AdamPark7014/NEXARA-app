# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Event ingest + API performance

Perfil prod (última hora): **VMD 10906 / duration 1857 / heartBeat 236 /
fielddetection 134 / ACS 58** · ~205 evt/min · tabla ~92k filas / 71 MB.

### Qué hay (API)

1. **Skip store** — `heartBeat`/`duration`/`VMD`/`videoloss` no se insertan
   ni emiten SSE (~97 % del tráfico medido).
2. **listEvents** — default excluye ruido; `scope=acs|noise|all`; `afterId` /
   `beforeId`; select lean; `outcome` granted/denied.
3. **SSE** — `publish` solo si hay oyentes (`Subject.observed`).
4. **Token cache** 30 s en `siteForToken`.
5. **Poda** — hourly wipe de ruido + nocturna business TTL 90 d.
6. **Índices** — `(companyId,id)`, `(siteId,id)`, major/occurredAt,
   eventType/occurredAt.
7. **`GET integra/push/events/stats`** — `entradas`/`denegados`/`unicos`/
   `enSitio` + aliases EN `granted`/`denied`/`uniquePersons`/`onSite`.

### Contrato Eventos UI sibling

- `GET integra/push/events?scope=acs&outcome=&afterId=&beforeId=`
- `GET integra/push/events/stats?siteId=`
- Overlay/poll: sin `scope` ⇒ útil (sin VMD); `scope=all` diagnóstico.

### Concurrente (siblings — no pisar)

Integra UX chrome · Eventos ACS UI · Business events ops/CRM · Face ACS ·
AcuSense FieldDetection · PTZ/vehicle · hybrid · stock/OC PDF · People.

### No toqué

FieldDetection XML (AcuSense). No reescribí UI Eventos del sibling.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `deploy/update.sh --force-all` (api + migrate)

### Verificar

1. Inserts/min caen (ACS + fielddetection).
2. `/push/events/stats` KPIs del día.
3. Poll `afterId` sin VMD; SSE sin flood.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. employeeNumber↔personId Oficinas.
3. go2rtc.yaml corruptible — streams en RAM.
4. FieldDetection re-apply tras sync/push.
5. Vaciar histórico VMD vía poda hourly.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado.
