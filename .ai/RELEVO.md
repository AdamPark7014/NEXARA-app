# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-20
- **Rama:** feat/viaticos-casos (base `mejora/calidad-y-web` @ f6f90df8)
- **HEAD:** Viáticos repartidos entre actividades y cierre del anticipo

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Turno anterior (claude-code, f6f90df8)

Ola de lenguaje llano en las pantallas hijas de Contabilidad. Cerró con
980/980 en web. Quedó pendiente el deploy a Hetzner y la misma pasada en
`movimientos`, `polizas` y `pre-nomina`.

## Hecho este turno

Adam: «en viáticos faltan casos de uso, como que se les puedan agregar viáticos
por actividad o cosas así, o distribuido en varias actividades».

### 1. Repartir un viático entre varias actividades

Un viaje cubre varios servicios de clientes distintos; la gasolina es una y el
costo son varios. Hasta hoy el gasto entero caía sobre `Viatico.actividadId` y
el P&L por proyecto mentía sin avisar.

- **`ViaticoReparto`** (tabla `viatico_repartos`): viático, actividad, monto,
  nota, empresa. `@@unique([viaticoId, actividadId])` para que una actividad no
  aparezca en dos partes y siga pudiendo leerse «esta actividad carga X».
- **La suma de las partes es exactamente el total**, comprobado en el servidor
  en **centavos enteros** — en coma flotante `0.1 + 0.2 !== 0.3` y un reparto
  legítimo se rechazaría. El error dice la cifra: «faltan $200.00 por repartir».
- `actividadId` no se toca: el reparto es aditivo y sin partes todo funciona
  como siempre.
- El **P&L por proyecto** (`vendor-project-finance.service.ts`) ya reparte: cada
  proyecto carga su parte, y en el detalle la línea dice que es parte de un
  viático mayor. El desglose por proyecto de `viatics/analytics` también.

### 2. Pedir o asignar desde la actividad — **ya existía**

`ops/activities/[id]/viatics` ya tenía «Solicitar» y «Asignar» reutilizando
`postViatico` / `assignViatico`. No se duplicó nada. Lo que sí faltaba: la
pantalla ahora enseña **la parte que carga esa actividad**, no el viático
entero, e incluye los repartidos que cuelgan de otra actividad (antes esa OT
se veía «sin viáticos» aunque pagara la mitad de la gasolina).

### 3. Cierre del anticipo

Solo había `montoSolicitado`: nadie sabía si el dinero volvió.

- `montoAprobado` — se sella al aprobar. Quien autoriza puede **recortar**
  («te doy 800, no 1,200»), nunca subir. Queda anotado en la cadena.
- `montoComprobado` + `fechaComprobacion` + `comprobadoPorId` — `PATCH
  /viatics/:id/comprobar`.
- `liquidacion` calculada en la API: entregado / comprobado / saldo y estado
  `SIN_COMPROBAR · CUADRADO · POR_DEVOLVER · POR_REEMBOLSAR`.
- La póliza de «marcar pagado» sale por lo **autorizado**, no por lo pedido.
- En `ops/my-viatics` el saldo va pegado al monto: es la pregunta que trae
  quien entra ahí.

### Fugas y bugs encontrados de paso

- `viatics/analytics`, `report.pdf` y `export/xlsx` **no recibían `companyId`**:
  `companyWhere(null)` es deny-all, así que la pestaña de resumen y el PDF
  salían en ceros para todo el mundo. Arreglado pasando la empresa.
- `findByActivity` y `findByAllowedUsers` del servicio consultaban **sin filtro
  de empresa**. Sin ruta que las expusiera hoy, pero eran fuga latente: ahora
  exigen `requireCompanyId` + `companyWhere`.

## Migración

`20260920140000_viatico_reparto_y_liquidacion` — **aditiva y reversible**. Una
tabla nueva y cuatro columnas NULL; ningún `NOT NULL` sin default, nada
borrado ni renombrado. El SQL a mano coincide exactamente (nombres de índices,
constraints y acciones de FK) con lo que genera `prisma migrate diff`, así que
no deja drift. El rollback va escrito en la cabecera del archivo.

## Puerta de calidad

- `npx tsc --noEmit` limpio en **api** y en **web**.
- API: **2171/2171 en 195 suites** (eran 2136/194; el spec nuevo suma 35).
- Web: **991/991 en 83 archivos** (eran 980/82; el spec nuevo suma 11).
- Correr cada suite **sola**: en paralelo se agotan por CPU y dan rojos falsos.

## A medias / decisiones para Adam

1. **El reparto se captura escribiendo el ID de la actividad.** Es el idioma que
   ya usaba esa pantalla («ID actividad OPS»), pero un selector de actividades
   sería mejor. No se metió para no cargar un catálogo de miles de filas.
2. **Repartir desde la pantalla de la actividad** no está: hoy el reparto se
   edita desde Finanzas. Lo natural sería «este viático también cubre la OT…»
   desde la propia actividad.
3. **El saldo no genera movimiento contable.** `POR_DEVOLVER` y
   `POR_REEMBOLSAR` se ven, pero nadie cobra ni paga solo. Falta decidir si el
   sobrante se descuenta en nómina o se registra como cuenta por cobrar.
4. **Viático de equipo** (un viaje, varias personas) sigue sin existir: el
   esquema lo dice explícitamente en `ActivityAssignee` («cada asignado solicita
   los suyos, no se prorratean»). Es una decisión previa, no un olvido.
5. **Tope por categoría** y **viaje de varios días** no se implementaron: piden
   política y catálogo, no una tabla.
6. Un viático **pagado** ya no se re-reparte (el asiento salió). Si Adam quiere
   corregir imputaciones después del pago, hace falta una póliza de ajuste.

## Siguiente

1. Enseñarle a Adam el reparto antes de seguir (regla suya: lo visual se acuerda
   antes de construir).
2. Deploy + smoke: el módulo de viáticos completo, incluida la pestaña de
   resumen que hasta hoy salía en ceros.
3. Pendiente del turno anterior: deploy de Contabilidad a Hetzner.

## No tocar

Puente NAS · cotizaciones de prueba · `components/ui/` y el shell (otro agente
en paralelo).
