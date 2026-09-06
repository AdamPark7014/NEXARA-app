# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-06
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Ola post mega-plan (huecos)

### Web RBAC
- `AppShell` consume `GET /api/me/navigation` (paths + moduleKeys) con fallback local.
- `me-navigation.ts` usa `buildApiUrl("me/navigation")`.

### Tickets portal
- API: `POST client-portal/tickets/:id/comments`, `PATCH …/status` (ACK / CONFIRM_RESOLVED / REQUEST_REOPEN).
- Android detalle OT: comentarios + acciones.
- Fix web bug: `PATCH client-ticket-requests/:id` notas.

### Vehículos
- `VehicleCheckoutSheet` 9 fotos → start-use / end-use.

### Cascarones → operar
- Companies create/edit; banking cuentas; accounting pólizas.
- Catalog/matriz: users, hr, fines, documents, my-viatics, accounting, banking, companies → NATIVO.

### INTEGRA Bloque 2 ligero
- Alarmas (ack/clear), occupancy, devices, sites lista.
- `ModulePanelMap` + deep links para claves nuevas.

### Verificación
- `:app:compileDebugKotlin` OK.
- `python scripts/check-app-web-parity.py` OK.

## A medias / Adam

1. **Desplegar** Traefik/API P0 → `/go2rtc/api/streams` 404; rotar passwords.
2. AAB Play VERSION_CODE 7+.
3. INTEGRA video/ANPR/mapa/detección = Bloque 2.
4. Portal sucursal: comentarios OT aún no (solo client-portal).
5. Cascarones restantes: vehicles admin, employee-payments, work-projects, dispatch polish, newsletter admin.

## No tocar

Puente NAS. Credenciales en repo. No inventar ANPR/ISAPI. No hls.js CDN.
