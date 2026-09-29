# Semáforo de actividades

El color de una tarjeta (pizarra `/erp/pizarra`, Mi equipo, listados de operaciones y la sección de actividades de un proyecto) lo decide el reloj, no la prioridad. La prioridad sigue en su propio chip (Alta / Media / Baja). El borde izquierdo, el chip de plazo y el aro de la persona usan estas reglas.

La función canónica es `evaluarSemaforo` en `apps/api/src/activities/semaforo-actividad.ts`. La web la espeja en `evaluarSemaforoActividad` (`apps/web/lib/actividad-tiempos.ts`) para los listados que no reciben el campo del servidor. Umbral único: `UMBRAL_POR_VENCER_MIN = 30`.

## Cuándo es cada color

| Color | Chip | Cuándo |
| --- | --- | --- |
| Rojo `#dc2626` | `Atrasada · {tiempo}` | Pasó `fechaInicio` y nadie la ha iniciado, **o** pasó el tope y no está terminada, **o** ya lleva más tiempo real trabajado del que se planeó (`horasPlan`). El chip usa el atraso mayor de los tres. |
| Naranja `#d97706` | `Atención · {tiempo}` si falta el inicio; `Por vencer · {tiempo}` si falta el tope | Faltan 30 minutos o menos para ese instante y todavía no es roja. Si los dos están cerca, gana el que llega antes. |
| Azul `#2563eb` | `En tiempo` y, si se puede iniciar, `Sin iniciar` | En tiempo y todavía no arranca. |
| Verde `#16a34a` | `En tiempo` | En tiempo y ya arrancó (`inicioRealAt` o estatus en proceso / por validar). |

Sin fechas no hay con qué atrasarse: queda en tiempo. Cerrada, cancelada o con `finRealAt` vuelve a verde aunque el tope ya haya pasado. El KPI `aTiempo` sigue en falso si se entregó después del límite; el recuadro no se queda rojo.

## Qué cuenta como tope y como inicio

- **Inicio programado:** `fechaInicio`.
- **Tope:** el más temprano entre `fechaMaxima` y `fechaEntregaEsperada`.
- **Periodo de varios días:** el tope es el fin del último día (`finDelPeriodo`, America/Mexico_City), no la hora citada del primer día. Antes del primer día está programada y se ve en tiempo aunque la prioridad sea alta. Pasada la hora de inicio del primer día, si no arrancó, es roja.
- **Arrancó** (para no pintar «pasó el inicio»): hay `inicioRealAt` en quien la hace, o el estatus coincide con proceso / validar. En la pizarra se usa el tiempo real de esa persona.
- **Pasar el tiempo estimado también pinta roja la tarjeta** (`minutosPlan`/`minutosReales` en `evaluarSemaforo`, motivo `plan`). En una actividad de varios días el plan es de una jornada y el reloj corre de corrido, así que no cuenta para esto (mismo criterio que `excedida`). Exceder el plan también deja `excedida: true` en el DTO y sigue mandando aparte el aviso que ya existía (`alertaExcesoAt`, cada 15 min, tipo `ACTIVITY_OVERTIME` — no es el mismo aviso que el de abajo). **El cron de abajo (`ACTIVITY_OVERDUE`, campana/push a jefe y coordinación) no cambió**: solo mira `fechaInicio`, el tope y el fin de periodo, así que una actividad roja *solo* por exceso de plan (sin ninguna fecha vencida) se ve roja en la pantalla pero no dispara ese aviso.

## Avisos al pasar a rojo

El cron `actividades-atrasadas` (`*/5 * * * *`, `ActivityOverdueAlertsService`) revisa las abiertas cuyo inicio, tope o fin de periodo ya pasó, o que ya tienen marca de aviso. Si están en rojo y no se avisó (o ya toca el recordatorio), manda campana y push con `createNotification` (`type: ACTIVITY_OVERDUE`, prioridad alta, canal `ops`, ícono `vencida`). El push usa lo que ya hay: Web Push (VAPID) y FCM. No hay un canal nuevo.

El título es `Actividad atrasada`. Al responsable y a quien está asignado: «Tu actividad {AN} · {título} está atrasada. Asegúrate de cumplirla en tiempo y forma.» Al jefe directo y a la coordinación: «La actividad {AN} · {título} de {nombre del responsable} está atrasada.» `relatedUrl` es `/erp/actividades/{id}`: al tocar el push (web, Android o iOS) o la campana se abre esa actividad.

Destinatarios, de la misma empresa: responsable y asignados activos, el jefe directo de cada uno (`managerId`, no la cadena) y la coordinación del mismo departamento (`coord_operaciones`, `coord_admin`, `coord_ventas`, `enc_soporte`, `lider_diseno`, y el correo `jose.ramirez@nexara.com.mx`).

`Activity.overdueAlertedAt` se escribe después de al menos un aviso y se borra cuando deja de estar en rojo, para que un atraso nuevo vuelva a avisar. No se reutiliza `slaAlertedAt` (ese campo es el de tickets).

Recordatorio: ajuste por empresa (o de plataforma, `companyId` nulo) en `system_settings`:

```sql
INSERT INTO system_settings (key, value, category, "companyId", "updatedAt")
VALUES ('activities.overdue_reminder_hours', '4', 'activities', 1, NOW())
ON CONFLICT (key, "companyId") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW();
```

`0`, vacío o ausente = una sola vez al entrar en rojo. Tope: 168 horas.

El cron no tiene request: el middleware de empresa no filtra solo. Cada lectura y cada `updateMany` lleva `companyId`. No se usa `findUnique` sobre `activityId_userId`.

## Variables en el servidor

No hay variables nuevas. Si el push ya está configurado, este aviso sale por el mismo camino. Si no:

1. En el servidor, dentro del API: `cd apps/api && npm run generate:vapid`.
2. En el entorno del API (`deploy/.env.nexara` o el que inyecte el compose):
   - `WEB_PUSH_VAPID_PUBLIC_KEY`
   - `WEB_PUSH_VAPID_PRIVATE_KEY`
   - `WEB_PUSH_CONTACT` (opcional; si falta, `mailto:soporte@nexara.com.mx`)
   - `FIREBASE_SERVICE_ACCOUNT_JSON` solo si también deben llegar al APK por FCM
3. En el build de la web, la misma clave pública: `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`. Sin ella la campana sigue; el push con la pestaña cerrada no.
4. Cada persona acepta el permiso del navegador (el registro vive en `ConsoleWebPushRegister`).

Migración: `20260928200000_actividad_atrasada` (`overdueAlertedAt` y el valor `ACTIVITY_OVERDUE`). Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
