# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Event ingest + API performance

Perfil prod (última hora): **VMD 10906 / duration 1857 / heartBeat 236 /
fielddetection 134 / ACS 58** · ~205 evt/min · tabla ~92k filas / 71 MB.
Sin filtrar, list/SSE se ahogan y los accesos de negocio dejan de verse snappy.

### Qué hay (API)

1. **Skip store** — `heartBeat`/`duration`/`VMD`/`videoloss` no se insertan
   ni emiten SSE (~97 % del tráfico medido).
2. **listEvents** — default excluye ruido; `scope=acs|noise|all`; `afterId` /
   `beforeId`; select lean; `outcome` granted/denied.
3. **SSE** — `publish` solo si hay oyentes (`Subject.observed`); sin Subject
   fantasma bajo carga.
4. **Token cache** 30 s — evita 1 SELECT/evento a 200/min.
5. **Poda** — hourly wipe de ruido histórico + nocturna business TTL 90 d.
6. **Índices** — `(companyId,id)`, `(siteId,id)`, `(companyId|siteId,major,
   occurredAt)`, `(siteId,eventType,occurredAt)`.
7. **`GET integra/push/events/stats`** — KPI hoy:
   `entradas`/`denegados`/`unicos`/`enSitio` + aliases EN
   `granted`/`denied`/`uniquePersons`/`onSite`.

### Contrato Eventos UI sibling

- Lista: `GET integra/push/events?scope=acs&outcome=&afterId=&beforeId=`
- KPIs: `GET integra/push/events/stats?siteId=`
- Overlay/poll: sin `scope` ⇒ útil (sin VMD); `scope=all` solo diagnóstico.

### Concurrente (siblings — no pisar)

Eventos UI ACS · Business events ops/CRM · Face ACS · PTZ/vehicle ·
hybrid attendance · stock/OC PDF · People identity.

### No toqué

FieldDetection XML (AcuSense sibling).

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `deploy/update.sh --force-all` (api + migrate)

### Verificar

1. Tras deploy: inserts/min caen (casi solo ACS + fielddetection).
2. `GET .../push/events/stats` → números del día.
3. Poll `afterId` sin VMD; SSE sin flood de motion.
4. Eventos UI sibling con `scope=acs` + strip KPI.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Alinear employeeNumber↔personId Oficinas.
3. go2rtc.yaml corruptible — streams en RAM.
4. FieldDetection re-apply tras sync/push install.
5. Purgar histórico VMD restante en lotes hourly (hasta vaciar).

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
Face ID óptico inventado. No pelear PTZ / Personas / hybrid / stock / OC PDF.
