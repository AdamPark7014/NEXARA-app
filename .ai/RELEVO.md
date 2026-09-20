# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** ola contadora — 7 ramas integradas sobre `07016b6c`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Workspace de la contadora, 7 worktrees en paralelo, todos integrados:

| Rama | Qué entrega |
|------|-------------|
| feat/cont-ledger | Libro de movimientos: une pagos, gastos, gastos de obra, banco, nómina y facturas. Separa efectivo de devengado; traspaso entre cuentas propias no suma |
| feat/cont-cxc | CxC/CxP con antigüedad, días vencido, detalle con pagos, registrar cobro/pago y calendario de vencimientos |
| feat/cont-concilia | Motor de emparejamiento banco↔documento (puntaje + razones), pantalla dividida, conciliación con teclado |
| feat/cont-cierre | Lista de verificación de cierre (7 puntos contra BD), bloqueo con justificación auditada, auditoría antes/después |
| feat/cont-vendors | Proveedor 360° desde el modelo Supplier + P&L por proyecto con drill-down al documento |
| feat/cont-reportes | Catálogo de 8 reportes servido por API, comparación con periodo anterior, drill-down y CSV; presupuesto vs real |
| feat/cont-rbac | 403 por backend probado, menú por permisos reales, pre-nómina propia en el hub |

## Fallos de producción encontrados al auditar (no eran el encargo)

1. **Ninguna póliza automática se contabilizaba.** `createAndPostAutoJournal`
   llamaba `postJournalEntry` sin empresa → `requireCompanyId` lanzaba 403
   siempre. Gastos, viáticos y pagos a empleados no tienen try/catch: "marcar
   pagado" reventaba y dejaba la póliza en borrador. Corregido en toda la cadena.
2. **Fuga entre empresas:** la póliza se buscaba por `reference` sin filtro de
   empresa, y el índice es `@@unique([companyId, reference])`. Corregido en
   `createAndPostAutoJournal` y `postPurchaseReceiptAccrual`.
3. **Fuga entre usuarios, viva:** el revalidador de la caché sin conexión
   refrescaba entradas de OTRA cuenta con el token de la sesión actual y las
   guardaba bajo la etiqueta ajena; la cola offline reenviaba lo encolado por A
   con la sesión de B. Corregido (la web ya no guarda caché ni cola: eso es del
   teléfono). Es la continuación del incidente previo de datos cruzados.
4. **XML y PDF de factura siempre 404:** `getInvoiceXml`/`getInvoicePdf` sin
   empresa contra un `companyWhere` deny-all. Corregido.
5. **Proyectos nunca funcionó:** agrupaba por `Invoice.projectId`, campo que no
   existe. El camino real es `activityId → Activity.projectId` o
   `salesProjectOrderId`. Corregido.
6. **La prueba del panel contable nunca corrió:** importaba de vitest en un
   proyecto jest. Reescrita leyendo el metadata `@RBAC` real del controlador.

## A medias / pendiente real

- **Deploy bloqueado, y no por el servidor:** `~/.ssh/config` tiene
  `hetzner-nexara` con `HostName REEMPLAZA_CON_IP_HETZNER`. Falta la dirección
  real y la llave. Comando a correr en el servidor:
  `./deploy/update.sh --force-all`
- **Periodo cerrado sin blindar del todo.** `assertDateNotInClosedPeriod` solo
  se llama desde `reverseJournalEntry`; `resolveOpenFiscalPeriodId` cubre crear
  y postear pólizas. Quedan sin validar: `registerPayment` (el más grave: mueve
  saldo bancario dentro de un periodo cerrado), `reconcileTransaction`,
  `cancelInvoice`, `createInvoice`, `updateInvoiceDraft`, `deleteInvoice`,
  `importBankTransactions`. La UI de cierres ya lo dice en `proteccion.noBloqueado`
  en vez de prometer lo que no cumple.
- **AuditLog no guarda el estado anterior** salvo en el cierre de periodo. Para
  antes/después de verdad hace falta que cada `update` lea la fila antes y la
  pase como `previousData`.
- Bonos y descuentos no existen en el modelo de pre-nómina: no se inventaron.
- Sin base local levantada no hubo smoke en navegador; todo está cubierto por
  pruebas, no por uso real.

## QA adversarial (agente que no construyó nada)

10 fallos reales, cada uno con prueba en rojo antes del arreglo:

1. **COGS de almacén sin empresa** — el commit `b62d9ce6` arregló gastos,
   viáticos y pagos, pero dejó fuera `warehouse.service.ts:474`, y ahí el error
   lo traga un `catch` con `logger.warn`: **cada despacho y merma salía del
   almacén sin que su costo llegara a los libros, en silencio.**
2. **Caché offline cruzaba EMPRESAS** — la clave llevaba token y usuario, no
   empresa, y la empresa viaja en la cabecera, no en la URL. Quien tiene dos
   empresas veía la cartera de la A creyendo que era de la B. Subida a v3.
3-6. **Cuatro focos más del bug de zona horaria.** El peor:
   `getWorkspaceDashboard.agingReceivable.dueToday` era **siempre 0**, y lo que
   vence hoy se contaba como vencido. Además el rango por fechas **perdía el
   día 1 del mes**.
7. **El libro duplicaba páginas:** el desempate de la mezcla ordenaba los ids
   como texto y ascendente; página 1 y 2 salían idénticas.
8. **Conciliación emparejaba un cobro con un pago:** la penalización al sentido
   invertido no bastaba y salía como sugerencia alta, lista para aplicar.
9. **Doble cierre de periodo concurrente** — ahora compare-and-swap.
10. **Variación 0 % con presupuesto en cero**, que se lee como "clavado".
11. **CSV sin neutralizar fórmulas de Excel** en el libro de movimientos.

Sospechas reportadas y NO tocadas (decisión de producto o migración de esquema):
el total "Ingresos" del libro suma facturado + cobrado a propósito (se aclaró la
etiqueta en la UI para que no se lea como dinero que entró); `listProjects` sin
paginar; N+1 acotado en el comparativo de presupuesto; una misma factura puede
conciliarse contra dos movimientos porque `BankReconciliation` no guarda el id
del documento.

Revisado y correcto: 25/25 rutas nuevas con guard y `@RBAC` por método; ~50
consultas Prisma nuevas con filtro de empresa, incluidas las relaciones usadas
como filtro; ningún controlador acepta la empresa desde el cuerpo o la query.

## Verificación final

- `tsc --noEmit`: limpio en API y web.
- API: **2059/2059** en 187 suites. Web: **970/970** en 80 archivos.
- Las 3 suites que la ola anterior dejó rojas quedaron reparadas: dos eran
  simulacros incompletos; la de actividades fijaba el alcance SIN empresa, que
  ya se había retirado, así que verificaba el comportamiento inseguro.
- `npm run build:server:lowmem`: **éxito, sin ignorar errores**. Las 13 páginas
  de `/erp/contabilidad` y los 6 controladores nuevos compilan.

## Siguiente

1. Adam da la IP/llave del Hetzner, o corre `./deploy/update.sh --force-all`.
2. Smoke de la contadora contra datos reales.
3. Blindar el periodo cerrado en las 7 rutas de escritura listadas arriba.

## No tocar

Puente NAS.
