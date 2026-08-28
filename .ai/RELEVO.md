# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-08-28
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Claudia Bernal eliminada de la BD de producción — SIN cambios de código
Encargo de Adam: quitar a Claudia de la base de datos de NEXARA. Se hizo por SSH
contra el droplet Hetzner (`5.78.215.109:2222`), contenedor `nexara-db`, BD
`nexara_db`. **Este turno no modifica ni un archivo del repo**; el commit existe
solo para dejar constancia del cambio en producción.

**Quién era:** `User` id **35**, `Claudia Bernal`, `claudia.bernal@nexara.com.mx`,
`employeeNumber` NX-010, `roleKey` **ceo**, alta 2026-07-22.

**Auditoría previa al borrado** (todo verificado, no asumido):
- `lastLoginAt` **vacío** — la cuenta nunca se usó.
- De las **130 claves foráneas** que apuntan a `"User"`, solo **2 tablas** tenían
  filas suyas, ambas `ON DELETE CASCADE`: `chat_channel_members` (2 — alta
  automática en `#general` y `#anuncios`) y `user_companies` (1 — empresa 1).
- Cero actividades, tickets, cotizaciones, evidencias, viáticos, asistencias.
- Rastreo de `ILIKE '%claudia%' OR '%bernal%'` sobre **todas** las columnas de
  texto del esquema `public`: solo aparecía en `User.nombre` y `User.email`.
  **No estaba en `PageContent`, `NewsPost`, `CaseStudy`, `HeroSlide` ni en
  ninguna tabla de contenido** — nunca se mostró en el sitio público; era una
  cuenta de acceso al ERP, no un dato editorial.

**Borrado:** 4 filas en una sola transacción (`BEGIN`/`COMMIT`), con el `DELETE`
del usuario acotado por `id = 35 AND email = 'claudia.bernal@nexara.com.mx'`.
Verificado a cero después. `nexara-api` y `nexara-web` siguen arriba y sin
errores nuevos en logs.

**Respaldo:** `/root/backups/claudia-user35-20260828-163758.sql` en el droplet
(INSERT de la fila, sacado con `pg_dump --column-inserts`). Es solo la fila de
`User`; las 3 filas cascadeadas no se respaldaron porque eran membresías
regenerables.

> Nota al margen, no accionada: tras el borrado quedan **3 cuentas con `roleKey`
> = `ceo`** — id 1 (Christian, real), id 2 (Adam, real) y id 36
> (`play.review@nexara.com.mx`, «Revisor Google Play»). Esa última tiene rol de
> dirección para pasar la revisión de la tienda. No se tocó; queda anotado por si
> Adam quiere bajarle el privilegio.

### Ariadna Sierra Gallardo (14) e Isaías García Bustamante (11) eliminados
Segundo encargo del mismo turno. **A diferencia de Claudia, estos dos SÍ estaban en
el organigrama oficial** de la migración `seed_nexara_team` (puestos 11 y 14), como
Ingenieros de Campo con `fechaIngreso` real de 2024. Se auditó antes de tocar.

| | Isaías (11) | Ariadna (14) |
|---|---|---|
| Email | isaias.garcia@nexara.com.mx | ariadna.sierra@nexara.com.mx |
| Nº empleado | NX-403 | NX-406 |
| `lastLoginAt` | vacío | vacío |
| Filas dependientes | 3 en 2 tablas | 13 en 6 tablas |

**Isaías** estaba limpio: solo membresías de chat (2) y de empresa (1), todas CASCADE.

**Ariadna tenía registros de asistencia con `ON DELETE RESTRICT`** — `Attendance` (2)
y `AttendanceDay` (1) —, más `LocationTracking` (3), `notifications` (4), chat (2) y
empresa (1). Se paró a examinarlos antes de borrar, porque RESTRICT es una protección
deliberada del esquema sobre datos laborales. **Resultaron ser datos de prueba, no
una jornada real:**
- Entrada `2026-07-09 01:54:46`, salida `01:55:18` → **32 segundos**, `totalMinutes = 1`.
- `deviceInfo`: «Escritorio (Windows Desktop)» — no un móvil de campo.
- Coordenadas `45.9057, -92.3575` → **Wisconsin, EE. UU.**, no México.
- Los 3 pings de `LocationTracking`: coordenadas idénticas, `actividadId` NULL,
  `estaActivo` false, misma marca de tiempo que la salida.
- Las 4 notificaciones son los avisos automáticos de ese mismo marcaje.

Contexto: en toda la BD **solo 3 usuarios tienen asistencia** (10, 13 y 14). El único
uso que parece real es el de id 13 (11 marcajes, junio–agosto).

Se le expuso el hallazgo a Adam y **reafirmó la orden** («vuélales todo»), así que se
borró el conjunto completo.

**Borrado:** 18 filas en una transacción, con las tablas RESTRICT primero (si no, el
`DELETE` del usuario falla) y los usuarios acotados por `id AND email`.
Verificación posterior recorriendo **las 130 claves foráneas** hacia `"User"`:
**0 filas residuales**. Quedan 15 usuarios.

**Respaldo doble** (esto sí era borrado con datos, no como Claudia):
- Esquema **`backup_20260828`** dentro de la propia `nexara_db`, con las 7 tablas y
  las 18 filas exactas. Sigue ahí: **no lo borres sin querer**.
- `/root/backups/ariadna-isaias-11-14-20260828-164244.sql` (40 KB, `--column-inserts`).

### Claudia restaurada y ocultada del equipo público — CAMBIO NO DESPLEGADO
Tercer encargo del turno: recrear a Claudia pero que **no se vea en la sección
«nosotros» del sitio público**.

**Restaurada** desde `/root/backups/claudia-user35-20260828-163758.sql`: `User`
id **35** idéntico al original (mismo `passwordHash`, misma `fechaCreacion`
2026-07-22), más sus 3 membresías recreadas a mano (empresa 1 + chat `#general`
y `#anuncios`). La secuencia `User_id_seq` sigue en 36, sin tocar.

**Por qué salía en «nosotros».** No estaba en ninguna tabla de contenido — eso ya
se había verificado. La sección se pinta desde `GET users/public-team`, que lee
**la propia tabla `User`**. Es decir: *cualquier alta en el ERP aparece en el sitio
público salvo que se excluya explícitamente*. Y como `findPublicTeam` ordena por
`fechaCreacion desc`, Claudia (alta 22-jul, la más reciente del equipo) salía
**la segunda tarjeta**, etiquetada «CEO». Verificado contra el endpoint en
producción antes y después.

**El arreglo** — `apps/api/src/users/users.service.ts`: se añade su email a
`excludedPublicTeamEmails`, que ya existía para esto mismo (`vendedor@` y los
super-admin). Es filtro **de servidor**, dentro del `where` de Prisma.

Se eligió el servidor y no `apps/web` a propósito: el filtro que hay en
`apps/web/app/(public)/nosotros/page.tsx:110` es un **regex sobre el nombre**
(`/revisor google play|reviewer|cuenta de prueba/i`). Basta con que alguien
renombre la cuenta desde el panel de RRHH para que reaparezca en el sitio. Hay un
test que fija justamente eso.

**Tests nuevos**: `apps/api/src/users/public-team-exclusions.spec.ts`, 4 casos
(exclusión de Claudia, no romper las exclusiones previas, seguir acotando por
empresa, y que el filtro no dependa del nombre).

## 🚩 ESTADO DE LAS EXCLUSIONES DEL EQUIPO PÚBLICO — leer entero

Adam pidió sacar de `/nosotros` a **Claudia Bernal** y a **Luis Joel Aguilar
Castillo**. Están en situaciones distintas y **hay que tratarlos distinto**.

### Claudia (id 35) — YA NO SE VE, pero por un atajo
`https://nexara.com.mx/nosotros` → 200 y **cero apariciones** de «Claudia»/«Bernal».
Verificado sobre el HTML servido, no solo sobre la API.

Está oculta porque **se le borró la fila de `user_companies`**, y `findPublicTeam`
exige `companyMemberships: { some: { companyId } }`. Sin membresía desaparece del
endpoint al instante, sin redesplegar. Se hizo así porque se pidió con urgencia.

Se pudo hacer **solo porque su cuenta nunca se ha usado** (`lastLoginAt` vacío).
Consecuencia: el usuario 35 existe pero no pertenece a ninguna empresa; si algún
día se le da acceso al ERP, fallará por falta de tenant.

### Luis (id 7) — SIGUE VIÉNDOSE. El atajo NO sirve con él
`direccion.operaciones@nexara.com.mx` (ojo: **no** es `luis.aguilar@`), NX-301,
Coordinador de Operaciones.

**Es un usuario vivo:** `lastLoginAt` = 2026-08-16, 6 sesiones, 13 registros de
auditoría, 7 notificaciones y **3 personas que le reportan** (`managerId = 7`).
Quitarle la membresía de empresa como se hizo con Claudia **le dejaría fuera del
ERP**. No se hizo, y no debe hacerse.

Aparecía además en **dos** sitios, no en uno:
1. El endpoint `users/public-team` (la tabla `User`).
2. **Hardcodeado** en `expertosFallback` de
   `apps/web/app/(public)/nosotros/page.tsx`, la lista que se pinta si la API
   falla. Filtrar solo el servidor no habría bastado.

Ambos corregidos en código y commiteados. **Para Luis no hay atajo: sin desplegar,
sigue saliendo en la web.**

### Lo que falta: UN despliegue resuelve los dos
El filtro por email (`excludedPublicTeamEmails`) ya cubre a Claudia y a Luis, con
tests. Falta llevarlo a producción:

- El servidor sirve `/var/www/nexara-app` siguiendo **`main`**, y `main` va
  **por detrás** de `mejora/calidad-y-web`.
- No se desplegó por cuenta propia porque `./deploy/update.sh` **reconstruye la
  imagen de la API y reinicia el ERP**, y eso afecta a gente trabajando (Luis
  mismo entró hace 12 días). Es decisión de Adam.

Pasos, **en este orden**:
1. Cherry-pick del commit del filtro sobre `main` (recomendado; fusionar la rama
   entera subiría también el turno del 27-ago) y `git push origin main`.
2. `cd /var/www/nexara-app && ./deploy/update.sh`
3. **Solo después**, devolverle a Claudia su membresía de empresa — con el filtro
   ya vivo, no vuelve a la web:
   ```sql
   INSERT INTO user_companies ("userId","companyId","isDefault","createdAt","employeeNumber")
   VALUES (35, 1, true, '2026-07-28 20:12:05.353', 'NX-010');
   ```

> Si se restaura la membresía **antes** de desplegar, Claudia reaparece en
> `/nosotros`. Ese error ya se cometió una vez.

> Ojo al desplegar: en el servidor hay 3 archivos sin commitear
> (`deploy/traefik/{arta,reading,school}.yml`), de otros proyectos del droplet.

## A medias — CUIDADO
- nada

## Hallazgo suelto: «Revisor Google Play» solo está oculto por el nombre
La cuenta id 36 (`play.review@nexara.com.mx`) **sí la devuelve** el endpoint
`public-team`; lo único que evita que se pinte es el regex de nombre en la web.
Tiene además `roleKey = ceo`. No se tocó — está fuera del encargo —, pero es la
misma clase de fragilidad que se acaba de arreglar para Claudia: se corrige
añadiendo su email a `excludedPublicTeamEmails`.

## ⚠️ Riesgo abierto: los tres pueden resucitar
`apps/api/prisma/seed-demo-users.ts` **sigue conteniendo la entrada de Claudia** y es
un upsert idempotente: quien corra `cd apps/api && npm run prisma:seed` la vuelve a
crear, con rol `ceo` y contraseña conocida. Lo mismo en
`scripts/generate-credentials-xlsx.js` (ese solo genera la hoja, no toca la BD).

**Ariadna e Isaías tienen además una segunda vía de retorno, más difícil de ver:**
están en la migración `apps/api/prisma/migrations/20260620120000_seed_nexara_team/`,
que los upserta por email. Esa migración ya está aplicada, así que no se re-ejecuta
sola en producción — pero **cualquier `prisma migrate reset`, o el levantar un entorno
nuevo desde cero, los recrea**. La migración no se tocó: reescribir una migración ya
aplicada rompe el historial de Prisma para todos los entornos.

**No se editaron esos archivos a propósito.** `seed-demo-users.ts` está en la
lista de «No tocar» de abajo desde el turno anterior. Se le preguntó a Adam si
quitarla del seed y **no zanjó la decisión**, así que se dejó intacto — el criterio
del protocolo es que un archivo vetado no se toca por iniciativa del agente.

➜ **Si el siguiente turno ve a cualquiera de los tres otra vez en la BD, la causa es
el seed o un reset de migraciones, no un error.** La decisión sobre esos archivos
sigue pendiente de Adam.

## No tocar
- `apps/web/app/(subdomains)/tickets/layout.tsx` — heredado de turnos anteriores.
- `NEXARA-credenciales-usuarios-v4.xlsx` — hoja de credenciales, no versionada.
- `apps/api/prisma/seed-demo-users.ts` — **17 contraseñas en claro de cuentas VIVAS
  de producción.** No rotar, no mover, no reescribir historial. El job `fugas` de
  `.github/workflows/ci.yml` lleva `continue-on-error: true` justo por esto:
  **dejarlo así** hasta que Adam decida. (Ver «Riesgo abierto» arriba: la entrada
  de Claudia vive aquí.)
- `package-lock.json` — el diff es enorme porque npm 11 renormaliza el fichero al
  instalar. Es ruido de formato, no de dependencias.

## Siguiente paso
Los cinco puntos del turno del 2026-08-27 siguen **intactos y sin empezar**:

1. **A1-2 · Playwright e2e de UI.** Vitest cubre unidades y componentes aislados;
   no hay ni un flujo de extremo a extremo. Empezar por login → selección de
   empresa → una ruta de cada panel.
2. **A1-6 · Observabilidad.** No hay APM, ni alertas, ni uptime para ~15 subdominios
   en producción. Ya existe `apps/api/src/observability/` para extender.
3. **A1-7 · Runbooks de incidente + manual de operador.** No existen.
4. **A1-8 · Cerrar `docs/native-parity-matrix.md`.** OJO, el encargo describía
   `apps/mobile` (Next/Capacitor) y en disco no existe: hay `apps/mobile-native`,
   que es Android/iOS nativo. Verificar contra la matriz antes de dar por cerrado.
5. **Deuda de producto** en `docs/DEUDA-TECNICA.md`: NOC con datos sintéticos, PAC
   en modo mock, SCIM anunciado sin implementar, notificaciones de comida sin
   WebSocket, y 3 ficheros muertos con 0 referencias.

Y añadido este turno:

6. **Decidir qué pasa con las entradas de Claudia, Ariadna e Isaías** en el seed y en
   la migración `seed_nexara_team` (ver «Riesgo abierto»). Ninguno de los dos archivos
   se tocó este turno.
8. **Purgar el esquema `backup_20260828` de `nexara_db`** cuando Adam confirme que no
   hace falta revertir. Mientras exista, los datos borrados siguen dentro de la BD.
7. **Hallazgo suelto, no investigado:** `nexara-api` escupe 404 continuos de
   `GET /api/studio/page-content/seo_nosotros` y `seo_contacto` — «no tiene
   contenido publicado todavía». Es **anterior a este turno** y no tiene relación
   con el borrado, pero significa que dos páginas públicas se están sirviendo sin
   sus metadatos SEO.

## Estado verificado al cerrar
- Árbol de git **limpio** antes y después: este turno no cambia código.
- BD producción, Claudia: `User` id 35 **existe**, con sus 2 membresías de chat y
  **sin** membresía de empresa (ver «Claudia: oculta en producción»).
- BD producción, Ariadna e Isaías: barrido de las 130 FKs hacia `"User"` buscando
  `IN (11,14)` → **0 filas residuales**; `"User" WHERE id IN (11,14)` → **0**.
- `"User"` queda en **16** filas (18 − Ariadna − Isaías + Claudia restaurada).
  Alejandro González **Bustamante** (id 15) salió en la búsqueda inicial por el
  apellido y **NO se tocó**: no era objetivo.
- `npx tsc --noEmit -p apps/api/tsconfig.json` → limpio.
- API: **71 suites / 513 tests** en verde (antes 70 / 509).
- `GET users/public-team` en producción **ya no devuelve a Claudia**; su hueco lo
  ocupa Karen Elizalde. Comprobado sobre el HTML servido de `/nosotros`.
- **Luis sigue apareciendo en producción**: su exclusión es código sin desplegar.
- API: **71 suites / 514 tests** en verde. Web: **10 ficheros / 99 tests**.
- `npx tsc --noEmit` limpio en `apps/api` y en `apps/web`.
- Contenedores `nexara-api`, `nexara-web`, `nexara-db`, `nexara-redis`: arriba.
