# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-20
- **Rama:** `mejora/calidad-y-web`
- **HEAD:** El suite web deja de fallar a ratos

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Pendiente de Adam, sin hacer

1. **Rotar la clave de Google Maps.** Se pegó en el chat más de una vez. Ningún
   agente la escribe en disco; Adam la pone en el servidor con el comando de
   `.ai/HARDENING-GAP.md`.
2. **«Asignar viático» no existe en la interfaz.** `POST viaticos/assign` está
   completo en la API (sella `origen: ASIGNACION` y `asignadoPorId`, y exige
   ligar a actividad o proyecto), `getErpViaticsAdminSectionConfig` da
   `canAssign: true`, y el subtítulo de la pantalla dice literalmente «Autoriza
   y **asigna** viáticos del equipo». Falta solo el botón y su formulario. No se
   construyó sin permiso porque crea un gasto a nombre de otra persona.
3. **Saldo del anticipo de viático:** `POR_DEVOLVER` y `POR_REEMBOLSAR` se ven
   pero no generan asiento. ¿Se descuenta en nómina o se registra como cuenta
   por cobrar?
4. **`minutosPagables` de pre-nómina:** 9 horas netas + 1 aprobada da 10
   «pagables». ¿Doble conteo, o extra a doble? `pre-nomina.spec.ts:64` lo fija
   en 10 h, así que hoy parece deliberado.
5. **El contrato dice 32px y yo pedí 40px.** Los agentes obedecieron el
   contrato y subieron a 40px solo con puntero grueso. Si Adam quiere 40px
   también con ratón, se cambia el contrato primero.

## Hecho este turno

Adam pidió dos cosas: que la cotización tuviera el diseño del PDF de viáticos,
y que se viera «muchísima más profesionalidad y UI/UX en todo el sistema». Y
mandó una captura de Facturas con un error.

### 1. La cotización adopta el tema corporativo

Banda superior, tres tarjetas arriba (total, anticipo, entrega) y fichas para
cliente y condiciones. Se renderizó y se miró antes de enseñarla, y así
aparecieron tres defectos viejos: los párrafos se medían sin `lineGap` y se
recortaba la última línea («pueden cambiar sin previo aviso» no salía);
Garantías repetía un renglón por partida; y las páginas de continuación metían
la tabla debajo del logo.

**Ningún PDF usaba las fuentes corporativas.** El tema registraba Montserrat e
Inter y dibujaba todo con `'Helvetica'` a pelo, y de los veinte generadores
solo `propuesta-tecnica` llamaba a `registrarFuentesCorporativas`. Ahora pedir
la fuente **es** registrarla (`fuente(doc, clave)`), así que los veinte
cambiaron de golpe. El PDF pasa de ~20 KB a ~133 KB: son las fuentes embebidas.

### 2. Siete pantallas que no habían cargado nunca

La captura de Adam decía «limit must not be greater than 100». La vista pedía
`limit=200` y `PaginationQueryDto` topa en 100.

| Pantalla | Qué costaba |
|---|---|
| `erp/contabilidad/facturas` | 400 desde el primer día |
| `erp/invoicing` | el campo Cliente está condicionado a que la lista traiga algo: con `clientId` opcional en la API se podía guardar una factura de ingreso **sin cliente**, y esa no entra en cuentas por cobrar |
| `studio/leads` | alimentaba `promotedIds`: nunca se marcaba lo ya enviado → leads duplicados |
| `ops/support/new`, `ops/maintenance/contracts`, `ops/assets` | cliente obligatorio: no se podía abrir ticket, ni dar de alta contrato, ni guardar activo |
| `integra/settings` | además, `pedirIntegra` cuelga `siteId` de toda URL y `service-clients` es ruta ERP con DTO bajo `forbidNonWhitelisted`: moría por `siteId` con límite o sin él |

Ninguna recorta en silencio: se piden páginas hasta completar y, donde se topa
el techo, se dice cuántos de cuántos. `listUsers` pagina por dentro, lo que cura
de paso `integra/people`, que llamaba sin parámetros y enseñaba 20 usuarios
como si fueran todos.

### 3. Contrato visual en cotizaciones y finanzas

Tres reglas nuevas en `.ai/DISENO-FINANZAS.md`, sacadas de mirar pantallas ya
desplegadas: **(7)** una fila de ceros no informa, no se pinta; **(8)** los
filtros son una barra, no un formulario; **(9)** ni una caja dentro de otra.

Aplicadas a `crm/quotes`, `erp/cotizaciones`, las pestañas de cotización de
cliente y oportunidad, y `erp/finance/{viatics,expenses,employee-payments}`.
`FinanceModuleShell` estrena `variant="flat"` opcional; sus otros 14
consumidores no cambian.

De paso, defectos que no eran de estilo: `quote-supplier.module.css` empezaba
con una línea suelta que dejaba el panel de pedido a CT **sin ningún estilo**;
el detalle de cotización guardaba el error de «bajar PDF / enviar correo» y no
lo pintaba nunca; cuatro pantallas vaciaban la tabla al fallar un refresco; los
inputs de partida de la oportunidad no tenían **ningún** nombre accesible; y
`OpportunityDetailShell` se quedaba con el esqueleto puesto para siempre si la
sesión no llegaba a estar lista.

### 4. La puerta vuelve a ser puerta

- El suite web fallaba dos pruebas al azar. No eran las pruebas: `findBy*`
  espera 1 s por omisión y el límite por prueba eran 5 s, cuando la más lenta
  ya gasta 2,6 s sola. Ahora 4 s y 15 s. Dos pasadas seguidas, 1 003/1 003.
- `workspace-ar-ap.spec.ts` se ponía rojo **todas las tardes**: fabricaba «hoy»
  con el día UTC y el servicio define «hoy» como el día del servidor. En México
  coinciden hasta las 18:00.

## Verificación

- API: **196 suites, 2 176 pruebas**, verde.
- Web: **86 archivos, 1 003 pruebas**, verde dos pasadas seguidas.
- `tsc --noEmit` limpio en API y web.

## Deuda medida, no estimada

**81 pantallas** siguen con rejilla de `KpiCard` y **361 tarjetas sueltas**
fuera del ámbito de Cursor; 24 ya usan `MetricStrip`. Peores: `crm/reports`
(14), `studio/pages` (12), `erp/hr` (11). Reproducible con el script descrito
en `.ai/HARDENING-GAP.md`.

## Aviso de relevo

Cuatro agentes escribieron a la vez en esta worktree. Uno hizo `git stash push`
y se llevó el trabajo sin commitear de otro; lo devolvió y se verificó que no
se perdió nada (lista de stashes con solo dos viejos de otras ramas). Pero
pasó, y la regla 5 existe justo para eso: **un writer a la vez**.

## No tocar

Puente NAS · cotizaciones de prueba de clientes reales · `components/ui/` y el
shell (otro agente) · Actividades y Asistencias (packet de Cursor).
