# Visitas recurrentes con acceso ACS limitado

Para **Oficinas NEXARA** (sitio ISAPI). El visitante queda enrolado en los
terminales con vigencia y horario; **puede entrar solo cuando llega** dentro de
esa ventana, sin abrir todas las puertas ni dejar acceso 24/7.

Sitios Artemis/HikCentral siguen usando la pestaña **Única** (cita + QR).

## Qué hace el sistema

1. Crea un usuario temporal en ACS (`employeeNo` `8……`, tipo visitante).
2. Escribe un **WeekPlan** (días + franja horaria) y lo enlaza con **RightPlan**.
3. Empuja `Valid.beginTime` / `Valid.endTime` (vigencia calendario).
4. Solo a las **puertas marcadas** (`targetIps` + `disableOthers`).
5. Opcional: sube **JPEG** de rostro a los DS-K1T.
6. Al **cancelar** o al **vencer** (cron horario), pone `Valid.enable=false`.

## Cómo usarlo (recepción / ops)

1. Abre **Integra → Visitas** (`/integra/visitors`).
2. Pestaña **Recurrente** (por defecto).
3. Completa:
   - **Nombre** del visitante
   - **Anfitrión** (empleado ACS, opcional)
   - **Puertas** (p. ej. Acceso General + Sala de Juntas)
   - **Horario del día** (ej. 09:00–18:00)
   - **Días** (atajos Lun–Vie / Todos)
   - **Vigencia** (desde / hasta, fechas)
   - **Foto JPEG** si usarán Face ID
4. Pulsa **Crear visita recurrente**.
5. Estado **En terminales** = ya puede presentarse en la puerta en la ventana
   autorizada. Si sale **Pendiente** o error, revisa fan-out / LAN.

### Cancelar

En la tabla derecha → **Cancelar**. Confirma: se apaga el acceso en ACS.

## Requisitos técnicos

| Ítem | Valor |
|------|--------|
| Sitio activo | `provider = ISAPI` (Oficinas) |
| Puente LAN | NAS Synology `192.168.9.32` / Tailscale `nas-nexara` |
| API | `GET/POST /api/integra/visitors/recurring` |
| Cancel | `POST /api/integra/visitors/recurring/:id/cancel` |
| Tabla | `integra_recurring_visitors` |

Migración: `20260904223000_integra_recurring_visitors`.

## No hacer

- No usar Recurrente en sitios solo Artemis (el API responde 400 y pide citas).
- No subir PNG: los terminales esperan JPEG.
- No inventar rutas ISAPI fuera de [INTEGRA-LAN](INTEGRA-LAN.md).
- No cambiar el puente NAS salvo que Adam lo pida por nombre.

## Verificación rápida

1. Alta con Lun–Vie 09–18, dos puertas, foto opcional.
2. Estado **En terminales**; evento de acceso en la ventana.
3. Fuera de horario o tras cancelar → denegado / `enable=false`.
