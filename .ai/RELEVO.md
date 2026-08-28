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

## A medias — CUIDADO
- nada

## ⚠️ Riesgo abierto: Claudia puede resucitar
`apps/api/prisma/seed-demo-users.ts` **sigue conteniendo su entrada** y es un
upsert idempotente: quien corra `cd apps/api && npm run prisma:seed` la vuelve a
crear, con rol `ceo` y contraseña conocida. Lo mismo en
`scripts/generate-credentials-xlsx.js` (ese solo genera la hoja, no toca la BD).

**No se editaron esos archivos a propósito.** `seed-demo-users.ts` está en la
lista de «No tocar» de abajo desde el turno anterior. Se le preguntó a Adam si
quitarla del seed y **no zanjó la decisión**, así que se dejó intacto — el criterio
del protocolo es que un archivo vetado no se toca por iniciativa del agente.

➜ **Si el siguiente turno ve a Claudia otra vez en la BD, la causa es el seed, no
un error.** La decisión sobre el archivo sigue pendiente de Adam.

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

6. **Decidir qué pasa con la entrada de Claudia en el seed** (ver «Riesgo abierto»).
7. **Hallazgo suelto, no investigado:** `nexara-api` escupe 404 continuos de
   `GET /api/studio/page-content/seo_nosotros` y `seo_contacto` — «no tiene
   contenido publicado todavía». Es **anterior a este turno** y no tiene relación
   con el borrado, pero significa que dos páginas públicas se están sirviendo sin
   sus metadatos SEO.

## Estado verificado al cerrar
- Árbol de git **limpio** antes y después: este turno no cambia código.
- BD producción: `SELECT count(*) … WHERE id=35 OR nombre ILIKE '%claudia%'` → **0**.
- `chat_channel_members` y `user_companies` con `userId=35` → **0** y **0**.
- Contenedores `nexara-api`, `nexara-web`, `nexara-db`, `nexara-redis`: arriba.
