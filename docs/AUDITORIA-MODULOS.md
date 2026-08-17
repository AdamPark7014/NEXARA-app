# Auditoría módulo por módulo

Barrido completo de los ~80 módulos de `apps/api/src` buscando defectos de
correctitud, aislamiento entre empresas y seguridad. Cada hallazgo se comprobó
contra la base de producción antes de corregirlo, y cada corrección se probó
contra ella dentro de una transacción revertida antes de aplicarse.

## Lo corregido

### Folios duplicados — caída completa de facturación

Once servicios generaban su folio con `count() + 1` sobre la tabla destino.

`Invoice` y `PurchaseOrder` están en `SOFT_DELETE_MODELS`, y el middleware de
Prisma añade `deletedAt: null` a las lecturas, **`count` incluido**
(`prisma.service.ts:246`). Al borrar una factura el contador **retrocedía** y el
siguiente folio chocaba con uno que seguía existiendo en la tabla. No se
recuperaba solo: cada intento posterior generaba el mismo número y fallaba
igual. El disparador era un borrado normal.

Sustituido por un contador atómico (`FolioCounter`) sembrado desde el máximo
existente, contando las filas borradas — que es justo lo que el `count()` viejo
no veía.

### Carreras de leer‑modificar‑escribir

Tres sitios leían un valor, calculaban y escribían el resultado **absoluto**.
Dos peticiones simultáneas leen lo mismo, calculan lo mismo y escriben lo mismo,
así que una de las dos operaciones se pierde:

| Dónde | Síntoma |
|---|---|
| `releaseReservation` | stock que quedaba reservado para siempre, bloqueando ventas |
| `createReservation` | `reservedQty` por encima de `quantity`: la misma pieza vendida dos veces |
| `deliver` (herramientas) | la misma herramienta física asignada a dos personas |

En los tres la condición pasó a viajar **dentro** del `UPDATE`, que Postgres
reevalúa al aplicar la fila.

### Claves foráneas de otra empresa

El aislamiento por empresa vive en un middleware que inyecta `companyId` en los
`where`. Un `create` escribe las claves foráneas tal cual, así que
`debitAccountId` llegaba del cuerpo de la petición y nadie miraba de quién era:
se podía asentar contra el catálogo de cuentas de otra empresa —descuadrando sus
libros— y, probando ids, deducir qué cuentas existen. Igual en facturas
(`clientId`, `supplierId`, productos), compras y contratos.

`assertRefsBelongToCompany` comprueba en bloque, una consulta por modelo. El
mensaje **no distingue** "no existe" de "es de otra empresa": distinguirlo lo
convertiría en un buscador de los datos ajenos.

### CFDI que no cuadraba al centavo

El SAT valida que `TotalImpuestosTrasladados` sea la suma de los `Importe`
impresos en los conceptos. El constructor imprimía cada concepto **redondeado**
pero sumaba a **plena precisión**.

Tres renglones de $33.34 con IVA 16%: cada uno imprime 5.33 (suman 15.99), el
total imprime 16.00. Un centavo, y el PAC rechaza el timbrado con un error que
no explica nada. No hacen falta cifras raras.

Ahora cada importe se redondea una sola vez, al construir el concepto, y los
totales suman valores ya redondeados.

### La jornada laboral se medía en UTC

El contenedor corre en UTC y el código calculaba el día con hora local, que ahí
**es** UTC. Con la empresa operando en México eso parte jornadas normales en dos.

**10 de 15 registros** caían en un día distinto según se midiera de una u otra
forma. `attendance_days` arrastraba el error, y de su `totalMinutes` sale
directamente la nómina:

| | Antes | Después |
|---|---|---|
| Minutos totales | 45 472 (758 h) | **194** |
| Jornada más larga | 710 h | 3.2 h |
| Marcadas abiertas | 0 | 2 |

Esa jornada de 710 horas era una entrada del 16‑jul cuya siguiente salida es del
15‑ago. Además, una jornada abierta acumulaba tiempo indefinidamente; ahora se
corta al final de su propio día.

El mismo desfase estaba en analytics ("hoy" incluía seis horas de ayer), GPS (el
recorrido de la tarde desaparecía del mapa) e incidencias.

### Subidas que podían ejecutar código

Los veinte puntos de subida generan el nombre en el servidor —bien— pero toman
la **extensión del nombre original**, y varios sólo validan `file.mimetype`, que
lo pone el cliente. Un `.svg` enviado como `image/png` pasaba el filtro de "sólo
imágenes" y luego se servía como `image/svg+xml`: un SVG puede llevar `<script>`
dentro, y eso es JavaScript en el origen de la API.

`nosniff` no lo evitaba — el tipo no se adivinaba, se declaraba. Se cerró al
**servir**, que es el único sitio por el que pasan los veinte puntos de entrada
y además los archivos que ya llevaban tiempo en disco.

### SSRF en webhooks

`assertUrl` sólo comprobaba el protocolo. Un webhook podía apuntar a
`http://nexara-db:5432`, a otro contenedor del mismo host —hay cuatro proyectos
de clientes más— o a `169.254.169.254`. Y la respuesta **se guarda y se muestra**
en el registro de entregas: servía para *leer* de la red interna.

Se valida al guardar y otra vez al entregar, con el nombre ya resuelto por DNS —
sin lo segundo bastaría registrar un dominio público que mañana apunte adentro.

### Consultas sin límite

252 métodos consultaban sin `take`, 189 colgados de un `@Get`. Ponerles
paginación cambiaría la forma de la respuesta y rompería las pantallas, así que
se acota en el middleware: tope alto (5000), y **aviso con el nombre del modelo
cuando recorta**. Un recorte silencioso sería peor que la consulta sin límite.

### Latente: notificaciones entre empresas

Las búsquedas de administradores no filtraban por empresa (`User` no lleva
`companyId`). Hoy sólo existe una empresa, así que no es explotable; al dar de
alta la segunda, sus administradores recibirían las notificaciones de la primera.

## Lo revisado que estaba bien

No todo lo que se mira tiene defectos, y conviene dejarlo dicho:

- **Autenticación** — bloqueo a los 5 intentos, contador que se reinicia al
  entrar, auditoría de fallos.
- **Portal de cliente** — todo acotado por `clientId`.
- **Chat** — valida acceso al canal y limita todas las consultas.
- **Pólizas automáticas** — idempotentes por referencia; nómina no puede
  duplicar asiento.
- **Tareas programadas** — agrupan por empresa antes de notificar.
- **Descuento de stock** — ya usaba actualizaciones guardadas.
- **Auditoría** — ya paginaba.
- **Cero `$queryRawUnsafe`** en todo el proyecto: no hay superficie de inyección
  SQL.

## Descartado tras comprobarlo

- **Traversal en subida de archivos.** El nombre incluye `file.originalname` y
  `path.join` sí resuelve el `../`, pero busboy hace `basename()` antes y
  elimina cualquier separador. Verificado ejecutando su implementación.
- **SCIM con salto entre empresas.** La vía heredada permite fijar la empresa
  por cabecera, pero `SCIM_ENABLED` no está puesto en producción.

## Pendiente, fuera del código

1. **Credenciales en el repositorio público.** `seed-demo-users.ts` tiene 17
   contraseñas en claro; `gerencia@nexara.com.mx` entra a producción como
   superadmin. Rotarlas es decisión de negocio.
2. **Dos jornadas marcadas como abiertas** tras el recálculo: entradas sin
   salida registrada, alguien debe cerrarlas a mano.
