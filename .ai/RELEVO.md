# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Espacios / puertas (política de uso + vigencia)

Adam: tiempo de uso en **todos** los espacios (no solo Sala de juntas):
indefinido vs temporal, plantillas, entradas en vivo. Coordinado con
sibling **Horarios ACS** (`/integra/schedules` + `access-schedules`).

### Qué hay

1. **No hay booking ERP de salas** — el calendario ERP agrega CRM/OT/
   mantenimiento; `reuniones` son actas. Capacidad nueva en Integra.
2. **Prisma** — `IntegraRoomBooking` (ventanas de uso) +
   `IntegraSpacePolicy` (plantilla por puerta). Migraciones
   `20260904200000_*` / `20260904210000_*`.
3. **API** — `GET /integra/spaces` (todas las puertas: conteos
   indefinido/temporal/vencido, última entrada, próxima ventana);
   `GET/PUT …/spaces/:doorId[/policy]`; CRUD
   `spaces-bookings`. Alias UI Horarios: `GET/PATCH /integra/schedules*`.
4. **UI** — `/integra/espacios` (ES): lista de espacios, plantilla,
   quién entra (Valid), programar uso, vivos. Links a Horarios ACS /
   Personas / Accesos. Nav: access-matrix + chrome + caps + home cards.
5. **Sibling Horarios** — empuja Valid/RightPlan/week plans al ACS;
   Espacios lee espejo + reservas + push events. No pisar su UI.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `./deploy/update.sh --force-all --with-migrate`

### Verificar (hard refresh)

1. `/integra/espacios` — 4 puertas Oficinas; KPIs indefinido/temporal.
2. Seleccionar Sala de juntas → personas + programar uso + últimos
   accesos.
3. «Horarios ACS» abre `/integra/schedules?view=door&door=…`.
4. Migraciones room_bookings + space_policies aplicadas en prod.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Alias `integra/schedules` vs `access-schedules` — unificar del todo
   si el sibling aún usa fallbacks.
3. Plantillas Espacios aún no empujan solas al ACS (eso es Horarios).
4. Backfill notifications.companyId · FieldDetection re-apply.

## No tocar

Puente NAS, Traefik, credenciales.
Face ID óptico inventado. No pelear Personas CRUD face, PTZ pad,
hybrid attendance renderer, OC PDF, Integra push hotpath.
