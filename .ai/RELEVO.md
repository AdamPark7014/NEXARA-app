# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-09
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — UX Actividades OPS (claridad + segmentación)

Plan: `ux_actividades_ops_05ca5884` — ola 1 **solo Web OPS**.

### Hecho

1. **Alta guiada** (`OpsActivityForm` + `ops-activity-form.ts`):
   - Modos **Con proyecto** / **Sin proyecto** con ayuda corta.
   - Payload: `activityType CLIENT` + `projectId` vs `INTERNAL` sin proyecto.
   - CTA `Crear OT` / `Asignar OT` vía `activitySubmitLabel`.
2. **Bandeja equipo** (`OpsActivitiesBoard`):
   - Segmentos Todas · Con proyecto · Sin proyecto.
   - Columna Proyecto (link o badge Sin proyecto).
   - Empty states por segmento + línea de ayuda del módulo.
3. **Mis OT** (`my-activities`):
   - Tabs «Mis OT» / «Evidencias»; rangos Hoy / Esta semana / Todas.
   - Leyenda 1→2→3; badges Con/Sin proyecto + siguiente acción.
4. **Detalle**: bloque Contexto (modo, proyecto, ticket, workType); estatus/prioridad canónicos (`Pendiente`…`Finalizada`, `Baja`…`Urgente`); stepper alineado.
5. **API**: `findAll` / `findOne` incluyen `project { id, title }`.
6. **Copy** en `section-views`: títulos «Órdenes de trabajo…» / «Mis OT».

`typecheck:web` y `typecheck:api` limpios.

### Fuera de esta ola

- Homologar Android/iOS al mismo modelo Con/Sin proyecto.
- Deploy Hetzner del fix RBAC viatics (hilo anterior) sigue pendiente si no se desplegó.

## Heredado vivo

- Demo store: `play.review@nexara.com.mx`; creds en `C:\dev\secrets\nexara-store\`.
- Enrollment Apple `49J96Q3WQ3`.
- No fingir EN VIVO en INTEGRA.

## No tocar

Puente NAS. Credenciales Apple. Contraseña del revisor fuera de git.
