# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Visitas recurrentes ACS (acceso limitado al llegar)

Feature ya en disco (UI + servicio + migración) pero **sin cablear** al Nest
module/controller — por eso agentes previos abortaban con zero work usable.

### Qué hay

1. **API cableada** — `IntegraRecurringVisitorsService` en module; endpoints
   `GET/POST /integra/visitors/recurring`, `POST …/:id/cancel`, `DELETE` alias.
2. **Push ACS** — WeekPlan + RightPlan por doorNo, UserInfo visitor, face JPEG
   opcional; cancel/expire → `Valid.enable=false`.
3. **How-to ES** — `docs/INTEGRA-VISITAS-RECURRENTES.md` (+ link en INTEGRA-OPS).
4. **`nest build`** OK tras prisma generate.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `bash deploy/update.sh --force-all --with-migrate`

### Verificar

1. Migración `integra_recurring_visitors` aplicada en prod.
2. Contenedores Up; hard refresh `/integra/visitors` pestaña Recurrente.
3. Alta test Lun–Vie → estado **En terminales**; cancel apaga ACS.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Features sibling (Espacios UI, Horarios ACS, presence, SOC) — compilan;
   validar en prod aparte.
3. FieldDetection re-apply · employeeNumber↔personId Oficinas.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado.
