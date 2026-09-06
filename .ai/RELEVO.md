# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-06
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Paridad móvil 3 olas (falso NATIVO → operable)

### Ola 1 — Mesa de dinero + evidencias
- Employee-payments: create (multipart) / edit / delete / `PATCH …/pagado` + UI.
- Viáticos y gastos: botón **Marcar pagado**.
- Evidencias: reject multi-paso (`rejectedSteps[]`) + `resetFullFlow`.
- Catálogo: `employee-payments` → NATIVO.

### Ola 2 — Sitio / sucursal / contratos
- Nest `branch-portal`: `POST tickets/:id/comments`, `PATCH tickets/:id/status` (ACK / CONFIRM_RESOLVED / REQUEST_REOPEN) + notify hierarchy; stamp `[SUCURSAL …]`.
- Android `BranchPortalApi` + `TicketsRepository` (sin throws).
- INTEGRA people: POST/PATCH/DELETE + face upload/delete + UI alta/ficha.
- Maintenance-contracts: create / status / visits generate-ot / complete → NATIVO.

### Ola 3 — CRM / gov / honestidad
- CRM proyectos: PATCH status, costos, close → NATIVO.
- CVs/recruiting: create multipart + move stage → NATIVO (`RecruitingScreen`).
- Documents: approve (+ archive si aplica) en UI.
- Support: notes PATCH (create ops no existe en Nest `client-ticket-requests`).
- Settings: company api-keys + webhooks list/replay mínimo.
- `work-projects` → `ConsoleProjectsScreen` (OPS, no portfolio).
- Catálogo: my-profile NATIVO, newsletter SOLO_LECTURA, multas NATIVO.

### Verificación
- `:app:compileDebugKotlin` OK.
- `python scripts/check-app-web-parity.py` → OK (matriz ↔ catálogo).

## A medias / Adam

1. **Desplegar** Traefik/API P0 → `/go2rtc/api/streams` 404; rotar passwords + migrar `ACTIVITY_STARTED`.
2. AAB Play VERSION_CODE 7+.
3. Support **create** staff: Nest no tiene POST en `client-ticket-requests` (solo portal/branch).
4. DomainNotify facade formal (hierarchy shortcuts ya cubren portal).
5. INTEGRA video/ANPR/mapa = Bloque 2; FP/schedules/espacios fuera de esta ola.

## No tocar

Puente NAS. Credenciales en repo. No inventar ANPR/ISAPI. No hls.js CDN.
