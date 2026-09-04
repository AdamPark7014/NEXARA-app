# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Identidad ERP↔ACS + fan-out en vivo

**Una persona = un código.** Sin Face ID inventado ni sync biométrico manual.

### Clave canónica (identidad)

`User.employeeNumber` (y `UserCompany.employeeNumber` del tenant)
**=** `IntegraPerson.personId` (ACS `employeeNo` / `employeeNoString` del push).

Roles en ERP (`User.role` / `roleKey`). Actividades y asistencia híbrida usan
`User`; con el mismo código resuelven al mismo humano en puertas ACS.

### Identidad — API / UI (este agente)

1. `IdentityLinkService` + `IdentityModule`
2. `GET integra/identity/me` · `GET integra/identity/candidates`
3. `POST/DELETE integra/people/:id/link`
4. `listPeople` / `getPerson` → `erpUser` (nombre, rol, email)
5. Users: códigos ACS literales (ya no se expanden dígitos a NXR)
6. Personas: badges En ERP + Vincular/Desvincular; alta unificada llama link
7. Portal empleado `/erp/my-profile`: nº ACS, estado Integra, híbrido del día

### Fan-out en vivo (sibling push — no pisar)

1. Personas alta/editar/Face/baja → UserInfo + FaceDataRecord a todos los ACS
2. ERP create/update employeeNumber / HR isActive → push ISAPI
3. `IntegraAcsFanoutService` + cola retry + `GET integra/acs-fanout/status`
4. Sync UI → «Reconciliar» (no es paso obligatorio)

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh`

### Verificar

1. Personas → Vincular ERP → badge «En ERP» + rol; Desvincular limpia código.
2. Mi perfil → estado Integra + checador vs pases ACS.
3. Alta/foto persona → OK por IP sin Reconciliar (fan-out).
4. Asistencia híbrida: `linked` cuando códigos coinciden.

## A medias

1. ANPR ITC · micros · TCPMSS · NVR httpHost.
2. FieldDetection re-wire si cambia PUBLIC_API_URL.
3. CaptureFaceData en sensor (si firmware Oficinas lo expone).

## No tocar

Puente NAS, Traefik, credenciales.
**No** Face ID óptico inventado sobre AcuSense/RTSP.
