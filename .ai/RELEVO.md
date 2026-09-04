# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Identidad unificada ERP ↔ ACS

**Una persona = un código.** Sin Face ID inventado ni sync biométrico manual.

### Clave canónica

`User.employeeNumber` (+ `UserCompany.employeeNumber` del tenant)
**=** `IntegraPerson.personId` (ACS `employeeNo` / `employeeNoString`).

Roles en ERP. Actividades y asistencia híbrida resuelven al mismo `User`
cuando el código coincide con el del terminal.

### Entregado (identidad)

1. `IdentityLinkService` / `IdentityModule`
2. `GET integra/identity/me` · `candidates` · `POST/DELETE people/:id/link`
3. `listPeople`/`getPerson` con `erpUser` (nombre, rol, email)
4. Users: códigos ACS literales (sin expandir dígitos a NXR)
5. Personas: badges En ERP + Vincular/Desvincular; alta → link API
6. Portal empleado `/erp/my-profile`: nº ACS, estado Integra, híbrido del día

### Concurrente (siblings — ya en rama, no pisar)

- ACS fan-out en vivo (`IntegraAcsFanoutService`)
- Stock/compras PDF+Excel (kardex, GR, almacén)
- ERP rol→plantilla ACS · CRM cotizaciones · PTZ/live

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh`

### Verificar

1. Personas → Vincular/Desvincular ERP; badge rol.
2. Mi perfil → Integra + checador vs pases ACS.
3. Asistencia híbrida: `linked` si códigos iguales.
4. (Sibling) Alta ACS → push vivo sin Reconciliar.

Hard-refresh tras deploy.

## A medias

1. ANPR ITC · micros · TCPMSS · NVR httpHost.
2. FieldDetection re-wire si cambia PUBLIC_API_URL.
3. CaptureFaceData en sensor (si firmware Oficinas lo expone).
4. Hub `/erp/exports` cards stock (opcional).

## No tocar

Puente NAS, Traefik, credenciales.
**No** Face ID óptico inventado sobre AcuSense/RTSP.
