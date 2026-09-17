# Semana demo

Tres scripts para dejar NEXARA Core con una semana de operación creíble sobre los usuarios reales, y
quitarla después sin tocar nada más.

| Script | Qué hace |
|---|---|
| `purgar-operacion.js` | Borra la operación de una empresa: actividades (evidencias, equipo, revisiones, reasignaciones, geocerca), clientes, asistencia, comidas, GPS, chat y notificaciones. No toca usuarios, roles, empresa, RH, sesiones ni `audit_logs`. Conserva `#general` y `#anuncios`. |
| `sembrar-semana.js` | Siembra la semana del lunes a hoy (hora de México): 10 clientes en Puebla con coordenadas, 26 actividades en todas las etapas con fotos y hoja PDF de relleno, asistencia (retardos y una falta), comidas a destiempo, GPS, salidas de zona (una justificada), chat y notificaciones. |
| `purgar-demo.js` | Borra exactamente lo sembrado, según el manifiesto del lote, y la carpeta de fotos. |

Los tres **simulan por defecto** e imprimen conteos. Solo escriben con `CONFIRMAR=SI`, y lo hacen en
una transacción: si algo falla, no queda nada a medias.

## Cómo se marca lo sembrado

`sembrar-semana.js` guarda los ids de todo lo que crea, por modelo, en el volumen de uploads:

```
/app/uploads/demo/<LOTE>/manifest.json
/app/uploads/demo/<LOTE>/0001-entrada.png …
```

El lote por defecto es `demo-AAAAMMDD`. No se crean tablas ni se modifica el esquema. Si falla la
escritura del manifiesto, el script imprime el JSON en consola para guardarlo a mano.

## Orden de operación (en el servidor)

La imagen de la API no incluye `scripts/`: cada script entra por stdin. Se corre desde la raíz del
repositorio en el servidor.

1. **Respaldo completo** (obligatorio antes de purgar):

   ```bash
   docker exec nexara-db pg_dump -U $POSTGRES_USER -Fc nexara_db > /root/backups/nexara-$(date +%Y%m%d-%H%M).dump
   ```

2. **Purgar la operación**, primero en simulación y luego de verdad:

   ```bash
   docker exec -i -w /app/apps/api nexara-api node - < apps/api/scripts/demo-semana/purgar-operacion.js
   docker exec -i -e CONFIRMAR=SI -w /app/apps/api nexara-api node - < apps/api/scripts/demo-semana/purgar-operacion.js
   ```

3. **Sembrar la semana**, igual:

   ```bash
   docker exec -i -w /app/apps/api nexara-api node - < apps/api/scripts/demo-semana/sembrar-semana.js
   docker exec -i -e CONFIRMAR=SI -w /app/apps/api nexara-api node - < apps/api/scripts/demo-semana/sembrar-semana.js
   ```

4. **Quitar la demo** cuando haga falta:

   ```bash
   docker exec -i -w /app/apps/api nexara-api node - < apps/api/scripts/demo-semana/purgar-demo.js
   docker exec -i -e CONFIRMAR=SI -w /app/apps/api nexara-api node - < apps/api/scripts/demo-semana/purgar-demo.js
   ```

## Variables

Todas se pasan con `-e NOMBRE=valor` en `docker exec`.

| Variable | Script | Uso |
|---|---|---|
| `CONFIRMAR=SI` | todos | Escribe o borra. Sin ella solo simula. |
| `COMPANY_ID` | purgar-operacion, sembrar | Empresa. Por defecto la principal (`company_profile.isPrimary`). |
| `LOTE` | sembrar, purgar-demo | Nombre del lote. Por defecto `demo-AAAAMMDD`. purgar-demo lo toma solo si hay uno. |
| `TODOS=SI` | purgar-demo | Purga todos los lotes encontrados. |
| `SEMILLA` | sembrar | Azar determinista (42). Misma semilla y hora, mismo resultado. |
| `OFICINA_LAT`, `OFICINA_LNG` | sembrar | Punto de checada de entrada y salida. Por defecto el centro de Puebla. |
| `SIN_GPS_EN_CURSO=SI` | sembrar | Las actividades abiertas no llevan GPS de entrada. Así la geocerca real no mide teléfonos contra ellas. |
| `BORRAR_GASTOS=SI` | purgar-demo | Si alguien registró gastos o vehículos sobre actividades demo (bloquean el borrado). |

## Antes de aplicar

- **Avisos reales.** Las actividades demo quedan asignadas a personas reales y aparecen en sus apps.
  Mientras sigan abiertas, la geocerca y el cron de SLA de la API pueden mandar avisos reales sobre
  ellas. `SIN_GPS_EN_CURSO=SI` evita las alertas de zona. purgar-demo también borra esos avisos
  posteriores.
- **Asistencia existente.** Si alguien ya checó en la semana, el script respeta ese día y no siembra
  asistencia ni comida para esa persona.
- **Justificación de falta y cancelación con motivo.** Solo se escriben si la base ya tiene la tabla
  `attendance_justifications` y las columnas `Activity.cancelReason/cancelledAt/cancelledById`. Si no
  existen, se omiten sin error.

## Autoprueba local (sin base de datos)

```bash
node apps/api/scripts/demo-semana/sembrar-semana.js --autoprueba
```

Genera la semana en cinco momentos distintos (jueves por la tarde, jueves a las 7 a. m., lunes,
sábado y domingo) y comprueba lo siguiente:

- que nada ocurra en el futuro,
- que la asistencia sea coherente,
- que la salida quede a menos de 100 m de la entrada,
- que haya 2 o 3 alertas de zona con una justificada,
- que todas las referencias existan,
- que la misma semilla dé el mismo resultado.
