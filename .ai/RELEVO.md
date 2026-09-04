# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Identidad unificada ERP ↔ ACS

**Una persona = un código.** Sin Face ID inventado ni sync biométrico manual.

### Clave canónica

`User.employeeNumber` (y `UserCompany.employeeNumber` del tenant)
**=** `IntegraPerson.personId` (ACS `employeeNo` / `employeeNoString` del push).

Roles viven en ERP (`User.role` / `roleKey`). Actividades y asistencia híbrida
ya usan `User`; con el mismo código resuelven al mismo humano en puertas ACS.

### Qué cambió

1. **API** `IdentityLinkService` + `IdentityModule`:
   - `GET integra/identity/me` — portal empleado (estado vínculo + persona ACS)
   - `GET integra/identity/candidates` — candidatos ERP
   - `POST/DELETE integra/people/:id/link` — vincular / desvincular
   - `listPeople` / `getPerson` enriquecen con `erpUser` (nombre, rol, email)
2. **Users**: `normalizeEmployeeNumber` ya no convierte dígitos a `NXR25SYS###`
   (los códigos ACS literales se conservan). Auto-NXR solo si el campo viene vacío.
3. **UI Personas**: badges En ERP / rol; ficha con Vincular / Desvincular;
   alta unificada llama `…/link` para fijar la clave canónica.
4. **Portal empleado** (`/erp/my-profile`): nº empleado ACS, estado Integra,
   checador ERP vs pases ACS del día (híbrido self).

Push en vivo a terminales = sibling. Este turno = modelo DB/API + enlace UI.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh`

### Verificar

1. Personas → ficha: Vincular usuario ERP → badge «En ERP» + rol.
2. Misma persona: Desvincular → código limpio en User; terminal intacto.
3. Mi perfil: estado Integra + pases/checador de hoy.
4. Asistencia híbrida ERP: filas `linked` cuando códigos coinciden.

## A medias

1. ANPR ITC · micros · TCPMSS · NVR httpHost.
2. FieldDetection re-wire si cambia PUBLIC_API_URL.
3. CaptureFaceData en sensor (si firmware Oficinas lo expone).

## No tocar

Puente NAS, Traefik, credenciales.
**No** Face ID óptico inventado sobre AcuSense/RTSP.
