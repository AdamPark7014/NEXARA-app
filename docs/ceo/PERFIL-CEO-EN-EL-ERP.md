# Tu perfil en el ERP (Christian) — cómo trabajas ahora
**Versión 1 · 27-sep-2026** · Escrito para ti, sin tecnicismos.
> Todo lo de este documento **ya está construido y probado**, pero **todavía no está en el servidor**: tu desarrollador lo publica y activa (ver `PENDIENTES-PARA-HIJO`, sección B). Lo marcado **(se activa)** necesita además un paso suyo o una decisión tuya.

---

## 1. Al entrar: «Hoy» y **«Tu día»**
Abres Core y aterrizas en **Hoy**. Arriba aparece el panel **«Tu día»**: una lista corta, en el orden en que conviene atenderla, con **solo lo que no es cero**:

| Renglón | Qué te dice | A dónde te lleva |
|---|---|---|
| Aprobaciones | «3 solicitudes por aprobar ($148,250), la más antigua lleva 4 días» | Aprobaciones |
| Cobranza | «2 facturas vencidas por cobrar ($92,400), la más atrasada lleva 20 días» | Facturación |
| Compras | «2 órdenes de compra atrasadas» | Compras |
| Cotizaciones | «1 cotización vence en 3 días ($58,000)» | Cotizaciones |
| Operación | «4 actividades atrasadas y 2 trabajos por validar» | Actividades del equipo |
| Nómina | «La pre-nómina de la 1.ª quincena de septiembre ya cerró: revísala y autoriza los pagos» *(se activa)* | Pre-nómina |

Los renglones **rojos («Urgente»)** son una aprobación con 3 o más días esperando o una factura con 30 o más días vencida. Si no hay nada, dice **«Todo al día»**.

**Además te llega el mismo resumen como un solo aviso a las 8:00 de la mañana, de lunes a viernes** (en el celular también). Si ese día no hay nada pendiente, no te manda nada.

## 2. Tu bandeja de **Aprobaciones**
Antes decía solo «Compra con folio 99». Ahora cada solicitud dice **de qué es y de cuánto**:
- «Orden de compra OC-0012 · CT · **$48,250.00**»
- «Cotización NEX-… · Cliente SA · CCTV Planta · **$250,000.00**»
- Gastos y viáticos con su concepto y monto; cierres de actividad; proyectos.

Arriba ves cuántas hay, **cuánto dinero suman** y cuál es la más antigua. Desde la cotización puedes abrirla para revisar costo y margen antes de decidir. Las que **nadie tiene asignadas** (las que traía el sistema sin aprobador) ahora **te aparecen a ti** y te llega el aviso con el importe.

## 3. Hasta qué monto decides tú **(se activa con tu decisión)**
Hoy cualquiera con permiso puede enviar una cotización o aprobar una compra, de cualquier monto. Ya existe la opción de decir:
> «Una cotización de **$X** o más, y una compra de **$Y** o más, necesitan **mi** autorización.»

Cómo funciona en la vida real: si alguien del equipo intenta enviar una cotización que pasa ese tope, el sistema **no la deja salir**, te la pone en tu bandeja con el importe y te avisa; el vendedor recibe un mensaje claro («por su monto necesita la autorización de dirección… ya se pidió»). Tú apruebas y ya puede salir. **Lo tuyo no se frena:** si tú la envías o la apruebas, pasa directo. Lo que está por debajo del tope **ya no te llega**.
**Lo único que falta es que tú digas los montos** (los del ejemplo: cotizaciones $250 mil, compras $25 mil, son solo ejemplos).

## 4. Menos ruido **(tú eliges)**
En el panel «Tu día» hay una casilla: **«Solo el resumen y lo urgente»**. Marcada, dejas de recibir los avisos meramente informativos (entradas y comidas del equipo, evidencias enviadas, «se creó un cliente/lead/factura…», «cotización enviada»). **Sigues recibiendo** todo lo que necesita tu decisión o es urgente: aprobaciones, atrasos de SLA, márgenes bajos, cotización firmada o rechazada, y tu resumen de las 8:00. Puedes desmarcarla cuando quieras.

## 5. Viáticos
Cuando un viático llega a **tu paso** (el último), ahora te llega un aviso con **quién lo pidió y de cuánto**. Antes no te enterabas hasta abrir la bandeja.

## 6. Nómina quincenal
- **«Pagos a personal» lo ves solo tú.** La contadora conserva Facturación y no ve esos pagos; RH y contabilidad siguen viendo las **horas** en la pre-nómina, pero sin los montos capturados. *(se activa en tu empresa)*
- El sistema conoce tu calendario (**cortes el 15 y el último día del mes**): el día siguiente al corte te avisa en «Tu día» que la pre-nómina está lista, y dos días antes te avisa que se acerca el corte. *(se activa)*
- Todavía **no** existe: CLABE y banco por empleado, archivo de dispersión para el banco, ISR/IMSS ni CFDI de nómina.

## 7. Facturación
Sigue siendo **a mano en el portal del SAT** hasta que se encienda el timbrado electrónico. El sistema ya sabe hacerlo y hay una revisión que dice qué falta, pero encenderlo es un paso fiscal que hacen **tu desarrollador y tú juntos**, con el **CSD de la empresa** (no con tu e.firma). Tu e.firma **no se comparte con nadie ni se guarda en texto**; si alguna vez se pegó en un chat, cámbiala.

## 8. Quién da de alta a quién
Hasta ahora solo dirección (tú, Dirección Administrativa y Coordinación Administrativa) podía crear usuarios, así que **Antonio, David y Luis no podían**. Ya se puede, **por persona** (David y Luis tienen el mismo puesto en el sistema pero no dan de alta lo mismo):

| Quién | Puede dar de alta |
|---|---|
| **Antonio** (encargado de soporte) | Personal de **soporte** |
| **Luis** (encargado de servicios) | Personal de **soporte** |
| **David** (encargado de instalación) | **Instaladores** |
| **Christian** | **Todos los tipos que están por debajo de ti** (soporte, instalador, coordinadores, directores, RH, contabilidad, ventas, diseño…). Nunca otro CEO ni super administrador |

Cómo lo usan: en **Organigrama** aparece el botón **«Dar de alta a alguien»** solo a quien tiene algún tipo concedido. Escribe nombre y correo, elige el tipo y el sistema propone una contraseña segura (o la escriben). Al terminar la ven **una sola vez** para entregársela a la persona. La persona nueva queda **debajo de quien la dio de alta** en el organigrama y el alta queda registrada en la auditoría.
Reglas de seguridad: nadie puede dar de alta un tipo que no le concediste, y ningún tipo con permisos de administración (directores, coordinadores, RH, contabilidad) se delega: eso solo lo haces tú.
*(se activa: tu desarrollador corre un script con los tres correos; si cambian las personas, se edita ese script.)*

## 9. Qué le tienes que pedir a tu desarrollador
1. **Publicar y activar** lo nuevo (una tarde de trabajo).
2. Que active tu **calendario de nómina** (quincenal).
3. Cuando tú decidas los montos, que active los **topes de aprobación**.
4. Que active **quién da de alta a quién** (Antonio, David, Luis).
5. **Respaldo diario** de la base de datos (es lo más importante que falta).

### Acceso a cuentas (solo tú)
En **Usuarios** aparece el botón **«Acceso a cuentas»** solo para tu cuenta. Vuelves a escribir **tu** contraseña y durante **5 minutos** puedes, de cualquier cuenta de la empresa (menos la tuya y la de desarrollo):
- **Ver su contraseña** (botón «Ver contraseña»): se muestra de una en una y se oculta sola a los 30 segundos.
- **Ponerle una contraseña nueva** (con confirmación): cierra sus sesiones abiertas y la nueva también queda guardada.

**Cómo se guardan:** cada contraseña que se crea, cambia o restablece desde el sistema (un alta tuya, de Antonio, de Luis o de David; un cambio desde Usuarios; un restablecimiento) queda guardada **cifrada** (AES-256-GCM) en una bóveda. La llave de cifrado no está en la base de datos sino solo en el servidor; con un respaldo de la base nadie puede leer las contraseñas. Solo tú las ves, y **cada vez que ves una** y cada entrada quedan en la auditoría (sin la contraseña). Si no hay llave configurada, la pantalla lo avisa y no guarda nada.
**Límite honesto:** una contraseña puesta *antes* de que existiera la bóveda solo se puede mostrar si se cargó desde una hoja de credenciales; si no, esa cuenta aparece «sin contraseña guardada» y lo que puedes hacer es ponerle una nueva. Tu contraseña y la de la cuenta de desarrollo nunca se guardan.

## 10. Lo que todavía no está (para ser claros)
- Aprobar **cotizaciones, compras y pagos desde el celular** (hoy desde el celular apruebas viáticos, gastos y solicitudes de la bandeja; en iPhone solo viáticos).
- **«Facturar esta cotización»** con un clic y el **timbrado real**.
- **Precios por rango de cantidad** para licitaciones y **agrupar partidas por sede/planta**.
- **Facturación recurrente** de las pólizas de servicio.
