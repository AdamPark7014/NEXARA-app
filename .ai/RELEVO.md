# RELEVO

- **29-10 ~14:00 (claude-code) — Apps: autoasignación fija (contrato de la API e920ddbb, sesión «Asignar con IA»).**
  - Android: en el alta propia (`autoasignacion = selfAssign || destino = yo`) ya no se capturan complejidad,
    «Entregar a más tardar», tiempo estimado ni tope; la tarjeta «Tiempo y entrega · los fija el sistema»
    (`TiempoCalculado.kt`) enseña en solo lectura lo que da `POST me/activities/tiempo-calculado` (estándar,
    complejidad, entrega y desglose con sus supuestos). `buildRequest(autoasignacion = true)` no manda esos campos.
    Asignar a otro sigue igual.
  - Arreglo de paso en el detalle (`CoreActivityKinds.entregaEditada`): guardar la edición mandaba siempre la entrega
    como `día T12:00Z` (06:00 de México) y pisaba la hora compromiso; con la regla nueva daba 403 a quien no es
    superior. Ahora solo va si cambió el día, y a la misma hora de México que tenía.
  - iOS (~15:00): mismo diseño. `CoreTiempoCalculado` (reglas) + `CoreTiempoCalculadoSection` (sección «Tiempo y
    entrega · los fija el sistema»), `CoreRepository.tiempoCalculado`, la ruta nunca se encola sin red, el demo
    responde `me/activities/tiempo-calculado`. El detalle tenía el mismo fallo de la entrega (`entregaISO` → día
    T12:00Z): ahora `CoreActivityRules.entregaEditada`, que compara el día de México. Sin compilar en local: lo
    compila el CI de capturas.
  - iOS Inicio: franja del color del fondo detrás de la barra de estado (al desplazar, la banda oscura del CEO
    quedaba debajo de la hora en negro). En Android no pasa: el Scaffold ya mete ese margen y la lista se recorta.
  - Versión 1.1: Android `VERSION_CODE=19`, `VERSION_NAME=1.1.0` (AAB firmado con `build-play-aab.ps1`, mapping en
    `play-releases/mapping-v19-1.1.0.txt`). Captura nueva `miDiaVacio` (Mi día sin actividades).

- **29-10 ~14:30 (claude-code) — Ninguna actividad sin tiempo ni entrega; autoasignación fija; ajuste solo de superiores.**
  - Adam: «ya no debe haber ninguna actividad que tenga tiempo indefinido de entrega, y la edición de parámetros de
    una asignación debe ser a subordinados, pero la autoasignación es fija basándose en el título».
  - API `activities/tiempo-entrega.ts` (puro, con spec) + `tiempos-actividad.service.ts`:
    - `ActivitiesService.create` (todas las altas: web, apps, asistente, juntas, proyectos, solicitudes) completa
      el alta. El estándar sale de la tabla con lo que la IA de complejidad lee del título (cantidad, complejidad;
      caché de 30 min por título); lo que falta se supone y queda en el desglose como «Supuesto: …» (1 unidad,
      complejidad estándar, traslado aproximado 30+30). Sin regla o en juntas, la mediana real del tipo o 1 h.
      La entrega es el inicio + el tiempo, sumando la comida (15–16), sin pasar de las 18:00 si empieza en jornada.
    - **Autoasignación** (`creadoPorId = responsableId`, por `/me/activities` o `/activities`): tiempo, estándar,
      complejidad, unidades y entrega fijos; lo que mande el cliente se ignora.
    - **Asignada a otro:** se respeta lo que puso quien asigna; solo se llena lo que falta. Si manda estándar y
      otro tiempo sin `estandarCambiadoMotivo` → 400.
    - `PATCH /activities/:id`: tiempo, estándar, desglose, motivo, complejidad, unidades, destino, traslado,
      entrega y máxima solo los cambia un superior de quien la ejecuta (`isSuperiorInChain`); reenviar lo mismo
      no cuenta, y con periodo la entrega/máxima tampoco (las pone el periodo).
    - Altas directas: gastos administrativos (5 min) y mantenimiento por contrato (estándar del preventivo,
      entrega = SLA). `app.service.importAll` (restaurar un respaldo) se deja tal cual.
    - `POST me/activities/tiempo-calculado`: vista previa de lo que fijará la autoasignación.
    - El plan del detalle y de «Mis actividades» usa `tiempoEstimadoMin` si no hay `horasPlan` (lo autoasignado nunca
      lo tenía); `me/activities` trae `tiempoEstandarMin`/`estandarDesglose`; «asignadas por mí», `minutosEstandar`.
  - Web: autoasignación con la tarjeta del estándar en solo lectura (`TiempoFijoCampo`), sin complejidad, sin
    «Entregar a más tardar», sin ruedas de tiempo ni máximo. Detalle: «Estándar X · lleva el N % del estándar» en
    la tarjeta Tiempo y la entrega con hora; el formulario de edición ya no reenvía la entrega si no cambió.
    Listas: «estándar X» junto al plan contra real.
  - Relleno: `apps/api/scripts/rellenar-tiempos-abiertas.cjs` (dentro del contenedor, simulacro y `--escribir`;
    lógica en `activities/rellenar-tiempos.ts`, con spec). No escribe si cambiaría algún «a tiempo».
  - Pruebas: API tiempo-entrega 9, parámetros 7, relleno 5; web TiempoFijoCampo 2; suites completas en el commit.
  - Contrato para las apps: mandado a la sesión de apps (`local_e8744ccc…`).
  - Relleno: el simulacro en producción llena las 134 sin cambiar ningún «a tiempo», pero 122 ya están entregadas y
    su tiempo real es en mediana 5× el estándar del título (75 de 123 pasan de 3×; p. ej. tareas de tubería con
    tipo «Preparación de equipo» = 15 min). Opción B lista (`--entregadas-sin-estandar`: a lo entregado, tiempo =
    lo trabajado y sin estándar). Pendiente de la decisión de la sesión principal antes de `--escribir`.

- **29-10 ~16:30 (claude-code) — Sugerencia de nómina con periodos calculados (pedido de Adam: «múltiples cálculos
  de fechas dinámicas»).**
  - `/erp/finance/employee-payments` → «Sugerencia de nómina»: el selector ofrece semana actual y anterior (lunes a
    domingo, como `nomina_semanas`), quincena actual y anterior, mes actual y anterior, y rango personalizado. Cada
    opción trae sus fechas (`periodos` en la respuesta). Abre en la quincena actual y la semana del 26-10 es
    «Semana actual» hasta el domingo 1-11.
  - API: `periodoDeClave`/`periodosCalculados` en `sugerencia-nomina.ts`; `GET sugerencia-nomina?periodo=semana|
    semana_anterior|quincena|…` (vigente/anterior siguen). Cada fila trae «a la fecha» (`montoSugerido`,
    `devengadoALaFecha`, corte = `calculadoHasta`) y «periodo completo» (`proyectado`, corte = `hasta`).
  - Regla de pago (decisión 6): `sueldoDeDias` = semana ÷ 7 × días en todo periodo; `semanalDeMensual` = mensual ×
    12 ÷ 52. El sueldo semanal capturado el 28-10 es el del tabulador (mensual ÷ 4): no se convirtió, espera la
    revisión de la contadora (nota en la carpeta compartida de las sesiones).
  - Pruebas: cambio de mes y de año, quincena de 15/16 días, febrero (13 y 14 días), zona de Ciudad de México.

- **29-10 ~16:00 (claude-code) — Diseñador de videovigilancia: plano por niveles (artboard 5, aprobado por Adam 29-10).**
  - Motor `apps/web/lib/cctv/niveles.ts` (+ `ids.ts`): el plano raíz es la planta baja y los pisos van en
    `plano.niveles` (`{ nivel, plano }`); agregar/quitar/renombrar, `copiarMurosDeAbajo` (ids nuevos, altura libre),
    numeración global (15, 16…), paso entre pisos por metros. `resumenDelPlano` suma todos los pisos. 6 pruebas.
  - Editor: barra de niveles arriba del lienzo, «+ Nivel», sección Nivel en la pestaña Plano, fantasma gris del piso
    de abajo en 2D y 3D apilado a la elevación real (los de abajo en gris, rótulos y aristas punteadas). `encuadrar`
    centra el edificio cuando hay pisos encima.
  - Ficha por cámara y propuesta encuentran la cámara en cualquier nivel; la propuesta saca una hoja de distribución
    por nivel y el 3D con todos los pisos. API sin cambios (el JSON va en el mismo `plano`).
  - Ojo: el `.prettierrc` de la raíz (comillas simples, 100) no es el estilo de `apps/web` (comillas dobles en todo);
    no correr prettier sobre la web sin `--no-config`.
  - Pulido por pedido de Adam («ineficiencias, no es intuitivo»), commits `27820248`, `24d3b151`, `016556b7`:
    el piso de abajo en gris ya no usa `filter: grayscale` (girar costaba 20–105 ms por cuadro con dos niveles);
    giro y paneo a un cuadro por `requestAnimationFrame`; botones de acercar/alejar/encuadrar (y girar 45° en 3D);
    lienzo al alto de la ventana; encuadre 2D con el alcance de los conos; etiquetas de conos sin encimarse;
    muros 3D sin juntas de tramo; guía de pasos en el panel derecho cuando no hay nada elegido.
  - Proyecto de prueba en producción: diseño 2 «Bodegas VDM con mezzanine · prueba por niveles (se archiva)»
    (16 cámaras en dos niveles) y diseño 1 de antes. Archivarlos cuando ya no se ocupen.

- **29-10 ~15:30 (claude-code) — Desempeño: índice v2 (Adam aprobó las 10 decisiones de §7.4, «aprueba todo»).**
  - Fórmula en `.ai/CUMPLIMIENTO-EVALUADOR-SPEC.md` §7.2; decisiones marcadas «aprobado 29-10» en §7.4 y lo construido
    en §7.5. `30·Confiabilidad + 25·Calidad + 30·Rendimiento + 15·Disciplina`.
  - API (`me/kpis-equipo.ts`, puro): `cumplimientoDe` v2 con contracción hacia el equipo (`referenciasDelEquipo`),
    `disciplinaDe` (retardos graduados y 3 = 1 falta, sin descuento en dinero), calificación calibrada por revisor,
    `minutosHabilesEntre`/`revisionesEnPlazo` (24 h hábiles), `equipoCoordinadoDe`, `metaPonderada`,
    `estandarDeRespaldo`. Ritmo, ocupación, carga, tiempo y días quedan con peso 0 (diagnóstico).
  - Servicio: autoasignada (`creadoPorId`), aprobada (evidencia APPROVED o «Finalizada»), comercial sin cotización
    enviada (no gana), T<sub>e</sub> de respaldo = mediana real de su tipo para lo de antes del 29-10, familia por
    puesto, coordinación por organigrama con revisiones en plazo. Sin migración.
  - Web: mismo `DesempenoTablero`; pilar Rendimiento = horas estándar, confianza 20/10, lectura con calificación,
    puntualidad y registro, «Su equipo» para coordinadores y el diagnóstico como «no pesa, para leer».
  - Ojo con el registro completo: en los últimos 14 días José e Iván no registraron ninguna comida y David y
    Roberto 1 de 9; su Disciplina cae casi a 0 hasta que la registren.
  - Fuera de la fórmula (aprobado, trabajo aparte): nota de la regla de pago para la contadora (la mesa contable no
    tiene dónde dejar notas), hoja de entradas desde el sistema y nómina del 26-10 en paralelo con el Excel.
  - Tarifa de cotización ajustada (aprobada): 40 min hasta 10 partidas + 5 por cada una de más (50 → 4 h).
    `UnidadEstandar.incluidas` en API y web; anotado en §8.

- **29-10 ~13:40 (claude-code) — Apps: inicio de dirección general (CEO) en el teléfono (pedido de Adam).**
  - Adam: «Christian tiene ir a pizarra del equipo, el módulo principal es un módulo vacío… que tenga algo que ver el
    superadmin CEO en su main sección móvil». Artboard nuevo en el canvas: «App · Inicio CEO» (`MovilCeo.dc.html`).
  - Android (`inicio/InicioCeoRules.kt` + `InicioCeoSection.kt`, `InicioViewModel.cargarCeo`): cabecera «Tu equipo
    hoy», banda oscura con «N de M checaron entrada» y Trabajando / Sin actividad / Atrasadas (`me/board`),
    «Requiere tu atención» con Evidencias por validar (`me/revisiones`), Aprobaciones (`workflow/my-pending`) y Pagos
    por autorizar (borradores de `employee-payments`), «Desempeño · 7 días» con anillo (`me/kpis/equipo`) y «Para
    atender» (los grupos de la pizarra). Cada sección cae sola si su endpoint falla; las recargas en vivo se espacian
    30 s. Captura en la JVM: `CapturasMiDiaTest.inicioCeo` → `app/build/capturas/inicio-ceo.png`, igual al artboard.
  - iOS: lo mismo (`Inicio/InicioCeoRules.swift`, `InicioCeoSection.swift`, `InicioStore.cargarCeo`, `CoreShellView.
    abrirExtra`). El demo conserva «Mi día»; con `NEXARA_DEMO_CEO=1` muestra el de dirección y la prueba de paridad
    `testInicioDireccion` lo captura como `91-inicio-direccion.png`. Versión de tiendas: 1.1.0 (19) en Android y 1.1 (12) en iOS, sin subir todavía (Adam aprobó
    subirlas; esperan el inicio CEO en iOS y la autoasignación de la sesión «Asignar»).

- **29-10 ~13:00 (claude-code) — Apps: botones de trayecto (API `7e7934d5` de la sesión «En espera de revisión»).**
  - Android: tarjeta «Trayecto» en el detalle (`TrayectoSection.kt`, reglas en `TrayectoRules.kt` + prueba), solo
    para quien hace la actividad (`captura && !despachador`): «Iniciar trayecto» (IDA) antes de iniciar, «Llegué»
    mientras va en camino, «Regreso a la oficina» (REGRESO) ya entregada, y el resumen de cada tramo («Ida · 18 min
    · en tiempo»). Manda la ubicación si hay permiso (5 s máx.). `me/activities/:id/trayectos*` no entra a la cola
    sin conexión (la hora es la del servidor). Si la API falla o no está desplegada, la tarjeta no se pinta.
  - iOS: lo mismo (`TrayectoRules.swift`, `TrayectoSection.swift` → `ActivityTrayectoCard`, `TrayectoModels.swift`,
    `CoreRepository.trayectos/iniciarTrayecto/terminarTrayecto`; `ApiClient` no encola `…/trayectos`). El demo responde
    los tres endpoints (`DemoFixtures+Trayectos.swift`) y cierra la ida al iniciar y todo al checar salida, como la API.
  - Las dos apps: el regreso solo se ofrece a quien registró la ida, y las tareas de escritorio (Diseño, Configuración
    remota, Facturación, Reporte) no ofrecen «Iniciar trayecto» (`TrayectoRules.deOficina`).
  - Verificación iOS «Mi día»: capturas de paridad del commit `329ac6ba` (`258c4df9`) iguales al artboard; la barra
    superior clara sale con flecha y título oscuros y una línea fina debajo.

- **29-10 ~14:30 (claude-code) — API del trayecto: ida y regreso medidos aparte del reloj (pedido de Adam).**
  - Flujo de Adam: «Iniciar trayecto» → llegar e «Iniciar actividad» → «Concluir» en el sitio → regreso a la oficina,
    cada tramo medido y con tráfico.
  - Tabla `activity_trayectos` (migración `20261029210000_actividad_trayectos`, aditiva, **va con
    `deploy-api-migrar-web.sh`**). Columnas: `tipo` IDA|REGRESO, `modo`, `startedAt`/`endedAt`, `finMotivo`
    (LLEGADA|INICIO|SALIDA|NUEVO), puntos de inicio y fin, `estimadoMin` y `estimadoFuente`. Va en `tenant-models.ts`.
  - `src/activities/trayectos/trayectos.ts` (reglas puras + spec) y `trayectos.service.ts`:
    - `POST me/activities/:id/trayectos` `{tipo, lat?, lng?, modo?}` empieza el tramo. Solo puede quien la hace. Cierra
      lo que tuviera abierto, rechaza una ida repetida y calcula el estimado con `calcularRuta` (oficina → destino de
      la actividad; en el regreso, la vuelta).
    - `POST me/activities/:id/trayectos/terminar` `{lat?, lng?}` es «Llegué».
    - `GET me/activities/:id/trayectos` devuelve los propios; el responsable y el creador ven los de todos. Cada tramo
      trae `minutos`, `estimadoMin` y `estado` (en tiempo hasta ruta + 25 %).
    - La ida se cierra sola al «Iniciar actividad» (`MyActivitiesService.iniciar`, motivo INICIO). Todo lo abierto se
      cierra al checar salida (bus `attendance.checkout`, motivo SALIDA).
  - Las apps (`nexara-apps-uiux`) esperan estos endpoints para los botones; la web todavía no los pinta.
  - **Desplegado** con `deploy-api-migrar-web.sh` (`7e7934d5`; `MIGRADO`, `API_LISTO`, `WEB_LISTO`, `FIN`). La migración
    `20261029210000_actividad_trayectos` está aplicada y las tres rutas aparecen en el arranque de la API. Con este
    despliegue también salió la regla `obra` del tiempo estándar. Endpoints enviados a `nexara-apps-uiux`.
  - Pendiente de Adam: su WhatsApp del 29-10 dice que una cotización de 5 a 10 productos tarda 40 min o menos. La tarifa
    (40 + 4 por partida) da 80 min con 10. Si lo decide, el ajuste es en `TABLA_ESTANDAR` (`comercial`).

- **29-10 ~12:20 (claude-code) — Comerciales: PowerPoint y la cotización ligada se ven abiertos en la actividad (pedido de Adam: «que puedan adjuntar Excel, PDF, PowerPoint… o ligar una cotización, y se vea embebida»).**
  - Adjuntar y ligar ya existían: «Archivos de evidencia» (`components/erp/ArchivosDeActividad.tsx`) y «Ligar
    cotización» (`CotizacionDeActividad.tsx`). PDF, imagen, Excel, CSV y Word ya se abrían dentro; faltaban dos cosas.
  - **PowerPoint:** el `.pptx` se aceptaba pero solo se descargaba. Ahora `vista-previa-documento.ts`
    (`powerpointAHtml`, con `jszip`, que ya viene con exceljs y mammoth) arma una tarjeta por diapositiva, en el
    orden real de la presentación, con su texto y sus fotos incrustadas como `data:`. Topes: 60 diapositivas,
    1.5 MB por foto y 8 MB en total. Las gráficas y formas no se dibujan. Va en el mismo iframe aislado sin scripts
    que Excel y Word. El `.ppt` viejo sigue solo de descarga. Prueba en `vista-previa-powerpoint.spec.ts`.
  - **Cotización ligada:** era solo un enlace. Ahora `PropuestaEmbebida.tsx` baja `GET cotizaciones/:id/pdf` con la
    sesión y la muestra abierta con el visor pdf.js. Sin permiso de cotizaciones, lo dice y deja el enlace.

- **29-10 ~12:10 (claude-code) — Timbrado con Facturama: adaptador listo, perfil fiscal corregido (sin desplegar, sigue en mock).**
  - PAC elegido: Facturama API Web. El adaptador ya existía y timbra desde JSON con el CSD de la cuenta. Finkok no aparece
    en la lista vigente del SAT y SW certifica vía Digital Factura/SIFEI. Comparativa y costos en las notas de la sesión
    del PAC (`pac-cfdi-recomendacion.md`).
  - Cuenta Facturama de producción (Adam, 29-10): alta completa, CSD `00001000000718329029` vigente al 25-08-2029, prueba
    con 15 folios de API hasta el 29-nov. **Anualidad API sin comprar** ($1,650; compra de Adam).
  - `apps/api/src/pac/adapters/facturama.adapter.ts` reescrito (+ spec con 17 casos):
    - baja el XML por `Id` y cancela por `Id`, buscándolo por UUID si no viene;
    - busca serie y folio antes de timbrar para no duplicar, con tiempo límite;
    - Pagos 2.0 con IVA por documento; PUE/99 rechazado y PPD con 99;
    - errores de Facturama legibles (BadRequest/ServiceUnavailable);
    - cancelación pendiente de aceptación = aviso, no «cancelada».
  - `pac.types.ts`: opcionales `pacDocumentId` (resultado y cancelación), `serie`/`folio` en cancelación e `ivaRate` por
    documento del REP. No toqué `accounting.service.ts` ni `schema.prisma`: tienen cambios sin commitear de la Mesa contable.
  - BD del servidor: `company_profile` id 1 con RFC `NEE240925V73`, razón social sin régimen societario, régimen `601`,
    domicilio y CP 72775. El registro anterior quedó en `/root/company_profile_1_antes_20261029.csv`. Preflight: emisor
    completo y válido; único bloqueo `proveedor_mock`.
  - Segundo commit (la Mesa contable soltó `accounting.service.ts` y `schema.prisma`):
    - `invoices.pacDocumentId` y `payments.pacDocumentId` (migración `20261029200000_pac_document_id`);
    - `stampInvoice` y el REP los guardan, y `cancelInvoice` pasa Id, serie y folio;
    - `GET :id/pdf` (ERP y portal de clientes) entrega el PDF de Facturama;
    - el REP manda la tasa de IVA de los conceptos y se detiene si la factura mezcla tasas.
  - Suite de la API: solo falla `app-urls-core-surface` por dos rutas `/crm/projects` de la Mesa contable (de esa
    sesión, ya avisada). Los PDF de reuniones/cotización pasan con `--runInBand`.
  - Desplegado (migración aplicada, api sana).
  - Adam pidió «no uses pruebas, ya directo conecta»: el servidor quedó con `PAC_PROVIDER=facturama` y las credenciales
    reales (respaldo `/root/env.nexara.antes-facturama-20261029-181852`). Preflight `listo_para_produccion`.
  - **Facturama da 401:** la API de producción exige la anualidad ($1,650), que sigue sin comprar. No reintentar contra su
    API hasta que la compre: ya van ~9 intentos fallidos y conviene no arriesgar un bloqueo.
  - No hay ninguna factura en la base. Lo único facturable a la vista son actividades reales terminadas (AN-0038 Nivel
    Diez, AN-0039 TEKSERVE, AN-0239 «SE»), sin importe ni datos fiscales; AN-0007 es de la semana demo.
  - Sandbox (29-10, 12:30, mismas credenciales que la cuenta real): pasaron timbrar, reutilizar el mismo folio, el PDF
    y el REP 2.0. La cancelación no se puede probar ahí (solo con el RFC de prueba EKU9003173C9). Se corrigieron
    `NoIdentificacion` vacío y `ExchangeRate` en pagos MXN. En sandbox se crearon las series A y P.
  - Pruebas de facturas (pedido de Adam, 29-10, sandbox):
    - `pac/validacion-cfdi.ts` (+ spec) frena en `stampInvoice` y en el REP, antes de STAMPING, lo que el SAT rechaza:
      RFC/dígito, régimen vs. persona, uso vs. régimen, P01, 616, «S.A. de C.V.», XAXX con «PUBLICO EN GENERAL»
      (global no soportada), claves con formato, cuadre del total, moneda, forma/método e IEPS.
    - Adaptador: razón social en mayúsculas y pistas de qué corregir en los rechazos del SAT.
    - Cancelación con motivo 01: el UUID sustituto se valida.
    - El emisor se lee por empresa (riesgo 11).
    - Resultados de la batería en `docs/CFDI-GO-LIVE.md` §8.
  - **Falta:**
    - Adam: comprar la anualidad y crear las series **A** y **P** en la cuenta real; o pedírmelo y las creo por
      `POST /serie/{idSucursal}` en cuanto la API responda.
    - Mesa contable: validar claves SAT contra el catálogo al capturar.
    - La contadora: preparar los borradores con RFC, régimen, CP, uso y claves SAT.
    - Cada CFDI real lo confirma Adam antes de timbrar.
  - Runbook actualizado: `docs/CFDI-GO-LIVE.md` §1 y §8.

- **29-10 ~14:00 (claude-code) — Tiempo estándar en Asignar (web) y obra con tarifas (lo retomé de la sesión principal).**
  - Adam: «Sí, retómala aquí». La API (`fab4f3ab`) y la migración `20261029030000` son de la principal y ya se desplegaron.
  - `components/ops/TiempoEstandarCampo.tsx` (+ css + spec) va en «¿Qué se va a hacer?», debajo de la complejidad,
    como los artboards `TiempoEstandar` y `TiempoTraslado` del canvas:
    - cantidad con − y +, la pregunta de la regla, y el selector de unidad si hay varias (cableado y obra);
    - destino con `ClientLocationPicker`, «En auto» o «En transporte» y `POST ai/estandar/ruta`, con chips de ida,
      vuelta y en el lugar, y la fuente de la ruta (Google, OSRM o aproximado);
    - tarjeta oscura con el total y el desglose; «Cambiar el tiempo (pide motivo)», de 5 letras mínimo.
  - La cantidad y el destino que lee la IA llegan por `ComplejidadCampo` → `onSugerencia`. Si alguien la escribe a
    mano, ya no la pisa.
  - La suma está en `lib/tiempo-estandar.ts` (+ spec), con la misma fórmula que `calcularEstandar` de la API. La
    tabla se pide una vez a `GET ai/estandar/tabla`.
  - Mientras el estándar mande, «¿Cuánto tiempo toma?» del formulario y la rueda de la página de asignar quedan de
    solo lectura (`onEstandar`). Con motivo, la rueda vuelve a quedar libre y el motivo se guarda.
  - El payload manda `unidades`, `destino`, `traslado*`, `tiempoEstandarMin`, `estandarDesglose` y
    `estandarCambiadoMotivo` (`payloadEstandar`). Al editar, se leen con `estandarDeRegistro`.
  - En el detalle, «Datos clave» muestra «Tiempo estándar» con su desglose, el destino y el motivo si se cambió.
  - API: regla nueva `obra` en `tabla-estandar.ts`, con las mismas tarifas de instalación y cableado (dispositivos,
    nodos o metros, base de 30 min). Adam pidió parametrizar las obras.
  - Falta: horas estándar ganadas en Desempeño y la API de tramos de trayecto (la espera `nexara-apps-uiux`).
  - **Desplegado el web** (`c6cc2ef3` + `8899e14b`) y revisado en el Chrome de Adam, en Asignar de Iván · Instalación:
    con 8 dispositivos da 6 h 30 min (30 + 8 × 45). «Tiempo estimado» del panel quedó igual, y lo típico (7 h 30 min,
    24 anteriores) queda como referencia. La regla `obra` sale con el próximo despliegue de API.
  - **Horas estándar ganadas en Desempeño** (medición aparte; el índice no cambia hasta §7.4):
    - API `kpis-equipo.ts`: `EntregaKpi.minutosEstandar` (de `Activity.tiempoEstandarMin`) y, en `EntregasKpi`,
      `conEstandar`, `minutosEstandarGanados`, `minutosRealesConEstandar` y `pctEficienciaEstandar` (estándar ÷ real,
      tope 100), con `sumasEstandar` y `sumaEquipo`.
    - Web: renglón «Horas estándar ganadas» en la lectura de cada persona (`estandarGanado` en `lib/desempeno.ts`), con
      «8 h · 50 % de su jornada (3 entregas con estándar · eficiencia 87 %)». Sin entregas con estándar lo dice.
    - Solo cuenta lo asignado desde hoy con tiempo estándar; la medición de lo de antes está en las notas compartidas
      (`medicion-actividades-2026-10-29.md`: ningún título traía la cantidad).

- **29-10 ~13:30 (claude-code) — Mesa contable de la contadora: API y web, desplegadas el 29-10 ~12:10.**
  - Desplegado `c6cc2ef3` con `prisma migrate deploy` antes de levantar la API (232 migraciones, la nueva aplicada).
    Prueba de humo contra la base real (empresa 1, solo lectura): «Por facturar» trae 12 servicios terminados con
    cliente y sin factura (14–22 días hábiles; casi todos sin cotización y varios de «A QUIEN CORRESPONDA» sin RFC);
    pagos y gastos vacío (no hay viáticos ni gastos pagados en octubre); estados en cero (0 pólizas), cuadran y el
    Excel sale. Falta revisar las pantallas contra el mockup con sesión de Core (el navegador integrado no la tiene).
  - Arreglo (29-10 tarde): los folios de pedido y de actividad iban a `/crm/projects` y `/erp/actividades/:id`, que la
    contadora no abre (y rompían `app-urls-core-surface.spec`): ahora van sin enlace. Se le abrió en lectura el
    detalle de la cotización (`/erp/cotizaciones/*`, sin sumarle el módulo al menú) y la ficha del cliente
    (`/erp/clientes/**` + `GET /api/ventas/clientes/**`) para completar RFC, régimen y CP; editar el cliente ya lo daba
    `CLIENT_ADMIN_WRITE_URL_RULES`.
  - Pedido de Adam: «por facturar», pagos y gastos ligados a su CFDI y banco, estado de resultados y balance. Mockup
    aprobado por Adam el 29-10: https://claude.ai/artifact/MENR9dXWC7PGocKEoSTmpD
  - API en `src/accounting/mesa-contable/` bajo `GET|POST /api/accounting/workspace/mesa/*` (contrato en el
    controlador): `por-facturar` (servicios terminados con cliente, cotizaciones aprobadas, anticipos pactados,
    pedidos con partidas sin facturar y cobros PPD sin complemento; `preparar` crea el borrador ligado y `descartar`
    guarda «no se factura» con motivo), `facturas/:id/revision` («antes de timbrar» y póliza), `pagos-gastos`
    (viáticos, gastos, nómina, cobros/pagos y recepciones con su CFDI, banco y póliza; ligar XML recibido, ligar
    banco, registrar póliza) y `estados` (resultados/balance por periodo con agrupador SAT, Excel de 3 hojas).
  - Migración `20261029180000_mesa_contable`: `invoices.cotizacionId` y `esAnticipo`, tablas
    `por_facturar_descartes` y `movimiento_vinculos` (pago o gasto ↔ CFDI ↔ movimiento de banco).
  - Cambios contables: la póliza de factura timbrada usa la base (descuentos) y retenciones y ya no truena con IVA 0;
    con PPD el IVA va a 208.02 y el cobro lo pasa a 208.01; el viático entregado va a 107.01 «por comprobar» y la
    comprobación se registra desde la Mesa (deducible + IVA acreditable 110.02 + no deducible 605.01). Cuenta nueva
    113.01 sin agrupador. `registerPayment` liga el pago a su movimiento de banco.
  - Rol `contabilidad`: + `accounting.post`, `accounting.close_period`, `banking.reconcile` (antes solo con el flag
    viejo). Sigue sin `audit.view` a propósito (spec de RBAC).
  - Timbrado: no se duplica; lo conecta la sesión del PAC (Facturama recomendado; producción en mock).
  - Pendiente conocido: la recepción de compra sigue cargando IVA a 209.01 (mal definida en el catálogo base).
  - Web: `/erp/contabilidad/por-facturar` (+ `/[id]` para preparar y timbrar), `/pagos-y-gastos` y `/estados`
    (`?vista=balance`), en el sistema visual nuevo (`components/mesa-contable/`, datos en `lib/mesa-contable.ts`).
    Los chips de `ContabilidadSidebar` quedan en el orden del mockup (Hoy · Por facturar · Pagos y gastos ·
    Estados financieros · Cuadrar banco · Me deben · Debo pagar · Cerrar el mes · Más) con contadores de
    `GET mesa/resumen`; en las tres pantallas nuevas van debajo del encabezado. En el menú, «Contabilidad» se llama
    «Mesa contable».

- **29-10 ~12:00 (claude-code) — Web Core: auditoría por DOM del resto del menú y arreglos de contraste (sin desplegar).**
  - Auditadas 21 pantallas a 1707 px (el ancho real de Adam: Chrome maximizado con zoom al 90 %). 375 px no se pudo
    medir sin cambiar su ventana; el navegador integrado no tiene sesión de Core. Sin solapes ni desborde horizontal.
    JSON por pantalla en el scratchpad de la sesión «apps paridad» (`auditoria-web/`).
  - Arreglado: dentro de `.nx-app-shell`, `--state-warning-text/-success-text/-danger-text` toman los `--ui-*-text`
    (pastillas «Pendiente», aviso del riel de Hoy y cifras de advertencia en 2.6–2.9:1); número del filtro activo de
    `ModulePage` sin opacidad (3.5:1); pista de teclado del botón verde (`base_btnPrimary .kbd`, 3.1:1); chips de
    Vehículos; cifras de advertencia de `DashKit`. Título de la pestaña por sección («Pizarra · NEXARA Core»).
  - Sin tocar (de otras sesiones): Contabilidad (enlace activo 3.55:1) y Chat (blanco sobre degradado, composer recorta
    4 px). Notificaciones «· Abrir →» 4.26 y «Prioridad alta» 4.34 a 10.5 px quedan pendientes.
  - **No desplegado:** sale con el próximo despliegue del web. Ojo: la auditoría abrió `/erp/chat` como Christian y
    pudo marcar como leído el canal 333; puede quedar abierta en su Chrome una pestaña en `core.nexara.com.mx/robots.txt`.

- **29-10 ~12:10 (claude-code) — Chat de Core: ligas de todo, editor sin texto encimado y asistente en #general (pedido de Adam).**
  - Código: `bbc3b4a9` (API + web) y el arreglo del menú de `@` (este commit). Desplegado y probado en producción con
    la sesión de Christian, solo con borradores y el panel del asistente (nada se publicó en #general).
  - **Bug del texto encimado:** la pastilla del espejo (`MentionTextarea`) se pintaba con `font-weight 550` y el
    textarea con 400: cada liga corría ~4 px el texto contra el cursor y, al saltar de línea o salir la barra, se
    encimaba. Ahora mismo grosor, el espejo compensa la barra de desplazamiento, el redactor crece hasta 160 px y la
    liga/mención entra donde está el cursor con el foco de vuelta (`insertTokenAt` en `lib/chat-mentions.ts`;
    antes el foco se quedaba en el `<body>` y lo tecleado se perdía). Medido en producción: anchos y scroll del
    espejo = textarea con 1, 2 y 9 líneas.
    - Además `.composer` tenía `overflow: hidden`: **el menú de `@` nunca se veía** y el de emojis salía recortado.
  - **Ligas** (`apps/api/src/chat/ligas/`, `POST chat/ligas`, `GET chat/mentions?kind=QUOTE|CLIENT|PROJECT|
    ATTENDANCE|VIATIC|INVOICE`): token de siempre `[etiqueta](/erp/…)`; actividad, evidencia (`?evidencia=`),
    cotización, cliente, proyecto, asistencia (`/erp/asistencias/indicadores/<user>?desde=d&hasta=d`), viático
    (`/erp/finance/viatics?highlight=`) y factura (`/erp/invoicing/<id>`). Cada tarjeta con los permisos de quien
    la ve (regla de URL del rol + permiso del detalle + alcance de su pantalla); sin acceso, solo «Cotización
    NEX-…». Web: botón «Ligar» con 9 pestañas, `lib/ligas.ts` (misma tabla de rutas que el API) y `EntityCards`
    junta las tarjetas de la pantalla en una llamada. Las apps ya pintan estas ligas como enlaces; sin selector
    nuevo ni tarjetas (pendiente).
  - **Asistente** (`apps/api/src/ai/asistente-chat/`, módulo propio, `POST chat/asistente`): `@asistente` en #general
    (pastilla `[@Asistente](user:0)` desde el `@` o escrito a mano). No publica nada: el panel «Solo tú lo ves» va
    arriba del redactor y se borra al recargar. Reglas sin IA: saludo, qué puedes hacer, mis pendientes (hoy,
    mañana, vencidas), quién está en jornada / no ha checado (CEO y jefes con equipo), mi asistencia, folios
    AN/NEX y «cómo hago / dónde está» con 23 temas verificados contra el código (`ayuda-core.ts`). Lo demás va a
    Claude: proceso `chat-asistente`, Haiku 5.5 low sin razonamiento, JSON, `max_tokens` 350, guía fija con caché y
    solo rol + pregunta (ningún dato de la empresa). Tope 20 por persona y 150 por empresa al día
    (`CHAT_ASISTENTE_TOPE_DIARIO`). «Asígnale a…» reusa `AsistenteActividadesService.interpretar` (solo CEO) y la
    web crea cada propuesta solo con «Crear». `GET chat/asistente/estado` da al CEO cuántas respondió el código y
    cuántas la IA hoy.
  - Eval `npm run eval:asistente-chat -w apps/api` (30 casos): 10/10 por reglas; IA 18/20 perfectos, 0 inventos,
    juez 4.38/5, p50 1.6 s, p95 3.4 s, US$0.00011 por llamada leyendo caché (0.0005 escribiéndola). Contrato en §8
    de `C:\dev\scripts\ai-os\IA-CLAUDE.md` (copiado a `/opt/IA-CLAUDE.md`) y objetivo en la puerta
    (PUERTA-IA-app `2690965`, p95 4 s, 0.0006).
  - **Despliegue:** `bbc3b4a9` salió con `deploy-api-web.sh` (API + web, ed12e3d4) y está probado. El arreglo del
    menú de `@` (`e4d24f38`) salió con el `update.sh --with-migrate` de 38952929 (sesión de «Asignar con IA») y está
    verificado en producción: el menú de `@` se ve (Asistente primero), la mención entra con el cursor detrás y el de
    emojis sale completo.
    - `/root/deploy-api-web.sh` no tiene permiso de ejecución: correrlo con `bash /root/deploy-api-web.sh` (con
      `nohup … &` por SSH muere sin dejar log).
  - Pendiente: selector «Ligar», tarjetas y asistente en Android/iOS; `lib/asistente-ia-api.spec.ts` (web) falla
    en tipos y en una prueba por el trabajo sin subir de otra sesión, no por el chat.

- **29-10 ~12:45 (claude-code) — Diseñador de videovigilancia, fases 3 y 4: 3D, ficha por cámara y propuesta en PDF.**
  - Pedido de Adam por la sesión principal: «que hiperprofesionalice el generador de planos, modelos 3D…». Todo sale de
    los artboards 2, 3 y 4 del mockup que ya aprobó.
  - Revisado en producción con la sesión de Christian. Se creó el diseño «Prueba de verificación (se archiva)», id 1, con
    el croquis de VDM: subir el croquis, calibrar con la cota de 43 m, poner una cámara, ver su cono, el panel y la vista
    desde la cámara. Salieron dos arreglos (`a327a96d`):
    - el plano saltaba ~30 px al cambiar de herramienta;
    - el croquis negro de AutoCAD se veía gris: ahora se detecta y se pinta en negativo.
  - Plano 2D: etiqueta «14 m · 109 PPM · Observación» en cada cono, barra de escala y norte (`02042b29`).
  - 3D (`lib/cctv/escena3d.ts` + `Lienzo3D`/`Figuras3D`):
    - proyección axonométrica en SVG, sin WebGL ni dependencias nuevas (no toca el lock compartido ni la CSP);
    - muros extruidos con huecos y hojas, croquis en el piso con matriz afín, conos, humanoides y cámaras a su altura;
    - isométrica, vista superior, girar, mover y F para enfocar; abajo las vistas desde las cámaras.
  - Ficha `/erp/videovigilancia/:id/camara/:camara` y propuesta `/erp/videovigilancia/:id/propuesta` (`d269cdbb`):
    - la ficha lleva una lámina propia (`public/cctv/lamina-referencia.svg`) pixelada a cada PPM en canvas;
    - la propuesta va en hojas carta con marca NEXARA y se descarga con la impresión del navegador.
  - Pruebas: `lib/cctv` + editor + ficha/propuesta = 67 en verde; `tsc` de la web limpio.
  - Mockup: se agregó el artboard 5, «Plano por niveles», **por aprobar** (no está construido).
  - Pendiente: archivar el diseño de prueba id 1 cuando Adam lo vea; «Pasar a cotización»; detección automática del
    croquis; «Leer ficha»; infraestructura en el plano.

- **29-10 ~12:00 (claude-code) — Diseñador de videovigilancia, fase 2: módulo `/erp/videovigilancia` (mockup aprobado).**
  - Adam aprobó el mockup («Aprobado, construye»). Especificación en `docs/DISENADOR-CCTV.md`.
  - Web:
    - `app/(panels)/erp/videovigilancia/`: lista y alta; `[id]` es el editor.
    - Editor 2D:
      - croquis JPG/PNG/PDF (el PDF se pasa a PNG con pdf.js); calibrar con una cota;
      - muros con imán (extremos y 0/45/90°); puertas, ventanas y accesos sobre el muro; obstáculos con altura;
        cotas y textos;
      - cámaras del catálogo semilla, con manija para apuntar y largo del cono; humanoides;
      - conos DORI recortados por muros (con caché por cámara); mapa de calor;
      - recuadro con la vista desde la cámara («134 PPM · Reconocimiento · persona a 10 m»);
      - deshacer y rehacer;
      - autoguardado con control de versión: un 409 avisa que otra persona guardó.
    - Piezas puras en `lib/cctv/editor.ts`, `vista.ts`, `catalogo.ts`, `api.ts` y `acceso.ts`.
  - API `src/cctv-disenos/`, tabla `cctv_disenos` (migración `20261029130000_cctv_disenos`, aditiva):
    - `acceso`, lista, alta, detalle, `PATCH` con versión (409 con `versionActual` por su propio filtro), archivar y
      croquis (sharp, en `/uploads/cctv-croquis/`, con sesión).
  - Acceso (`acceso-cctv.ts`):
    - siempre: dirección, coordinadores, arquitecto, administrativo y `enc_soporte`;
    - con gente a cargo: `ing_soporte`/RH/contabilidad/líder de diseño (José Antonio sí, Carolina y Alejandro no);
    - instaladores nunca.
    - `/me/navigation` lo esconde a quien no puede. En la web, el menú usa `lib/cctv/acceso.ts` (soporte por la lista
      de encargados) y la página pregunta a `GET cctv-disenos/acceso`.
  - Pruebas:
    - web: `lib/cctv` 7 archivos / 55, el editor 3, `role-modules` 65, suite completa 1,465/1,466 (la que falló,
      `OpsProjectDetailShell`, pasa sola: es intermitente por carga);
    - API: 61 suites / 593 en cctv, me, rbac y tenant;
    - `tsc`: API 0 errores; web solo con los 3 de `lib/asistente-ia-api.spec.ts`, que ya estaban y no son de aquí.
  - Producción: la migración no corre con `deploy-api-web.sh`. Va aparte: `docker compose … run --rm -T api sh -c
    "cd apps/api && npx prisma migrate deploy"` (como `update.sh --with-migrate`).
  - No hecho todavía (fases 3 a 6): 3D con three.js, propuesta en PDF, «Pasar a cotización», detección automática del
    croquis, «Leer ficha» e infraestructura en el plano.

- **29-10 ~11:45 (claude-code) — Apps: pasada visual de Core, primera parte (Android «Mi día» + tokens; iOS tokens).**
  - Android, tokens como la web (`ui-tokens.scss`): verde #168570 y sus suaves, fondo #EEF1F5, texto #14171F/#5B6272,
    bordes #E6E9EF, radios 10/14/20/24, Inter Tight (OFL, `res/font`, licencia en `android/OFL-InterTight.txt`) en
    títulos. `NxPanelShell` sin borde con sombra larga (`Modifier.nxFlotante`). Barra inferior blanca sin pastilla, la
    activa en verde. Barra superior de Core clara con título oscuro (`NxCoreTopAppBarColors`); el portal de clientes
    sigue con la verde.
  - Android «Mi día» (`InicioScreen.kt`) como el artboard «App · Mi día»: cabecera con fecha y «Mi día», tarjeta
    blanca de jornada (`JornadaTarjeta`, Entrada/Salida y fila de Comida), banda oscura con resplandor para la
    actividad de ahora (reloj que corre, plan y «entrega antes de las 17:00», avance contra el plan, Pausar/Entregar),
    y «Lo que sigue hoy». Reglas nuevas en `InicioRules` (`etiquetaBanda`, `segundosTrabajados`, `reloj`, `pieBanda`,
    `avancePlan`, `etiquetaCorta`, `pastillaBanda`) con pruebas.
  - Capturas sin teléfono ni sesión: `CapturasMiDiaTest` (Robolectric, fuera de las pruebas normales):
    `gradlew :app:testDebugUnitTest -Pcapturas=true --tests "*CapturasMiDiaTest*"` → `app/build/capturas/mi-dia.png`.
  - iOS: la misma tabla de color en `NxBrand.swift`, `AccentColor` #168570, radios 10/14/20/24 y sombra flotante en
    `nxCardSurface`. Después (~12:05): Inter Tight cableada (`project.yml` + `UIAppFonts`, `NxFont.display`), «Mi día»
    espejo de Android (`InicioView.swift`/`InicioRules.swift`), barra superior clara en Core (`NxNavBarEstilo.core`;
    el portal conserva la verde), barra inferior blanca sin pastilla y demo con la actividad 5156 en curso. El chat
    (`ChatConversationView`) pasó sus íconos de blanco a #14171F para verse en la barra clara. Sin Mac: lo compila
    `ios-screenshots.yml`; dudas abiertas: el tono de la flecha de volver y la línea bajo la barra (mirar capturas).
  - Android «Entregar evidencia» (`EvidenceCaptureFlow.kt`), solo lo visual del artboard sin tocar los pasos ni el GPS:
    tarjeta blanca flotante por paso, «Paso 2 de 4 · Fotos en sitio» con barra de avance, fotos en rejilla de dos
    (4:3, «Lista», nombre debajo) y botón principal de 52 con radio 14.
  - Canvas: cuatro artboards nuevos de app para el visto bueno de Adam (Mis actividades, Detalle, Asignar, Mi equipo
    con «En espera de revisión»). No se construyen hasta que los apruebe.

- **29-10 ~11:35 (claude-code) — Tiempo estándar por especificidad, parte API (§8 de la especificación, tarifas
  aprobadas por Adam el 28-10).**
  - Migración `20261029030000_actividad_tiempo_estandar` en Activity: `unidades`, `destino` (JSON), `trasladoMin`,
    `trasladoModo`, `tiempoEstandarMin`, `estandarDesglose` (JSON) y `estandarCambiadoMotivo`. **Se aplica con
    `prisma migrate deploy`**, porque `deploy-api-web.sh` no migra; usa `/root/deploy-api-migrar-web.sh`. El `null` de
    las columnas JSON pasa por `conJsonNulo` (`Prisma.DbNull`) al crear y al editar.
  - `src/ai/estandar/`:
    - `tabla-estandar.ts` es la única tabla de tarifas, por tipo. Por ejemplo: cotización 40 min + 4 por partida,
      instalación 30 + 45 por dispositivo, cableado 45 por nodo o 4 por metro, correctivo por complejidad, y salidas
      con ida + vuelta + tiempo en el lugar. `calcularEstandar` arma el desglose, redondea a 5 min y topa en 12 h.
    - `rutas.ts`: ida y vuelta desde la oficina (`sitioOficina`). Intenta primero Google Routes con tráfico (la llave
      hoy da 403: falta habilitar Routes API y facturación, eso es de Adam), luego OSRM (auto) y al final línea recta
      × 1.4 a 25 km/h. Transporte sin Google = auto × 2.2 + 10 min, marcado como estimado.
    - Endpoints `GET ai/estandar/tabla` y `POST ai/estandar/ruta`. La ruta se guarda en caché 1 h.
  - La sugerencia de complejidad (`complejidad-ia.ts`) ahora también lee del título la `cantidad` de lo que se cuenta
    en ese tipo y el `destino`, en la misma llamada. Eval `--funcion complejidad`: 28 casos, 26 perfectos, todas las
    cantidades y destinos bien, 0.00006 USD por llamada.
  - Falta: el campo en el formulario web (cantidad, mapa del destino y la tarjeta con el desglose) y el flujo de
    trayecto en las apps (iniciar trayecto → actividad → regreso), que se le pasa a la sesión `nexara-apps-uiux`.

- **29-10 ~11:00 (claude-code) — «Asignar con IA»: nombres mal oídos resueltos en código y propuestas editables (pedido de Adam).**
  - Adam: «le digo talks y escribe talk… que una vez que se genera la parametrización… puedas corregir cualquier
    parámetro manualmente». En producción «Toks» no es cliente (sale en títulos: «Inventario Toks»): el dictado
    escribe «talks» y la IA lo copiaba como «Talk».
  - API `ai/asistente/nombres.ts` (puro, con spec): `sonido` con lo que el dictado mete del inglés (alk→ok, ph, th,
    sh, ck, ee, oo) además de k/c/qu, s/z/c, x/ks, h muda, ll/y, b/v, g/j; distancia de edición; apodos (+chava,
    isra, clau, efra…); dos palabras juntas («han lob»); siglas deletreadas («te pe eme» = TPM) e iniciales del
    nombre. `buscar(..., { aproximado })`: 3 igual > 1.8 suena igual > 1.5 se parece; lo aproximado solo se elige si
    es la única opción parecida. Las actas siguen con `buscar` exacto (sin la opción).
    - `catalogoRelevante` manda a la IA lo mencionado así, ordenado, con cómo se oyó: «Grupo Tox («talks»)», y
      «Otros nombres ya usados (no son clientes): Toks («talks»)» (palabras propias de los títulos y lugares de las
      últimas 400 actividades, `nombresPropiosDe`).
    - `construirPropuesta`: persona, cliente, sucursal y proyecto con coincidencia aproximada; si la IA copió lo mal
      oído («Talk») y la instrucción lo corrobora, se empata con una letra de diferencia; `correcciones` («talks» →
      Grupo Tox, campo, apodo o parecido) y el título, las indicaciones y el lugar se corrigen («Revisar NVR en
      Talk» → «… en Tox»). Varios parecidos: candidatos + aviso. Ninguno: sin cliente + aviso; nunca se inventa.
    - «A más tardar a las 6» el mismo día ya no va escrito en las indicaciones: es la hora compromiso
      (`agenda.compromiso`, `fechaMaxima`/`fechaEntregaEsperada` a esa hora, como el formulario). Con varios días
      sigue escrita.
    - `opciones.sucursales` en la respuesta (no pasan por la IA).
  - Web `AsistenteIA.tsx` + `lib/asistente-ia-api.ts`: título e indicaciones siempre como campos (se quitó «Editar
    texto»); campo «Lugar» (libre o sucursal del cliente, con sus datos); «Entregar a más tardar»; «Corregido de
    "talks"» / «Dijiste "Chava"» en responsable, cliente y lugar, y una línea «Nombres corregidos: …». Cambiar de
    cliente suelta la sucursal de la IA; título vacío bloquea. Lo corregido es lo que va a `POST /activities`.
  - Eval (`--funcion asistente`, por la puerta `pruebas`, Haiku `low`): casos a24–a30 nuevos (datos inventados:
    Erik/«eric», Salvador/«chava», Azael/«asael», Yahir/«jair», Brooks Coffee/«bruks cofi», Super Kwik/«súper
    quick», Transportes Coatzacoalcos/«cuatzacualcos», TPM/«te pe eme», «talks», Maja sin cliente). Antes: 0.88, 2/7
    perfectos. Ahora: **30/30 perfectos**, p50 1.9 s, p95 2.6 s, US$0.00023 por llamada (~3.4K de entrada). Sin
    cambio de modelo. Gasto del eval: US$0.0095. a22 ya no exige la hora en el texto. Contrato §8 de
    `C:\dev\scripts\ai-os\IA-CLAUDE.md` actualizado.
  - Pruebas: jest del asistente 42 (nombres 10 + armado 32), toda la API 322 suites en verde salvo
    `ai/asistente-chat/intenciones.spec.ts` (trabajo en curso de la sesión del chat, sin commitear); vitest de
    pizarra y lib 94. Tipos web limpios; los de la API solo fallan en `activities/activities.service.ts`, que tiene
    cambios sin commitear de la sesión del tiempo estándar.
  - Sugerencia para Adam: dar de alta como clientes los que se usan seguido (Toks, Sephora, MAJA, ARTA): así el
    código los empata como cliente y no solo como lugar.
  - Desplegado (API + web, `deploy-api-web.sh` con ed12e3d4) y revisado en Chrome con la sesión del CEO, sin crear
    nada: «que ivan vaya mañana a las 11 a talks a revisar las cámaras, le toma 2 horas, a más tardar a la 1; y que
    caro mande la cotización de crepas en waffles para el viernes» → 2 tarjetas en 3.2 s: «Revisar cámaras en
    Toks» (lugar Toks, Iván Camargo, mañana 11:00, a más tardar 13:00, sin cliente con aviso) y «Mandar cotización
    de Creppes and Waffles» (cliente resuelto, Carolina por «caro», plazo viernes). Ajuste posterior: se marca
    «talks» → Toks aunque la IA ya lo escriba bien, «crepas» → Creppes (lo parecido junto a una palabra dicha
    igual) y el aviso dice «"Toks" no está registrado» en vez de «Dijiste».
  - Ese ajuste (604eb457) salió con el despliegue con migración de otra sesión (servidor en 38a2778a, migración
    `20261029030000_actividad_tiempo_estandar` aplicada).
  - **Alta rápida de cliente en cada propuesta** (Adam: «aquí quitaron lo de agregar clientes rápidamente y luego
    llenar su detalle»). El selector de cliente ofrece «+ Agregar cliente "Toks"» con el nombre que entendió (el
    lugar ya corregido, o lo escrito en «Lugar»): misma alta rápida corporativa del formulario «Asignar»
    (`createSalesClient` con `altaRapida`, el padrón reutiliza al cliente si el nombre ya existe y decide permisos;
    luego `provisionSalesServiceClient`). Queda elegido en esa tarjeta y en las demás que dijeron el mismo nombre sin
    cliente; el lugar igual al cliente se vacía; la ficha se completa después en Clientes. No se ofrece si la IA
    encontró al cliente (aunque sea por parecido) ni si ya hay uno igual en la lista. Error del alta: en el campo.
    El formulario «Asignar» (`OpsActivityForm`, `ClienteTipoPicker`) no se tocó y sigue con su alta.
  - Desplegado con `deploy/update.sh --with-migrate` (38952929; aplicó también `20261029130000_cctv_disenos`, de la
    sesión del diseñador CCTV; log `/tmp/update-asistente-2910.log`). Se solapó ~70 s con el final de
    `/root/deploy-api-migrar-web.sh` de otra sesión, que no usa el candado de `update.sh`: buscar los dos nombres
    antes de lanzar. Revisado en Chrome como CEO sin crear nada: «talks» → tarjeta con «+ Agregar cliente «Toks»»,
    «Corregido de "talks"» en Lugar; en «Nueva actividad» → Servicio sigue «+ Nuevo cliente corporativo».

- **29-10 ~11:30 (claude-code) — Apps: paridad con lo de Core del 28-10 (Android e iOS).**
  - Android (`apps/mobile-native/android`), alta/asignar y detalle:
    - Catálogo cerrado de 17 tipos en 4 familias (`CoreActivityKinds.FAMILIAS_TAREA`, `tiposDeFamilia`), íconos como
      la web (`NxGlyph` nuevos). Sin «Otro»: un texto libre viejo se lee como «otro» y al guardar pide el tipo.
    - «Entregar a más tardar» (`horaCompromiso` → `fechaMaxima` y `fechaEntregaEsperada`, validado contra el inicio).
      El detalle muestra «Antes de 17:00» en la tira y «· a más tardar 17:00» en «Entrega esperada».
    - Complejidad con sugerencia de la IA y tiempo típico (`Complejidad.kt` + `ComplejidadCampo.kt`; `ai/complejidad/
      tiempos` y `sugerir`), y «Complejidad» en los datos del detalle.
    - Pizarra del equipo: sección «En espera de revisión» (`GET me/revisiones`, `EnEsperaRevision.kt`), «Revisar»
      abre Evidencias. Muestra 30; el resto remite a la web.
  - iOS (`apps/mobile-native/ios`), lo mismo: `CoreActivityRules.swift` (`CoreFamiliaTarea`, `CoreComplejidad`,
    `compromisoValido`, `horaCompromisoDe`), `CoreActivityFormView.swift` (chips por familia, interruptor «Entregar a
    más tardar», sección «Complejidad · opcional»), detalle con «Complejidad» y la hora compromiso, y la pizarra con
    «En espera de revisión» (`EnEsperaRevision.swift`, `revisionesPendientes()`). El demo responde `ai/complejidad/*`
    y `me/revisiones` para las capturas de paridad. Sin Mac: lo compila `ios-screenshots.yml` al subir.
  - Las dos apps: `ai/complejidad/sugerir` no entra a la cola sin conexión, y una fecha máxima a las 23:59 se lee
    como fin del día (no como «Antes de 23:59»).
  - Ya estaban: cierre «No cumplida» al checar salida (textos espejo de 613ee251) y los avisos push (genéricos por
    `tag`/`collapse_key`, sirven para los recordatorios de 9761d2d9 y bfc18fec).
  - Sin portar (piden artboard o no aplican al teléfono): línea del día, Desempeño de cuatro pilares, tarjeta de
    tiempo/costo del detalle.
  - Pruebas: Android 844 unitarias en verde (`ComplejidadTest`, `EnEsperaRevisionTest`, `CoreActivityKindsTest`).
    Nada subido a tiendas.

- **29-10 ~10:40 (claude-code) — Recordatorio de entrada: «buenos días» y push cada 2 min hasta que cheque (pedido de Adam).**
  - Adam: «que la misma plataforma les vaya comentando a todos como de buenos días, ¿ya registraste tu entrada?…
    notificación push cada dos minutos… y los estén muele y muele y muele».
  - Reglas puras en `src/attendance/recordatorio-entrada.ts` y servicio `recordatorio-entrada.service.ts` (cron
    `asistencia-recordatorio-entrada`, cada minuto). Horario de cada quien con `horarioDePersona`, el mismo que mide
    retardos: oficina 10:00–18:00, cuadrilla de campo 08:00–17:00 (`work_schedules`), gracia de 15 min si no tiene
    otra.
    - A su hora de entrada: un «Buenos días, <nombre> ☀️ · ¿Ya registraste tu entrada?» (`ATTENDANCE_ABSENCE`,
      `entityType RecordatorioEntrada`). Es la **única fila del día por persona**; con ella se decide «ya saludé».
      **Quien ya checó no recibe nada de aquí** (entrada de hoy o `AttendanceDay` de hoy, la misma señal de
      `recordatorios-jornada`): desde su entrada lo toma ese job («sin actividad», «por vencer»), nunca los dos.
      La insistencia no usa `createNotification` como aquel porque cada push de 2 min sería una fila.
    - Desde la entrada más la gracia (10:15 / 08:15, igual que el retardo; **decidido 29-10, Adam lo aprobó**), sin
      checar: push «No has registrado tu entrada» cada 2 min, **solo push, sin fila**. Una sola tarjeta que se reemplaza y vuelve a sonar (`tag nx_entrada_u<id>`; en iOS
      `apns-collapse-id` con el nuevo `PushPayload.reemplazar`).
    - Para al checar, al llegar su salida, con falta justificada, permiso/vacaciones aprobados (`leave_requests`)
      o en descanso: sábado, domingo y festivos de la LFT art. 74, salvo guardia. Días que da la empresa además de
      la ley: `DESCANSOS_ACORDADOS` en `recordatorio-entrada.ts` (**el lunes 2-nov, decidido 29-10 y aprobado por
      Adam**: no es festivo de ley, pero insistir cada 2 min en un día de descanso molesta a todos y saltarlo solo
      quita el recordatorio; retardos, KPI y nómina no leen esa lista) más `ASISTENCIA_DIAS_DE_DESCANSO=AAAA-MM-DD,…`,
      que desde ese día sí llega al contenedor (antes faltaba en el `environment` de `docker-compose.nexara.yml`).
    - Fuera: dirección 24/7 (ceo, arquitecto…), cuentas de plataforma y el equipo ficticio `@demo.invalid`.
  - Varias instancias: cada aviso se reclama con una escritura condicional en `user_preferences`
    (`asistencia.recordatorio_entrada` = último turno `AAAA-MM-DD HH:MM`, una fila por persona). Ni esa tabla ni
    `notifications` pasan por `audit_logs`. Disco al 70 % el 29-10.
  - Pruebas: `recordatorio-entrada.spec.ts` 19 en verde (regla y servicio con dos instancias simuladas); suite de la
    API 320/3877 en verde. `tsc` limpio sobre `HEAD` + estos archivos; en el checkout compartido falla en
    `activities.service.ts` por trabajo sin commitear de otra sesión (tiempo estándar), no por esto.
  - Sin migración.
  - Desplegado `bfc18fec` con `deploy-api-web.sh` (API y web; FIN a las 10:45, disco 71 %). Primera corrida 10:41:
    buenos días a 6 sin entrada (u13 Carolina, u16 Israel, u61 Antonio, u62 Jesús, u63 Ricardo, u64 Genaro); push
    «sin entrada» a las 10:43 y 10:45, nada en los minutos pares, 0 filas nuevas en `audit_logs`. Antonio, Jesús,
    Ricardo y Genaro no tienen teléfono registrado (`UserPushEndpoint`): solo les llega la fila de la campana. El log
    cuenta a quien se le intentó, no a quien le llegó.

- **29-10 ~11:00 (claude-code) — Diseñador de videovigilancia, fase 1: ingeniería inversa de SYSCOM y motor de cálculo.**
  - Pedido de Adam: un módulo de Core que haga lo que David sacó con el diseñador de SYSCOM («Proyecto CCTV Bodegas
    VDM», 14 cámaras, PDF en `Downloads`). Lo usan los encargados de área y el arquitecto. No entran los ingenieros
    de soporte ni los instaladores; sí el encargado de instalación (David) y el de soporte (José Antonio).
  - Especificación completa en `docs/DISENADOR-CCTV.md`:
    - flujo de SYSCOM y su modelo de datos (sacado de la vista pública de solo lectura del proyecto, sin sesión);
    - fórmulas comprobadas contra el PDF y diseño de croquis → plano, 3D, vista por cámara, catálogo, PDF;
    - acceso por rol y fases.
  - Motor en `apps/web/lib/cctv/`, puro TypeScript y sin pantallas:
    - `optica.ts`: HFOV/VFOV por focal y sensor, PPM, DORI IEC 62676-4, zona ciega, bandas. Reproduce el PDF:
      109 PPM a 13.8 m, identificación 6 m y reconocimiento 11.9 m por la visual, zona ciega 2.4 m, persona a
      10.3 m con 134 PPM.
    - `plano.ts`: geometría en px del croquis más escala calibrada; muros partidos por puertas, ventanas y
      accesos; obstáculos.
    - `visibilidad.ts`: cuadro de la lente, oclusión 3D por muros, polígonos DORI recortados, estado del
      humanoide, mapa de calor.
    - `infraestructura.ts`: Mbps, TB, discos, PoE y cable UTP.
  - Decisión: los anillos se miden en el piso con la altura descontada. SYSCOM promete identificación «hasta 6 m»
    con la cámara a 5 m; en realidad son 4.3 m. La ficha guarda las dos lecturas.
  - Pruebas: `npx vitest run lib/cctv` 4 archivos / 36 en verde; `tsc` de la web limpio. Nada desplegado: no
    hay pantallas.
  - Mockup publicado (lienzo privado de Adam): https://claude.ai/artifact/9SmTSdB2wuyDFYr1eEHghZ
    - Cinco pantallas: lista y alta, editor 2D, vista 3D con vistas de cámara, ficha de cámara y dos hojas de la
      propuesta.
    - El plano, la isométrica y las vistas de cámara salen del motor real con la bodega VDM. El interior queda
      79 % cubierto: 14 % identificación, 50 % reconocimiento, 16 % observación.
    - **Espera el visto bueno de Adam: no construir pantallas antes.**
  - Sigue la fase 2: módulo `erp-videovigilancia`, permisos, proyectos y editor 2D. `schema.prisma` tenía cambios
    ajenos sin commitear el 29-10: el modelo `CctvProyecto` va en su propio commit cuando esos entren.
  - Para el acceso hay que decidir algo: José Antonio comparte `ing_soporte` con Carolina y Alejandro. La
    propuesta es entrar por «tener reportes directos»; la otra opción es pasarlo a `enc_soporte`.

- **29-10 ~10:45 (claude-code) — Recordatorios insistentes en la jornada (pedido de Adam).**
  - `src/activities/recordatorios-jornada.ts` (reglas puras + spec) y `recordatorios-jornada.service.ts` (cron
    `recordatorios-jornada`, cada 5 min; lunes a sábado, de 7:00 a 20:00 de México). Solo se avisa con la jornada
    abierta (`AttendanceDay.isOpen` de hoy), sin las cuentas que no son empleados.
    - Sin reloj de actividad corriendo, fuera de la comida: push «No tienes ninguna actividad abierta/en curso» cada
      5 min (`SLA_ALERT`, prioridad alta, `collapseKey nx_sin_actividad_u<id>`, dedupe 4 min, lleva a «Mis actividades»).
    - Actividad sin entregar a ≤ 30 min de su límite o ya pasada, con el límite de hoy: push cada 10 min a quien la
      ejecuta (`ACTIVITY_OVERDUE`, `nx_vence_<act>_u<id>`, dedupe 9 min) hasta que la entregue o cheque salida. Lo
      de días anteriores (p. ej. AN-0009) no se persigue.
  - El cierre no cambia y ya hace lo que pidió Adam: al checar su **salida propia**, lo del día no entregado queda
    «No cumplida»; sin checar salida las sigue teniendo. La salida automática no cierra (Adam: «si todavía no marcan su
    salida, pueden seguirlas teniendo»).
  - Sin migración (tipos de aviso que ya existen).

- **29-10 ~10:20 (claude-code) — Lo enviado a revisión ya no se avisa como «vencida» (regla de Adam).**
  - Adam: «una cosa son las actividades que se mandan a revisión… no importa si lo califico ahorita o en un año. Y
    la otra, el cumplimiento… en tiempo y forma, en un mismo día»; al checar salida se botan como vencidas las del
    día no cerradas, **nunca las ya enviadas a revisión: esas son cumplidas**.
  - Lo que le llegó (no era el cierre de las 7): desde al menos el 20-10, cada día. El 29-10 a las 9:00 fueron
    403 «… está vencida» sobre 120 actividades (116 «Por Validar») y 110 «Recordatorio: evidencia por revisar».
    - `cron.service.ts` (`sla-breach-escalate`, cada hora, dedupe 20 h) filtraba con `OPEN_ACTIVITY_WHERE`, que
      trata «Por Validar» como abierta.
    - `ticket-alerts` («por vencer» / «vencida» de clientes) y `actividades-atrasadas` usaban `closedStatus*`.
    - El recordatorio de evidencias iba al **responsable**: en lo autoasignado, la misma persona que la envió.
  - Cambio: `SIN_PLAZO_STATUSES` (cerradas + «Por Validar») en `activity-status.ts` (`sinPlazoStatusVariants`,
    `sinPlazoStatusSqlList`, `isSinPlazoStatus`; con spec). Los tres avisos de plazo filtran con eso. `closedStatus*`
    no cambia: las listas y la revisión siguen viendo «Por Validar» como abierta. Se borró
    `activity-evidence-reminder.cron.ts` (+ spec); el resumen «Tu día» de las 8:00 ya dice cuántas esperan revisión.
  - «En espera de revisión» sin semáforo: columna «Enviada» neutra, fuera la cifra «Esperan más de un día»; el
    resumen dice «entregadas: ya cuentan como cumplidas».
  - Datos: AN-0328 (Josué, del 28-10) también «No cumplida», con el mismo script (`/root/cierre-an0328.sql`; respaldo
    `an0328-*.jsonl` en `/root/respaldo-cierre-2910/`). Adam confirmó que «José Luis» era José Antonio (AN-0334).
    AN-0009 (Daniela Galindo, 30-09) sigue abierta, sin indicación.

- **29-10 ~08:45 (claude-code) — Las 7 actividades del 28-10 que seguían abiertas, cerradas a mano (orden de Adam).**
  - Por qué no se cerraron solas: AN-0324/0325/0332/0334/0340 eran de gente que checó su salida propia entre 17:11 y
    18:26, antes de que entrara el cierre por checada (613ee251, ~19:00) y antes de que la sesión del cierre las
    reabriera (~19:00). Ninguna salida posterior las volvió a evaluar: hueco de una sola vez por la transición.
    AN-0336 (David, salida 17:27) y AN-0342 (Josué, 19:30) tenían solo **salida automática**, y la regla vigente
    no cierra con la automática (`salidasPropias`: `cierreAutomatico = false`). Eso sí se repetirá con quien no
    cheque su salida: falta que Adam diga si la salida automática también cierra lo pendiente.
  - Hecho en la base (`/root/cierre-2910.sql`, una transacción con guarda; respaldo `/root/respaldo-cierre-2910/` y
    copia en `C:\dev\_scratch\respaldos-hetzner\respaldo-cierre-2910\`):
    - «Finalizada» (cumplidas): AN-0324 Erick, AN-0325 Salvador, AN-0340 Carlos (peinado de cable) y AN-0332 Roberto.
      `fechaFinalizacion` = su salida del 28-10, revisión APROBADA de Adam (id 2, sin calificación, sin tocar el
      `status` de la evidencia), como las terminadas del 28-10.
    - «No cumplida»: AN-0334 José Antonio (Adam dijo «José Luis»; es el único José de la lista además de Josué),
      AN-0336 David y AN-0342 Josué. `activity_non_compliances` MANUAL, causa SIN_ENTREGA, registrada por Adam (id 2)
      a la hora de su salida del 28-10. Sin notificación (se escribió por SQL).
    - Las 7 llevan su fila en `audit_logs` (source `correccion-manual`). Los relojes ya estaban cerrados.
  - Siguen abiertas y vencidas, sin tocar: **AN-0328** (Josué, «Dibujo Planta Arquitectónica», vencía 28-10 10:30; es
    la «Atrasada» que queda en la pizarra) y **AN-0009** (Daniela Galindo, del 30-09). Esperan a Adam.

- **28-10 ~20:30 (claude-code) — Actividades › «En espera de revisión» y la flecha de regresar al origen (pedido de Adam).**
  - Pestaña nueva en `/erp/pizarra` (`?vista=revision`), entre «Asignadas por mí» y «Solicitudes»: la ven Christian,
    quien tiene gente a cargo y quien, sin equipo, tiene algo por revisar o ya revisó algo. Lleva el número de pendientes.
    `components/pizarra/EnEsperaRevisionView.tsx` (+ css + spec):
    - «Por revisar»: actividad, quién la envió, desde cuándo espera (verde < 4 h, ámbar, rojo > 1 día) y botón «Revisar».
      Ese botón abre `/erp/actividades/:id/evidencias?origen=revision#revision`, con el aprobar/devolver y las estrellas
      de siempre (`EquipoEvidencias`). La que más lleva esperando va primero. Las correcciones reenviadas se marcan.
    - «Revisadas por ti» (`&ver=revisadas`): lo que revisó en 30 días, con la decisión y la calificación.
  - API `GET me/revisiones` (`MyActivitiesService.pendingReviews`): evidencias `COMPLETED` y sin aprobar ni devolver, de
    actividades no cerradas, que quien mira puede revisar. La regla de quién revisa a quién salió de `teamEvidence` a
    `src/me/revision-evidencias.ts` (+ spec): la usan las dos, así la lista no ofrece nada que luego dé 403. Incluye
    evidencia enviada de una actividad que sigue «En Proceso» (falta otro del equipo), igual que el «En espera» de la ficha.
  - Regreso (`lib/actividad-origen.ts` + spec): `?origen=revision|revisadas|historial|persona` (`&persona=<id>`).
    `ActivityDetailShell` lo lee, lo pasa a sus pestañas y al «Revisar evidencias», y la miga vuelve a «En espera de
    revisión», a «Revisadas», a `/erp/pizarra/:id?pestana=historial` («Historial de Iván») o a la ficha. Sin origen
    sigue volviendo a la pizarra, como antes. `RouteTabs` marca la pestaña activa por la ruta, sin el `?`.
  - Ficha de la persona: la pestaña Historial queda en la URL (`?pestana=historial`) y sus «Abrir actividad» llevan el
    origen. En una actividad entregada sin visto bueno sale «Revisar evidencia». La pizarra también refleja la pestaña en la URL.
  - Evidencias: con `#revision`/`#captura` la página baja al bloque una vez que la actividad carga (antes el ancla
    aún no existía y se quedaba arriba).
  - Pruebas: web 173 archivos / 1,342 y API `src/me` 18 suites / 195, en verde; `tsc` limpio en los dos.
  - **Desplegado API + web** (`dcd2f802`, con `deploy-api-web.sh`: la API cambió, así que no bastaba el web) y revisado
    en el Chrome de Adam como Christian, solo lectura:
    - La pestaña sale con **121 por revisar, 110 de más de un día** (las más viejas, del 8 oct). Es dato real, no
      error: hay mucho «Por Validar» que nadie aprobó. Adam decide si se revisan o se cierran en lote.
    - «Revisar» en AN-0130 abre Evidencias con Aprobar/Devolver a la vista; la miga «‹ En espera de revisión» regresa a
      la pestaña, y Detalle/Evidencias/Historial conservan el origen.
    - Ficha de Iván (`/erp/pizarra/10?pestana=historial`): abre en Historial; «Revisar evidencia» → miga «Historial de
      Iván» → regresa a su Historial.
    - «Revisadas por ti» de Christian llega al tope de 100: el pie ya dice «Las 100 más recientes» (ajuste aparte).

- **28-10 ~20:15 (claude-code) — audit_logs: fuera el latido de sesión y las masivas que no tocan filas.**
  - Medido en producción: disco del Hetzner al 88 % (no al 98 % del 27-10); `audit_logs` pesa 14 GB con 5.7 M de
    filas. El webhook de INTEGRA ya no entra, pero en 6 h se escribieron ≈24 mil `UPDATE UserSession` (solo
    `lastSeenAt`, el latido de `auth.service.ts`) y ≈10 mil BULK de chat (`ChatService.ensureDefaults` corre
    `updateMany`/`createMany`/`deleteMany` en cada consulta y casi siempre afectan 0 filas): ≈8 mil filas por hora en
    horario laboral, ≈250 MB al día.
  - `isAuditNoise` en `prisma.service.ts` (con pruebas en `prisma-tenant-audit.spec.ts`): no se audita una masiva con
    `count` 0 ni un `UserSession.update` que solo cambia `lastSeenAt`. Crear, renovar o revocar sesión sí.
  - **Limpieza hecha con el OK de Adam (28-10 ~20:48):** en una sola transacción se copiaron aparte las filas que se
    quedan, `TRUNCATE public.audit_logs` y se reinsertaron (con tope de seguridad: abortaba si no quedaban entre 250 y
    450 mil). Se fueron 5.37 M de filas de ruido: 3.30 M `integra POST_OK` del webhook (`/api/integra/hik/…`, sin
    usuario, guardaban el cuerpo entero: ≈12 GB en TOAST), 0.87 M de `IntegraPushEvent`, 0.81 M de latidos de sesión,
    0.28 M de masivas con `affected` 0 y 0.10 M de reescrituras de #general/#anuncios. Quedan 326,797 filas; la tabla
    pasó de 14 GB a 126 MB y el disco de 89 % a 69 % (23 GB libres). La salud de la API quedó en 200.
    `backup_20260828b.audit_logs` (40 kB) no se tocó.
  - Medido tras el despliegue: 100 filas en 14 min de noche, sin latidos ni masivas en 0. Quedaba el chat reescribiendo
    #general y #anuncios en cada consulta (`fc78f21f`: ahora solo si cambiaron).
  - **Incidente 20:35:** dos sesiones corrieron `update.sh` a la vez; el disco llegó a 99 % (1.4 GB libres) y compose
    chocó con un nombre de contenedor en uso. Se vació la caché de build (3.9 GB, vuelve a 88 %), la base y Redis no
    se cayeron y la API quedó sana con `fc78f21f`. `update.sh` ahora toma `flock /tmp/nexara-update.lock` (`4f87882e`,
    ya en el servidor). Con el disco base en 88 % un build de web+api deja poco margen: liberar espacio (arriba) urge.

- **28-10 ~19:30 (claude-code) — Desempeño como en el canvas y eficiencia de la pizarra sin plan.**
  - Desempeño (`/erp/asistencias/indicadores`): `components/kpis/DesempenoTablero.tsx` (+ css) reemplaza la franja de
    cifras y el ranking.
    - Arriba, banda oscura con el índice del equipo en anillo, entregas a tiempo, tiempo en actividades y extra por decidir.
    - Tabla por persona con cuatro pilares (`lib/desempeno.ts`): Confiabilidad = entregas + tiempo, Calidad = forma,
      Rendimiento = ritmo + ocupación, Disciplina = asistencia + uniforme. Se promedian con los mismos pesos de la API.
      El índice no cambia; la fórmula v2 sigue esperando §7.4.
    - Al lado, la lectura de la persona elegida: resumen, datos y de qué sale su número. La confianza depende de las
      entregas medidas (≥15 alta, ≥5 media).
    - «Actividad por día» queda abajo.
  - Eficiencia en 0 % (pedido de Adam): la pizarra solo tomaba `horasPlan` de la persona. De las 136 cerradas de 4
    semanas, solo 14 lo tenían y otras 48 tenían el estimado de la actividad. Ahora usa `minutosPlanDe(horasPlan,
    tiempoEstimadoMin)` (`me/pizarra-kpi.ts`), el mismo plan de Desempeño. Sin ningún plan, la tarjeta dice «Sin dato»
    con el motivo, en vez de una barra en 0 %.
  - Complejidad: los niveles caben de dos en dos en columnas angostas, con ayudas cortas; la definición completa va en
    el `title`.
  - AN-0324, AN-0340 y AN-0341: los reabrió la sesión del cierre (19:00) y siguen «En Proceso», sin incumplimiento.
    Adam decide si se dejan así para que suban su foto de salida o si se finalizan.

- **28-10 ~19:00 (claude-code) — Cierre «No cumplida» solo al checar salida; salida de zona justificada libera la foto de salida (urgente de Adam).**
  - Causa: el cron `actividades-cierre-jornada` (cada 5 min, desde el 22-10) cerraba a la hora de salida del horario
    (18:00, o 17:00 con `work_schedules` propio) antes de que la gente checara. El 28-10 cerró 10 actividades
    (AN-0324/0325/0332/0340 a las 17:00; AN-0328/0334/0336/0341/0342/0343 a las 18:00) y ya no podían subir la foto de salida.
  - Regla nueva (Adam): **el cierre es la checada de salida propia** (ni la automática de las 23:30 ni la de un jefe).
    `AttendanceService.register` publica `attendance.checkout` en el bus de dominio; `ActivityNonComplianceService.alChecarSalida`
    cierra lo que vencía ese día o antes y no entregó (en equipo, cuando ya salieron todos los que no entregaron).
    Pasarse de la hora no cierra (semáforo rojo con minutos de atraso). Se quitaron el cron y el aviso previo de 1 h
    (`notifyActivityClosingSoon` quedó sin uso). Reglas puras: `decidirCierrePorSalida`/`salidaCuentaDesde` en `incumplimiento.ts`.
  - Geocerca: si la alerta de zona más reciente está `JUSTIFICADA`, `validarSalida` acepta fuera de 500 m y `estado()`
    manda `exigeMismaUbicacion=false` + `salidaJustificada` (web/Android/iOS ya publicados solo pre-bloquean con esa bandera).
    Al rechazar una salida lejos se abre la alerta para poder justificarla. Textos espejo actualizados en Android/iOS (salen con la próxima build).
  - Datos 28-10: respaldo en el servidor `/root/respaldo-reapertura-2810/*.jsonl` (y copia en `C:\dev\_scratch\respaldos-hetzner\`).
    Reabiertas 9 (todas menos AN-0343: Daniela checó a las 15:05, antes del cierre); se borraron sus 9 registros de
    `activity_non_compliances` y los relojes cortados con `CORTE_DIA` pasaron a la hora de su salida (`SALIDA`) o siguen corriendo.
    Las del 22–27: Adam dijo «déjalas como terminadas». 13 pasaron de «No cumplida» a «Finalizada» (`fechaFinalizacion` =
    hora del cierre original): AN-0258/0259/0260/0266/0268/0271/0280/0287/0303/0311/0314/0316/0317. Cada una lleva una
    revisión APROBADA de Adam (reviewer 2, sin calificación, sin tocar el `status` de la evidencia), una fila en
    `audit_logs` (source `correccion-manual`, previousData completo) y sin su `activity_non_compliances`. Respaldo:
    `/root/respaldo-terminadas-2810/`. AN-0286 (Alejandro) se hizo después con el mismo formato (la sesión principal lo
    confirmó): 14 en total. AN-0284 (Erick) y AN-0343 (Daniela) no entran: checaron antes del cierre. AN-0324/0340/0341
    de hoy (Erick, Carlos, Alejandro) son de la sesión principal, en espera de Adam.
  - Despliegue: **solo la API** (613ee251, sana). Se detuvo `update.sh` antes del build del web: el disco llegó a 96 %
    (3.3 GB libres) y el web pide ~7 GB. La imagen web sigue en 5e8d8e57; mis dos textos web (`AvisoIncumplimiento`
    «Al cerrar su jornada» y el mensaje de geocerca) salen con el próximo deploy del web (mirar `df -h /` antes).
  - Verificado en producción: `estado(375,15)` da `exigeMismaUbicacion=false, salidaJustificada=true` y `validarSalida` a
    ~8.5 km pasa. El cierre por salida aún no se ha visto en vivo: Josué (3) y David (8) seguían en jornada a las 19:00;
    al checar debe salir en `docker logs nexara-api` «Salida de N: … no cumplida(s)».
  - Pendiente aparte (Adam): margen de 5–10 min en la ubicación por mala señal y obligar a tener la ubicación encendida.

- **28-10 ~23:30 (claude-code) — Asignar: complejidad con sugerencia de IA y tiempo típico (pedido de Adam: «ambos»).**
  - BD: `Activity.complejidad` y `complejidadSugerida` (`BASICA|ESTANDAR|COMPLEJA|CRITICA`), migración
    `20261028220000_actividad_complejidad`. **Va con `prisma migrate deploy`**: el script `deploy-api-web.sh` no migra.
  - API `src/ai/complejidad/`:
    - `GET ai/complejidad/tiempos?coreKind&tipo`: mediana del reloj por persona de las terminadas o por validar de
      ese tipo, en total y por nivel. Cuenta desde 3 anteriores, en los últimos 120 días, sin la semana demo y sin los
      tramos que cortó el sistema (`TOPE_12H`, `CORTE_DIA`). Caché de 10 min.
    - Los textos libres viejos se leen con `subtipoDeTarea` («instalacion.» → Instalación).
    - `POST ai/complejidad/sugerir`: Haiku 5.5 por la puerta (`x-proceso: complejidad`), 6 s sin reintento; si falla
      no hay sugerencia.
    - Eval `--funcion complejidad`: 22 casos, 21/22, p50 1.4 s, 0.000055 USD. Contrato en §8 de `IA-CLAUDE.md`.
  - Web:
    - `components/ops/ComplejidadCampo.tsx` va en «¿Qué se va a hacer?» (solo Core; en tarea, después del tipo). Lleva
      los cuatro niveles con el tiempo de cada uno, la sugerencia (se toma si nadie eligió; si eligen otra se guardan
      las dos) y «Usar X como tiempo estimado». En asignar ese botón ajusta también la rueda de la página
      (`onTiempoTipico`).
    - El detalle muestra «Complejidad» en los datos clave, con lo que sugirió la IA si fue otra.
  - Pruebas: web 1,305 y API `activities` + `ai` 500, en verde.

- **28-10 ~22:00 (claude-code) — Asignar actividad: tipos cerrados, hora compromiso y carga del equipo (pedido de Adam: «Sí, Asignar»).**
  - `lib/activity-kinds.ts`: la tarea pasa a un catálogo cerrado de 17 tipos en 4 familias (`FAMILIAS_TAREA`: En
    campo, Oficina técnica, Administración, Para todos). Ya no hay «Otro» en los chips; `'otro'` queda solo para leer
    lo viejo. Los íconos nuevos están en `ActivityKindIcon.tsx`. El asistente de IA (`asistente-actividades.ts`,
    `SUBTIPOS_TAREA`) usa la misma lista y «Otro» como respaldo.
  - `OpsActivityForm.tsx`: los chips van agrupados por familia y el texto libre viejo se llama «Tipo anterior». Hay
    campo nuevo «Entregar a más tardar» (`horaCompromiso`, solo en Core y sin periodo). Se guarda en `fechaMaxima` y
    `fechaEntregaEsperada` (`horaLimite` en `lib/ops-activity-form.ts`) y se valida que sea después del inicio
    (`compromisoValido`). Sin compromiso todo sigue igual: la API lo toma como fin del día. Pruebas en
    `lib/ops-activity-compromiso.spec.ts`.
  - Asignar (`pizarra/[userId]/asignar`): cada persona del equipo lleva su carga de hoy (`cargaDelDia` en
    `lib/linea-del-dia.ts`): «Libre desde 12:10», «2 abiertas · 3 h planeadas · trabajando», «Sin checar hoy» o
    «Ya salió». Se muestra con `OpcionPersona detalle`.
  - Pendiente del canvas: la complejidad con sugerencia de la IA, que pide una migración y la puerta, y el tiempo
    típico por tipo. Las apps móviles conservan su catálogo viejo (`CoreActivityKinds.kt`, `CoreActivityRules.swift`).
  - **Desplegado** API + web (`411cb0c0`) y revisado en el Chrome de Adam en `/erp/pizarra/10/asignar`:
    - salen los chips por familia;
    - cada persona muestra su carga («Sin checar hoy», «Ya salió», «1 abierta · 1 h planeadas · trabajando»).
    - `974503d3` saca «Entregar a más tardar» a un renglón propio, porque caía en una cuarta columna angosta.
    - La mayoría sale sin «h planeadas» porque su actividad abierta no tiene `minutosPlan`.

- **28-10 ~21:15 (claude-code) — Detalle de actividad: tarjeta «Tiempo» y «Costo directo» (pedido de Adam).**
  - `components/ops/TiempoActividad.tsx` (+ css + spec) es una tarjeta oscura con un anillo: lo trabajado contra lo
    planeado y el tope (el máximo, o el plan + 25 %), con los estados en tiempo · cerca · excedida. Las cuentas
    están en `medidorDeTiempo` (`lib/actividad-tiempos.ts`, spec en `lib/actividad-medidor.spec.ts`). Reemplaza el
    renglón «Tiempo» de «Datos clave».
  - `components/ops/CostoActividad.tsx` suma los viáticos imputados (su parte del reparto) y el material del
    almacén. Solo la ven CEO, dirección y coordinaciones, y no se pinta si no hay nada que sumar. La mano de obra y
    el margen esperan a que la nómina y la factura pasen por el sistema.
  - `RecordPage` gana la ranura `asideTop` (una tarjeta antes de los datos clave).
  - Verificación: 1,293 pruebas del web y los tipos, en verde.
  - **Desplegado** (`2bf8a110` + `2aa63b9c`) y revisado en el Chrome de Adam:
    - AN-0331 no tiene plan, y la tarjeta lo dice («sin tiempo planeado»).
    - AN-0337 da «3 h 14 min de 1 h planeadas · le quedan 46 min para el tope», con el anillo en ámbar.
    - `2aa63b9c`: «en curso» toma a cualquiera del equipo con sesión abierta, no solo a quien mira.
    - Ojo: el plan es el de la persona (`horasPlan`, aquí 1 h) aunque el estimado general sea 3 h; es la misma
      regla del semáforo.

- **28-10 ~20:45 (claude-code) — Pizarra · «Línea del día» en «Mi equipo» (pedido de Adam: «Pizarra primero»).**
  - API: `GET me/kpis/linea-del-dia?fecha=` (`KpisEquipoService.getLineaDelDia`). Devuelve un día de todo el
    equipo, con el mismo alcance y el mismo cálculo que el detalle por persona (`calculaKpisPersona`,
    `detalle: true`): jornada, comida y los tramos con reloj de cada actividad. Tiene su prueba en
    `kpis-equipo.service.spec.ts`.
  - Web:
    - `lib/linea-del-dia.ts` (puro, con su spec) junta esos tramos con lo abierto de `me/board`: lo programado de
      hoy sin arrancar, lo atrasado y lo libre desde `idleSinceAt`; además arma la regla de horas.
    - `components/pizarra/LineaDelDia.tsx` (+ css + spec) dibuja una fila por persona. Cada bloque enlaza a
      `/erp/actividades/:id` y el hueco libre a «asignar»; lleva la línea de «ahora», una franja con el tipo
      (obra, servicio, comercial, tarea) y una leyenda.
    - En la Pizarra hay un conmutador «Tarjetas | Línea del día», que solo aparece con el rango Hoy; la elección
      se guarda en `nx-equipo-modo`. Las tarjetas siguen siendo la vista por omisión.
  - Verificación: web 1,286 pruebas y API `me/` 252, en verde; los tipos de las dos, limpios.
  - **Desplegado** API + web (`5f298789`) y **verificado en el Chrome de Adam** con datos reales:
    - las jornadas, lo que corre «ahora» y el «Libre · Asignar» de Iván;
    - «Sin checar · entra 08:00» para los nuevos;
    - los retardos contra el horario de campo nuevo.
    - Detalle menor: la etiqueta «ahora» tapa la hora entera más cercana de la regla.

- **28-10 ~17:00 (claude-code) — Pasada UI/UX de Core, fase 1: el lenguaje nuevo en todo Core desde los tokens.**
  - Adam eligió verde para Core (separado del azul del sitio) y lo demás como yo recomendara. Cambios:
    - `ui-tokens.scss`:
      - verde #168570 (4.5:1 con blanco) y fondo #eef1f5;
      - sombras largas y suaves (`--ui-elev-*`) y radios 8/10/14/20;
      - títulos h1/h2 en Inter Tight (`--ui-font-display`, cargada en `app/layout.tsx`);
      - dentro de `.nx-app-shell` los semánticos viejos (`--primary` azul, `--surface`, `--text-*`, `--border`)
        apuntan a `--ui-*`, así que todos los módulos toman el mismo verde y gris sin tocarlos uno por uno.
    - `AppShell.module.scss`: el menú vive sobre el fondo (sin columna ni borde), el activo es una pastilla
      blanca con sombra; búsqueda, barra superior translúcida y el botón «Nueva actividad» con halo verde; en el
      cajón móvil el menú lleva fondo propio.
    - Menú: «Recursos» → «Equipo y recursos» con «Desempeño» (antes «KPIs del equipo», misma ruta);
      «Facturación CFDI» → «Facturación»; «Pagos a personal» → «Nómina» (etiquetas, migas, rieles y permisos).
  - Fase 2, primera parte (`cd229e31`), en `DashKit.module.css`:
    - la banda de Hoy y del resumen general es oscura, con el brillo del sitio;
    - los botones dentro de la banda se invierten (`:global(.nx-btn--*)`);
    - las tarjetas del kit flotan con radio 22, las etiquetas pierden las mayúsculas forzadas y las cifras van en
      Inter Tight.
  - **Desplegado** el web (`063d0e0b` y `cd229e31`). En producción el CSS trae #168570, las sombras nuevas e Inter Tight.
    Disco al 89 %.
  - Pendiente del resto de la fase 2: contenido de Pizarra, Detalle, Asignar, Desempeño y Nómina como en el canvas;
    después, las apps.
  - Verificación: typecheck y 776 pruebas del web en verde.
    - En local no se pudo ver: Docker Desktop no arrancó, por el error del socket de siempre.
    - Dentro de Core tampoco: la extensión de Chrome estaba desconectada y el navegador integrado no tiene sesión.
      Ahí hay una contraseña guardada de gerencia@ que **no se usó**.
    - Falta que Adam mire Core por dentro.
  - **Revisado en el Chrome de Adam** (sesión de Christian, solo lectura): Hoy, Actividades, Desempeño, Nómina,
    Cotizaciones, Almacén, Contabilidad y el formulario nuevo. Correcciones en `2eac3f10`, desplegado y verificado:
    - el menú decía «Pagos a empleados»: el título sale de `ERP_FINANCE_COPY` en `section-views.ts`;
    - las migas ya no muestran la carpeta «Finance» (`SEGMENTOS_SIN_MIGA`);
    - los títulos de grupo van en minúsculas;
    - `PANEL_META.erp.accent` pasó de #2563EB al verde;
    - las tarjetas de personas de la Pizarra flotan.

- **28-10 ~16:00 (claude-code) — Propuesta visual de la pasada UI/UX de Core y apps (nada construido).**
  - Canvas privado: https://claude.ai/artifact/WfLuBU8tk81cYoHVG8kAR7. Son 6 pantallas de escritorio (Hoy, Pizarra,
    Detalle, Asignar, Desempeño, Nómina) y 2 de la app (Mi día, Entregar evidencia), con datos inventados.
  - Adam la vio «muy plana» y se rehízo con el lenguaje del sitio: banda oscura con resplendor (aurora), tarjetas
    flotantes con sombra en vez de bordes, la paleta de marca por tipo de trabajo (verde campo, naranja comercial,
    magenta oficina técnica, cielo logística), anillos y gráficas pequeñas, y tipografía Inter Tight grande.
  - Decisiones abiertas: acento azul del sitio (#0060f0) o verde de Core (#168570, el #1f9e84 no pasa contraste);
    menú reagrupado (Hoy · Clientes y obra · Equipo y recursos · Dinero). Hoy Core mezcla tres juegos de letra
    (Space Grotesk, Inter Tight, Manrope e Inter) y dos tokens (`--ui-*` teal y `--primary` azul viejo).
  - Spec v2: la sección 7.3 ter (pagos, costo y margen) y las decisiones 9 y 10 están arriba.

- **28-10 ~15:00 (claude-code) — Datos de producción: horario de campo y sueldos del tabulador capturados.**
  - Pedido de Adam. Se escribió con Prisma dentro de `nexara-api`, en una transacción, como lo hacen las pantallas, y
    con bitácora (`audit_logs`: 9 `HORARIO_PROPIO`, 15 `SUELDO_SEMANAL`, actor Adam, id 2). **Sin cambios de código.**
  - Horario propio 08:00–17:00 L–V (8 h netas, la comida dentro; el divisor de pago sigue en 40 h) para la cuadrilla:
    Israel, Roberto (tenía 10:00–18:00), Salvador, Erick y los 5 nuevos (61–65). Alejandro, Carolina e Iván siguen con
    10:00: en la hoja alternan días de oficina a las 10 con días de campo a las 8.
  - `UserProfile.sueldoSemanal` = «precio por semana» del tabulador del 26-10 (mensual ÷ 4) para 19 personas:
    15 cambiaron o se crearon y 4 ya coincidían. Las reglas de pago (÷4, ÷5 o ÷7, la extra) siguen pendientes de
    Adam y del contador.
  - Respaldo de lo anterior: `C:\dev\secrets\nexara\desempeno-2026-10-28\respaldo-horarios-sueldos-antes-2026-10-28.json`.

- **28-10 ~14:30 (claude-code) — Tabulador y hoja de entradas contra el sistema (solo lectura).**
  - Adam mandó el tabulador vigente y la hoja «Control de entradas y salidas» del 19–23 oct. La nómina vive en Excel:
    `nomina_semanas` y `overtime_approvals` vacías; `sueldoSemanal` coincide con el tabulador en 4 personas, difiere
    en 7 y falta en 8. La hoja usa día ÷5 y extra sencilla; el sistema, ÷7 y ×2 (sin triple, LFT art. 68). La
    oficina va fija 10:00–18:00 en la hoja aunque la checada diga otra cosa; el campo coincide al minuto.
  - Resumen sin montos en `.ai/CUMPLIMIENTO-EVALUADOR-SPEC.md` §7.3 bis y decisiones 6–8; los montos por persona
    van en el informe interno (`C:\dev\secrets\nexara\desempeno-2026-10-28\`). **Nada de código cambió.**

- **28-10 ~13:30 (claude-code) — Análisis de la fórmula de desempeño desde producción (solo lectura); propuesta v2.**
  - Adam pidió analizar la base para llegar a «la fórmula general» de productividad, retardo e ineficiencia. Se
    consultó producción en transacción de solo lectura (28-09 → 28-10). Hallazgos: 87 % autoasignado, límite siempre
    fin del día, 98 % aprobado a la primera, 112 entregas sin revisar, categoría libre con 100 valores, la cuadrilla
    abre una actividad por persona para el mismo trabajo. El «ritmo» (20 pts) castiga al campo.
  - Propuesta v2 en `.ai/CUMPLIMIENTO-EVALUADOR-SPEC.md` §7 (solo agregados): unidad «hora estándar ganada»,
    `30·Confiabilidad + 25·Calidad + 30·Rendimiento + 15·Disciplina`, contracción por muestra, retardo graduado,
    ineficiencia en cinco partes, modelo de coordinación. 5 decisiones de Adam en §7.4. **Nada construido.**
  - Informe con detalle por persona: fuera del repo (es público), en `C:\dev\secrets\nexara\desempeno-2026-10-28\`.
  - La fórmula actual real (`kpis-equipo.ts`, `PESOS_CUMPLIMIENTO`) es 20/10/15/20/15/15/5 + multiplicadores de carga
    y días; la memoria «40/25/25/10» estaba vieja.
  - Quedan 5 cuentas activas de la semana simulada (ids 42–46, sin actividad). No se tocaron.

- **28-10 ~12:00 (claude-code) — «Tu día» sin la casilla de avisos; el ajuste pasó a Notificaciones.**
  - Adam no entendía la casilla «Solo el resumen y lo urgente» al pie de «Tu día» (`TuDiaPanel`): parecía palomear
    algo de la lista. Ahora es un interruptor «Recibir solo lo urgente», con su explicación, en la sección «Avisos
    que recibes» de `/erp/notifications-center` (`components/notifications/AvisosSoloUrgente.tsx` + spec). Misma
    preferencia `notificaciones.solo_resumen`; la API no cambió.
  - Pedido grande de Adam en cola: pasada de UI/UX a todo Core (menús, barra lateral, cada pantalla) y a las apps
    móviles para homologarlas al sitio público, con propuesta visual aprobada antes de construir.

- **28-10 ~11:30 (claude-code) — Mónica fuera de lo público; revelado al bajar en la portada; API sin cuentas de baja.**
  - Adam: Mónica García (soluciones@) existe pero no puede aparecer en público. Salió de `EQUIPO` (`equipo.ts`), de la
    foto de grupo (`EquipoGrupo`, posiciones repartidas según cuántos son) y se borró su retrato. La rejilla de Nosotros
    pasó a flex centrado (la última fila incompleta queda al centro). La API ya la excluía de `users/public-team`.
  - `findPublicTeam` filtra `isActive: true`: devolvía a «Daniela Galindo Almazán» (redes@, cuenta de baja; Adam dice
    que no existe). Adam pidió borrarla «definitivamente»: NO se borró. Tiene 1 actividad (creadora y responsable),
    4 checadas, 2 días de asistencia, 1 comida, 13 puntos GPS, 10 sesiones, 78 avisos y 568 entradas de bitácora; el
    DELETE del ERP falla por las llaves RESTRICT y no hay respaldos. Pendiente de Adam.
  - OJO: `direccion.operaciones@` (Luis Joel Aguilar) también está en la lista de excluidos del equipo público de la
    API, pero sale en Nosotros porque Adam lo incluyó en el organigrama del 26-10. Preguntado.
  - Portada: el tablero entra inclinado y se asienta al bajar (`animation-timeline: view()`), y las fotos de las
    baldosas tienen paralaje (línea de tiempo `--baldosa`: con `overflow: hidden` la baldosa era su propio scroller).
    Solo con soporte y sin «reducir movimiento». La flecha de botones y enlaces también responde al foco de teclado.

- **28-10 ~11:10 (claude-code) — Heroes de Nosotros y Proyectos sin recortes panorámicos flojos.**
  - Nosotros: el recorte 21:9 de la foto casual (cabezas cortadas, pared amarilla) se cambió por la foto de grupo de
    los 12 retratos (`EquipoGrupo prioridad`, carga inmediata) sobre una baldosa con luz de estudio (`.heroEstudio`).
  - Proyectos: mosaico de cuatro obras (rack, radioenlace, torniquetes, AP en altura) con rótulo de vidrio
    (`.heroMosaico`); esas tres fotos salieron de la galería para no repetirse. Fuera `.heroFoto` (ya no se usaba).
  - Probé poner en el tablero de la portada tomas reales recortadas del muro de video: en las miniaturas verticales
    solo se veía una franja irreconocible, así que se quedó como estaba.

- **28-10 ~10:45 (claude-code) — Ilustraciones del sitio rehechas «de nivel profesional» (Adam: la del almacén no le gustó).**
  - `SimuladorCobertura`: plano arquitectónico (retícula fina, muros de 7 con vanos y abatimiento de puertas, góndolas
    con entrepaños, refrigeradores, mostrador con registradora, tarimas en el almacén, mesas de exhibición), cámaras
    tipo bala que giran con su insignia, conos con luz que se apaga con la distancia (degradado radial por cámara),
    punto ciego rayado por celda dentro de las zonas, rótulos en píldora con semáforo y leyenda bajo el plano. La lógica
    de cobertura no cambió.
  - `Industrias` (portada): fuera el ícono de contorno gigante; cada industria lleva foto real de NEXARA a sangre con
    velo y texto en blanco (mapa `FOTOS` en el componente).
  - `MiniInterfaces`: la topología es de tarjetas de equipo (internet, switch con puertos, oficinas/almacén/patio) y la
    gráfica de entregas es una curva con degradado, rejilla y semanas (antes barras). `MapaInteractivo`: relieve con
    sombra, latido en las dos sedes y rótulos en píldora.
  - Ojo al capturar: la curva de la gráfica se dibuja con animación y las capturas la pausan a medias.

- **27-10 ~14:25 (claude-code) — Datos estructurados de NEXARA sin las marcas de Zynora (Adam lo pidió).**
  - `app/layout.tsx`: Organization, ProfessionalService y WebSite llevaban `alternateName` con Zynora, Zynora Tek,
    Zynoratek, Nexyx y Nexo. Zynora Tek tiene su propio Perfil de Google verificado en la misma dirección, así que
    eso podía hacer que Google leyera a las dos como un mismo negocio (el perfil de NEXARA está suspendido desde el
    26-10). Ahora `NOMBRES_ALTERNOS = ["Nexara"]` y la Organization trae `legalName` con la razón social.
  - El correo del JSON-LD ya es `gerencia@` fijo (`CORREO_PUBLICO`), igual que el sitio (Adam lo pidió); antes salía de
    `NEXT_PUBLIC_CONTACT_EMAIL` (`ventas@` en producción), que el web ya no lee. Pendiente: C.P. 72774 contra 72775 del
    aviso legal, a unificar con la constancia fiscal.

- **27-10 ~14:15 (claude-code) — Auditoría de UX en 12 páginas × claro/oscuro/390 px y sus arreglos.**
  - Sin problemas de contraste, desborde horizontal, imágenes rotas, texto < 12 px ni errores de consola. Lo que salió:
    áreas de toque de 21–30 px en el teléfono (logo, migas, enlaces de texto, «Copiar») → `.enlace::before` y
    `.migas a::before` agrandan el área sin mover el diseño, logo a 44 px, «Copiar» a 36 px; y la portada saltaba de
    h1 a h3 (las baldosas ahora son h2).
  - Aviso de cookies en el teléfono: una frase más corta (la prueba exige una sola frase) y las tres acciones en una
    fila de 40 px; antes tapaba un cuarto de pantalla.
  - Servicios › Industrias (destino de la miga «Industrias»): tarjetas con el riesgo típico de cada industria en vez
    de píldoras vacías; fuera el CSS de `.pildoras`.
  - Scripts de la auditoría en el scratchpad de la sesión (`auditoria.js`, `correr-auditoria.ps1`, sobre
    `prueba-tema.mjs`); las corridas sin resultado eran tiempos de espera del servidor de desarrollo.

- **27-10 ~13:30 (claude-code) — Ronda «premium» del sitio público: fotos, logos, cierre centrado y sin repeticiones.**
  - La foto granulosa `monitoreo-pantallas-cctv` sale de Servicios (videovigilancia), blog y guía de CCTV, retail,
    `camaras-cctv` y la galería de Proyectos: entra `muro-video-ancho` (recorte 16:9 del muro de video reescalado con
    Real-ESRGAN, con JPG de 1600 para Open Graph: `CON_JPG` en `fotos.ts`). `servicios-gestionados-ti` usa la sala de
    monitoreo. El archivo viejo sigue en `public/fotos` por si Studio lo referencia.
  - Certificaciones: los 10 logos a una tinta en `public/certificaciones/mono/` (sacados de los originales de la misma
    carpeta), sin cajas blancas; en oscuro se invierten (`filter: invert(1)`). `data-alto` para los logos verticales.
  - La tarjeta de cierre (`.finalTarjeta`) centraba solo el título: ahora también texto y botones (todas las páginas).
  - `Directorio`: una columna por servicio con industrias cortas (rotadas para no repetir la lista) y una de ciudades
    a los hubs `/cobertura/<ciudad>`; el ancla completa va en texto oculto (`.oculto`). Ya no lleva `industrias` ni
    `porIndustria`. Soluciones servicio × industria: «Otras soluciones cercanas» mezcla 3 y 3 y titula con la
    industria y su reto; las fichas de ciudad dicen solo la ciudad. Cobertura: cada solución trae su propio texto
    (`texto` en `GEO_MONEY_LINKS`).

- **26-10 ~21:00 (claude-code) — La portada nueva es la oficial; el equipo con retratos en Nosotros y en la portada.**
  - Adam aprobó el modelo nuevo: `app/(sitio)/page.tsx` ya solo pinta esa portada (con el JSON-LD de siempre); fuera
    `?modelo=nuevo`, el `noindex`, la portada vieja, `Ecosistema.tsx`, `Glifos.tsx` y ~530 líneas de CSS que solo
    usaba ella (hero dividido, virtudes, bento, integración, glifos y cuatro `@keyframes` sin uso). `Tablero` ya no
    lleva la prop `grande`: siempre es el grande. La sección `home_proceso` de Studio sigue existiendo pero la
    portada ya no la lee.
  - Equipo (pedido de Adam): los 12 del organigrama menos el director general y Salvador y Erick (sin retrato con
    uniforme). Lista fija en `components/sitio/equipo.ts` (nombre corto y puesto del organigrama); ya no se usa
    `users/public-team`. Retratos en `public/fotos/equipo/<clave>.webp`, recortados a fondo transparente desde los
    avatares de `/var/www/nexara-app/uploads/users` (el endpoint pide sesión: se copian por scp). Nosotros los muestra
    en cuatro columnas con halo de color; la baldosa «Un solo equipo» de la portada es una foto de grupo armada con
    los recortes (`EquipoGrupo.tsx`, dos filas escalonadas).
  - Mosaico más «Apple»: Videovigilancia con el muro de video y Infraestructura en baldosa negra (`oscura`) con el
    rack de LED, ambas reescaladas con Real-ESRGAN (`muro-video-nexara`, `rack-nexara-led` en `PARES` de `fotos.ts`);
    Soporte y Plataformas en ventana blanca que sube del piso.
  - Ojo al capturar: el script de capturas pausa las animaciones y las barras de Plataformas pueden salir aplastadas
    en la captura; en el navegador crecen bien.

- **26-10 ~19:15 (claude-code) — Portada «modelo nuevo» en vista previa: `/?modelo=nuevo` (noindex), sin tocar la actual.**
  - Adam: «ya se ve mejor pero sigue sin convencerme, mejora el modelo». Propuesta al estilo de la portada de Apple:
    hero centrado («Seguridad que ve. Y responde.») con el tablero grande debajo como producto (`<Tablero grande />`,
    `.visualGrande`), baldosas grandes con foto a sangre y dos acciones (`components/sitio/Baldosa.tsx`,
    `portada.module.css`), franja de cifras, mapa interactivo, industrias, galería, preguntas y cierre. Fuera de la
    portada nueva: «Por qué», Integración (órbita) y Método.
  - Está en `app/(sitio)/page.tsx` como `PortadaNueva`, elegida por `searchParams.modelo === "nuevo"`; el
    `generateMetadata` la marca `noindex`. Si el dueño la aprueba, basta con dejarla como la única y borrar la vieja.
  - Perfil de Google (contexto de la tarde): deshabilitado el 26-10 por «El Perfil de Empresa no existe», apelable;
    pruebas en `C:\dev\secrets\nexara-google-perfil` (OneDrive SECRETOS), apelación aún sin enviar.

- **26-10 ~18:35 (claude-code) — Menú móvil que no se desplegaba, y búsqueda Ctrl+K con sinónimos.**
  - Causa: al abrir la hoja, el header se pone `data-bajado="true"` y su `backdrop-filter` lo volvía el bloque
    contenedor de la hoja `position: fixed`; quedaba recortada a 64 px (solo se veía «Servicios»). El vidrio pasó a
    `.barra::before` en `encabezado.module.css`. Probado a 390 px: hoja de 780 px, nueve enlaces y submenús.
  - `Paleta.tsx`: campo `claves` (cctv, wifi, erp, mesa de ayuda…), guías del blog, Preguntas y Aviso de privacidad.
    Antes «cctv» no encontraba nada.

- **26-10 ~17:00 (claude-code) — Ronda de detalles de UI en el sitio público.**
  - El reseteo base del sitio (h1–h4, p, listas, img, a) pasó de `sitio.module.css` (`.sitio :where(…)`, peso de una
    clase: empataba con las clases de los módulos y ganaba la hoja que cargara al último) a `sitio-documento.css`
    con peso 0,0,3 (`html body :where([data-sitio]) :is(…)`). En Contacto el hero salía descentrado por eso.
  - Portada: la tarjeta «Próximo mantenimiento» ya no tapa el «En vivo» del tablero; nombres de cámara cortos; el
    lead de «Cómo trabajamos» y la primera pregunta ya no repiten el texto de los pasos.
  - Fotos verticales fuera de los heros 21:9 (`monitoreo-videowall` es 0.86): ERP, automatización, hospitalidad y
    Proyectos usan horizontales; Proyectos estrena foto en el hero y su galería toma la vertical. Nosotros «En campo»
    con fotos de levantamiento y taller que no salen en la portada; equipo en una fila de cinco, iniciales arriba.
  - Acordeón de preguntas con deslizamiento (`::details-content` + `interpolate-size` en `.sitio`) y barra de avance
    de lectura en guías y notas (`components/sitio/BarraLectura.tsx`). «Cotizar redes y Wi‑Fi» / «soporte TI» con
    sus mayúsculas.
  - Ojo al verificar: el panel integrado oculto no pinta y no dispara `scroll`, así que el encabezado no toma su
    vidrio ahí; en Chrome normal sí (`data-bajado="true"` al bajar).

- **26-10 ~15:55 (claude-code) — Mapa interactivo de cobertura, simulador de cámaras y metadatos recortados.**
  - Rastreo de las 169 URL del sitemap en producción (script de la sesión): todo 200, un h1 por página, 157 enlaces
    internos y 82 imágenes sin rotos, JSON-LD válido, sin títulos repetidos. Faltaba: 147 descripciones de más de
    170 caracteres y 34 títulos de más de 70. `lib/seo/textos.ts` (`recortarDescripcion`, `tituloConRemate`) los
    deja en ~150 y ≤70 en soluciones, cobertura y guías.
  - `components/sitio/MapaInteractivo.tsx` (+ `mapa.module.css`) en la portada: los 32 estados por modo de atención
    (base Puebla/CDMX; campo: Tlaxcala, Edomex, Querétaro, Guanajuato, Morelos, Hidalgo; el resto por fases), ruta
    animada desde Puebla, ficha con las ciudades que tienen página y «Cotizar en …». Con teclado y en el teléfono se
    usa el selector de la ficha; el SVG es aria-hidden. Proyectos conserva el mapa sincronizado con la lista.
  - `components/sitio/SimuladorCobertura.tsx` (+ `simulador.module.css`) en Servicios y en la guía de
    videovigilancia (`interactivo: "cctv"` en `lib/guias.ts`): plano de tienda con góndolas y muros que tapan la vista
    (rayos con oclusión), cámaras que se arrastran y giran (táctil, ratón y teclado: flechas, Q/E), cobertura del
    piso y de Acceso, Caja y Almacén (cubierta con ≥70 %). Arranca en 35 % con el almacén a ciegas a propósito.
  - `MapaMexico` exporta `curvaDesdeBase` y `BASE_MAPA` para el mapa interactivo.

- **26-10 ~15:35 (claude-code) — Las 86 páginas de Soluciones ya son indexables (Adam lo pidió).**
  - Salían `noindex, follow` porque heredaban la metadata de Studio «soluciones» de `soluciones/layout.tsx`, cuyo
    valor por omisión en `lib/page-seo.ts` es `noIndex: true` (pensado para el índice `/soluciones`, que redirige a
    `/servicios`). Ahora `[industry]` y `[industry]/[service]` fijan `robots: { index: true, follow: true }` en su
    `generateMetadata`; el layout y la entrada de Studio quedan para el índice. `robots.txt` ya permitía
    `/soluciones/` y el sitemap ya las listaba.

- **26-10 ~15:45 (claude-code) — 404 público con el diseño del sitio; tres despliegues del web en la tarde.**
  - `app/not-found.tsx` mira el host: en `nexara.com.mx`, `www` y localhost pinta `Encabezado` + `NoEncontrado` +
    `Pie`; en los subdominios de panel deja la tarjeta de siempre. `(sitio)/not-found.tsx` usa el mismo
    `components/sitio/NoEncontrado.tsx`.
  - Desplegados solo web: `9ee68cff` (subrutas), `f9eb368c` (guías y Servicios) y `b50c2f14` (404). Disco al 92 %
    (5.9 GB libres) tras cada build con prune; ver la nota de `audit_logs` más abajo.

- **26-10 ~15:20 (claude-code) — Blog con guías permanentes, Servicios más completo y limpieza de texto repetido.**
  - `lib/guias.ts`: cuatro guías del equipo (videovigilancia, Wi‑Fi en horas pico, memoria técnica, soporte con SLA)
    que `blog/[slug]` muestra cuando Studio no tiene una nota con ese slug; el índice del blog las presenta solas
    mientras Studio no publique nada y debajo de las notas cuando haya. Van en el sitemap (sin `/cobertura`, que
    redirige). Son texto escrito por Claude: Adam puede editarlas o quitarlas en ese archivo.
  - Servicios: enlaces «Por industria» en cada servicio, «Lo que recibes en cada proyecto» (seis entregables),
    «Un proyecto, o soporte que sigue» y las guías al final.
  - Texto repetido fuera: «+10 años» del hero (queda en la cifra), la pregunta de tiempo de respuesta de la portada
    (ahora «¿Cuánto cuesta un proyecto?»), datos de Nosotros que repetían el cierre y la fila de datos de Proyectos;
    cada caso de Proyectos lleva a su solución.
  - `PhoneField` en español con México, Estados Unidos y Canadá arriba (aplica también a los paneles).
  - Con el servidor de desarrollo encendido, las pruebas del editor de cotizaciones y de viáticos se pasan de los
    15 s; solas pasan (24/24). Apagar el servidor antes de `npm run test`.

- **26-10 ~14:20 (claude-code) — Todas las subrutas públicas pasan al sitio 2026; `(public)` ya no existe.**
  - Se movieron a `app/(sitio)`: `soluciones/[industry]` y `[industry]/[service]`, `cobertura/[city]` y
    `[city]/[service]`, `blog` y `blog/[slug]`, `qa`, `Nexara-Ingenieros`, `cotizaciones/firmar/[token]`,
    `device/register` y `legal/*` (antes `app/legal`, sin encabezado). Misma URL, mismos metadatos, JSON-LD,
    `generateStaticParams`, `revalidate` y nombres de `data-track-conversion` (las landings conservan
    `landing_primary_cta`… porque el rastreador cuenta como conversión lo que lleva «primary»; `Cierre` acepta
    `medicion`). `/soluciones/*` sigue saliendo `noindex`: lo hereda de `soluciones/layout.tsx` (Studio «soluciones»);
    no se cambió, es decisión de Adam/Studio.
  - Piezas nuevas en `components/sitio`: `HeroInterior`, `Migas`, `TarjetasRuta` (no `Rutas.tsx`: choca con
    `rutas.ts` en Windows), `Directorio` (reemplaza `SeoInterlinkHub`), `ArteServicio`, `visuales.ts` (foto real,
    ícono y mini interfaz por servicio/industria, `MODO_CIUDAD`, `NOMBRE_LINEA`), `interior.module.css`.
    `MapaMexico` acepta `destacar` (ciudad) y `acercar` (encuadre 21:9 de la ruta). `fotos.ts` sabe de las fotos que
    solo existen en webp 1200/1920 y da `fotoOg()`. Se quitaron las fotos de Unsplash.
  - Legal con índice (`legal/IndiceLegal.tsx`) y `legal.module.css` con los tokens del sitio; el texto legal no
    cambió (solo se quitaron los `style={{ color: "#fff" }}`). Marca ya sin estilos en línea.
  - `(sitio)/error.tsx` y `(sitio)/not-found.tsx` propios; `cotizaciones/layout.tsx` la deja `noindex`; el aviso de
    cookies es una tarjeta flotante con los tokens del sitio. La prueba de firma ahora busca la etiqueta «Correo».
  - `lib/seo/programmatic-landings.ts` con acentos («Cámaras CCTV e IP», «Logística y distribución»…): cambian los
    títulos de las landings. `FormularioContacto` ya lee `?industry=`.
  - Borrados por no tener uso: `app/(public)/*` (layout, `_shared/public.module.css`, `mxAdmin1Paths.ts`, etc.),
    `Header`, `Footer`, `FloatingContactForm`, `PublicPageHero`, `SeoInterlinkHub`, `PublicScrollReveal`,
    `PublicSiteThemeLock`, `HomeHero`, `EditorialImage`, `CoverageMap`, `LogoStrip`, `FAQ`, carruseles.
    Quedaron carpetas vacías en `app/(public)` que el sandbox no dejó borrar (git no las ve).

- **26-10 ~13:45 (claude-code) — Sitio 2026, ronda de mejoras tipo Apple/Stripe/Linear (desplegada 13:55).**
  - Fotos en webp por tamaño: `scripts/fotos-sitio.py` genera `public/fotos/v/<nombre>-{480,960,1440}.webp` (39
    archivos, 2.35 MB) y `components/sitio/fotos.ts` (`foto(nombre, sizes)`) arma `src`/`srcSet`/`sizes` sin pasar
    del ancho real del JPG. Ninguna página del sitio baja ya los JPG originales.
  - Tablero del hero con tres vistas (Cámaras, Red, Soporte) que avanzan solas cada 6.5 s mientras está a la vista,
    se pausan con el cursor y se quedan quietas al elegir una pestaña; respeta `prefers-reduced-motion`.
  - Paleta de búsqueda (`Paleta.tsx`): Ctrl/⌘+K, «/» o el botón Buscar del encabezado. Páginas, servicios,
    industrias, ciudades y acciones (WhatsApp, llamar, copiar correo, cambiar tema).
  - Mapa y lista de ciudades sincronizados (`Sincronia.tsx` + `data-ciudad`), `ListaCiudades.tsx` enlaza a
    `/cobertura/<ciudad>`; `Copiar.tsx` en los canales de Contacto; `Aparecer.tsx` escalona las entradas.
  - typecheck y tests completos en verde (API 314 suites / 3790 tests) con el servidor de desarrollo apagado.

- **26-10 ~13:30 (claude-code) — Sitio público 2026 publicado: el dueño aprobó la propuesta.**
  - `app/propuesta` pasó a `app/(sitio)` (grupo de rutas con su propio layout): `/`, `/servicios`, `/nosotros`,
    `/proyectos` y `/contacto`. Se borraron las páginas anteriores de `(public)` (`page.tsx`, `nexara/`,
    `servicios/`, `nosotros/`, `proyectos/`, `contacto/`); `serviciosImagery.ts` y `proyectosSectorCovers.ts` se
    movieron a `(public)/soluciones/`, único lugar que los usaba. Blog, Soluciones, Cobertura y Legal siguen en
    `(public)` con el layout y el encabezado anteriores.
  - Cada página lleva `buildStudioPageMetadata(<clave>)` y los datos estructurados que tenían las anteriores; sin
    `noindex`. El layout de `(sitio)` monta `PublicTrafficTracker` y `CookieConsentBanner` (`ExtrasSitio.tsx`); el
    contacto flotante (`FloatingContactForm`) ya no aparece en esas cinco páginas. `(sitio)/error.tsx` reusa el de
    `(public)`. `BASE_SITIO` quedó en "" y el middleware manda `/propuesta/*` → `/*` con 308.
  - Ya no se usan desde Studio: `home_metricas`, el video del hero (`hero-video`) ni las fotos de `page_*`; siguen
    `home_proceso`, `home_cta` y los metadatos SEO.

- **26-10 ~13:15 (claude-code) — `deploy/update.sh` ya no reconstruye el transcriptor en cada despliegue.**
  - Sesión lateral del coordinador. `up -d --build transcriptor` corría siempre; con la caché de build vacía rehacía
    whisper y el modelo (imagen de 2.5 GB) aunque solo cambiara el web, y así se llenó el disco el 26-10.
  - Ahora `build_transcriptor` va como `build_api`/`build_web`: solo si cambió `deploy/docker/Dockerfile.transcriptor`
    entre revisiones (o sin commitear), con `--force-all`, si falta `nexara-transcriptor:latest`, o si cambió su bloque
    `build` de `docker compose config` (compose o `WHISPER_MODEL` del `.env`), que se anota en
    `/var/lib/nexara/transcriptor-build.conf` (el primer deploy solo lo anota). Si no, `up -d --no-build transcriptor`.
  - `check_disk_before_build` antes de cada build (api, web, transcriptor): con `/` ≥ 90 % corre
    `docker builder prune -f` y lo avisa en el log; con `--no-auto-prune` solo avisa.
  - Probado: `bash -n` y corrida en seco con docker y df simulados (solo web, cambio de Dockerfile, de `WHISPER_MODEL`,
    imagen faltante, `--force-all`, `--no-auto-prune`, cambio sin commitear).
  - Ojo: el primer deploy después de cambiar `update.sh` corre la versión vieja (git reemplaza el archivo y bash sigue
    leyendo el anterior).
  - 1.er deploy con el script nuevo (~13:17, `/tmp/deploy-transcriptor-1917.log` en el servidor): el pull trajo también
    el sitio 2026 (`4f0c0872`, `5b74776d`) y construyó el web. El aviso salió («disco al 91 % … Vaciando la caché de
    build», 1.1 GB) y aun así el build del web llevó el disco de 7.7 GB libres a 669 MB (100 %). Al recrear
    `nexara-web`, compose falló con `Conflict… name already in use` (EXIT=1) antes del bloque del transcriptor, aunque
    el contenedor nuevo quedó arriba con la imagen nueva. Caché de build vaciada a mano (2.8 GB) → 90 %. DB y Redis
    sin daño; web 200 y `/api/health` ok.
  - El deploy de las 13:10 (`deploy-auditoria`, script viejo) rehízo whisper entero con el disco al 96 %; se vació la
    caché sin usar (2.2 GB) en pleno build y tocó fondo en 2.7 GB libres.
  - Lección: con ~7 GB libres un build del web apenas cabe; el umbral del 90 % ayuda, no basta. Lo que libera de
    verdad es borrar las filas viejas de `audit_logs` (~10 GB, pendiente de Adam).
  - Trampa en el servidor: `deploy/docker/Dockerfile.web` tiene un cambio local desde el 24-09 (`CACHEBUST` fijo). Por
    él, todo deploy sin revisión nueva (`--no-pull` o sin commits) reconstruye api y web. No se tocó.
  - 2.º deploy (~13:24, `/tmp/deploy-transcriptor-1924.log`, solo `.ai/RELEVO.md`): «Anotada la configuración de build
    del transcriptor…» y «Transcriptor sin cambios: se levanta sin reconstruir.»; la imagen siguió en `ee69f1aea048`,
    disco 90 % (7.7 GB libres) antes y después, EXIT=0. Sello: `/var/lib/nexara/transcriptor-build.conf`.

- **26-10 ~13:10 (claude-code) — Causa del disco lleno: `audit_logs` pesa 14 GB (de 15 GB de la base).**
  - 5.5 millones de filas en un mes. 3.3 M (9.8 GB) son `integra POST_OK`: el interceptor de mutaciones auditaba
    cada POST del webhook de los terminales Hikvision (`/api/integra/hik/<empresa>/<token>`, ~56 mil al día, sin
    usuario, y guardaba el token de la ruta). Otras 860 mil (592 MB) son `IntegraPushEvent CREATE`, copia de
    `integra_push_events`.
  - Corregido en código: `/api/integra/hik/` en `SKIP_PREFIXES` (`skipsMutationAudit`) e `IntegraPushEvent` en
    `AUDIT_EXCLUDED`. Prueba en `audit/mutation-audit.interceptor.spec.ts`; jest API 3790/3790, tipos limpios.
  - **Pendiente de Adam (borrado en producción, sin respaldos):** borrar esas filas viejas y `VACUUM FULL
    audit_logs` devolvería ~10 GB al disco. Los eventos siguen en `integra_push_events`.

- **26-10 ~12:30 (claude-code) — Mapas sin Google Static Maps: ubicación de sucursal, vistas previas y PDF.**
  - Coordinador (Adam: «continua»): `ClientLocationPicker` seguía con la imagen de Google Static Maps (403 «You must
    enable Billing»). Se cambió en todos los usos de la web y del API; las apps no usan mapas estáticos (Android
    declara Maps SDK sin usarlo; iOS usa MapKit).
  - Web: `lib/maplibre-cargar.ts` (carga única de MapLibre + estilo OpenFreeMap). `components/mapas/MapaUbicacion`
    (pin arrastrable y clic para fijar; en `ClientLocationPicker` → sucursales de Clientes/BranchesForm y el portal de
    tickets) y `MapaVistaPrevia` (foto del mapa: MapLibre dibuja fuera de pantalla con `preserveDrawingBuffer`, se
    guarda como JPEG y se destruye; cola de uno y caché por punto, para no agotar los contextos WebGL en listas).
    Vistas previas en el portal de tickets (`/tickets`: archivos con mapa de llegada, mapa de llegada, solicitudes),
    `/tickets/[branch]` y la cola de OPS (`OpsTicketRequestQueue`). `lib/static-map.ts` queda con `hasUsableCoords` y
    `googleMapsLink`; ya nadie usa `/api/static-map`.
  - API: `common/maps/osm-teselas.ts` arma el mapa del reporte de ticket/OT con teselas de tile.openstreetmap.org
    (User-Agent propio, caché en disco 30 días, crédito «© OpenStreetMap») cuando no hay imagen de Google; antes el
    PDF decía «Mapa no disponible» (el respaldo `staticmap.openstreetmap.de` ya no existe: ENOTFOUND).
  - Probado: PDF real con teselas (se ve la Explanada con el pin), foto offscreen de MapLibre 6.11.2 en navegador
    (JPEG con contenido), vitest web 1274/1274, jest API 3787/3787, tipos limpios.
  - Sin sesión real: el portal de clientes y el formulario de sucursales no se vieron con datos en producción.

- **26-10 ~11:15 (claude-code) — Web pública 2026: propuesta completa de la portada en `/propuesta` (sin indexar).**
  - Adam (por el dueño): el sitio «se ve sobresaturado, no limpio… gusta pero no encanta»; quiere nivel Apple/Stripe,
    «llévalo al extremo premium». Libre albedrío en colores, fotos, secciones y acomodo.
  - Se construyó aparte para no tocar lo publicado: `app/propuesta/{layout,page}.tsx` + `components/sitio/*`
    (sistema visual nuevo: `sitio.module.css`, `encabezado.module.css`, `pie.module.css`, `sitio-documento.css`).
    Nada de `(public)` cambió; `/propuesta` lleva `robots: noindex` y el logo/pie apuntan a `/propuesta`; el resto
    de enlaces van a las páginas actuales.
  - Diseño: claro (blanco/gris niebla, texto tinta `#0a2540`) y oscuro (tinta `#060b14`), un solo azul de acción
    `#0060f0`, Inter Tight para titulares (next/font en el layout) e Inter para texto. Degradado vivo con los colores
    del isotipo solo en hero y cierre (`Aurora`). Hero con tablero de monitoreo ilustrado en HTML (`Tablero`, cámaras
    con fotos reales y reloj de CDMX en vivo), menú desplegable de Servicios/Industrias con iconos (`Encabezado`),
    bento de servicios con mini interfaces (topología de red animada, ticket con SLA, gráfica), método que se cuenta al
    bajar (`Metodo`, índice fijo), control segmentado de industrias con «Lo que instalamos» (`Industrias`), galería
    deslizable (`Galeria`), contadores (`Cifra`), cobertura con el mapa claro/oscuro y pie estilo Apple.
  - Trampas del CSS global de la plataforma (`layout.css`): topa `main/section` a `--content-max` desde 1100 px si el
    body no tiene `.public-friendly`, y da letra/color/margen a h1–h4, p y a. Se neutraliza en `sitio-documento.css`
    (selector con `html body:has([data-sitio])`) y con el reseteo `.sitio :where(...)` (peso de una clase). En los
    módulos de encabezado/pie las reglas van con dos clases (`.barra .x`, `.pie .x`) para no empatar con el reseteo.
  - El video del hero actual (Studio, `hero-video` id 6) es una animación neón del logo: la propuesta no lo usa.
  - Verificado: tipos del web OK; Chrome headless a 1536/1180/375 en claro y oscuro, sin desborde horizontal ni
    errores de consola; menú, pestañas, galería, método y contadores probados por CDP.
  - Desplegada la primera versión (4951bd9b) en https://nexara.com.mx/propuesta.
  - Segunda ronda (Adam: «aún le falta mucho», «< 24 h no se ve bien», «las cards de Puebla · CDMX se ven feas»,
    «qué fotos dejar y cuáles quitar», «lo vectorizado agrégalo todo»):
    - Cifras → `virtudes`: cuatro tarjetas con frase completa y glifo vectorial animado (`Glifos.tsx`): 10+ años,
      200+ sitios, 32 estados (silueta de México) y «Un día hábil» para la primera respuesta. Van fijas en la página,
      ya no leen `home_metricas` del Studio (ahí sigue «Puebla · CDMX» / «< 24 h»).
    - Mapa vectorial propio (`MapaMexico.tsx`) con los 32 estados de `mxAdmin1Paths.ts` simplificados a 22 KB
      (`mexicoEstados.ts`; silueta de 7.5 KB en `mexicoSilueta.ts`), base Puebla/CDMX en azul y rutas animadas desde
      Puebla a 11 ciudades. Reemplaza la infografía raster saturada. Índices: 21 Puebla, 31 CDMX, 30 Tlaxcala, 20 Edomex.
    - Diagrama del ecosistema (`Ecosistema.tsx`, sección «Integración»), preguntas frecuentes en `details`
      (`Preguntas.tsx`) y marca de agua vectorial por industria.
    - Fotos fuera: `cableado-interno-pc-guantes-taller`, `tecnico-ensamble-chasis-pc-taller`,
      `tecnicos-mantenimiento-pc-colaboracion` (hacían ver a NEXARA como taller de PC), `campo-levantamiento-patio`
      (persona posando), `equipo-nexara-espalda`. Entran a la galería las de campo (punto de acceso en altura, video
      wall, torniquetes) y el equipo.
  - Tercera ronda: Servicios, Nosotros, Proyectos y Contacto ya existen en el sistema nuevo
    (`app/propuesta/{servicios,nosotros,proyectos,contacto}`), con el contenido del sitio actual reescrito y sin sus
    fotos de taller. Piezas nuevas: `SubNav` (sub-barra fija con la sección activa), `Cierre`, `Certificaciones`,
    `MiniInterfaces` (red, ticket y gráfica, compartidas con la portada), `FormularioContacto` (mismo
    `POST contact-messages` con `source: contacto-page` que el formulario actual; lee `?servicio=`) y `equipo.ts`
    (`users/public-team`, solo iniciales). CSS de páginas interiores en `paginas.module.css`.
  - Todas las ligas internas pasan por `ruta()` (`components/sitio/rutas.ts`): con `BASE_SITIO = "/propuesta"` la
    propuesta navega entre sus páginas; blog, soluciones y cobertura siguen yendo al sitio actual. Al publicar en
    `(public)`, `BASE_SITIO` pasa a "".
  - Tema claro por omisión en todo el sitio público (regla de Adam del 26-10): el script de `app/layout.tsx` ya no
    sigue al sistema; pone `dark` solo si `nexara:public-theme` guardado es `dark`. Contacto usa `BrandMap
    overlay={false}` (sin la tarjeta y el botón cian del estilo viejo).
  - Ojo con las pruebas: con el servidor de desarrollo y Chrome headless corriendo, `banking/page.spec.tsx` y
    `cotizaciones/[id]/page.spec.tsx` vencen por tiempo (15–25 s); solas pasan.
  - Falta: visto bueno del dueño; después mover el sistema a `(public)` (layout y páginas), rehacer Blog, Soluciones
    y Cobertura, y restilar el banner de cookies y el contacto flotante.

- **26-10 ~10:30 (claude-code) — Asistencias: la insignia larga ya no se encima con la foto de la checada.**
  - Adam (captura de la ficha del día): en la tarjeta ENTRADA, «Revisar: Ubicación tomada 26 min después de
    checar (al checar: …)» se salía por debajo de la foto y del borde. El `Badge` base (`piezas.module.css`) es
    `nowrap` con alto fijo de 20 px; no se tocó (se usa en todo el panel).
  - `asistencias.module.css`: `.insignias .insignia` (alto libre, `white-space: normal`, radio 10 px = píldora en un
    renglón) y `max-width: 100%` en `.insignias`. `page.tsx`: la clase va en las insignias de `InsigniasChecada`
    (ficha, columna Entrada/Salida de la tabla y tarjetas móviles) y en el aviso de ubicación de la columna Estado.
  - Desplegado (269f04e2, `/root/deploy-insignias.log`, sin «Attempt 1 failed»). Verificado por DOM con el CSS servido
    (`86a0a84a27af517b.css`), sin iniciar sesión: ficha a 343/480/760 px sin solape con la foto y dentro de la tarjeta;
    tabla a 900 px ya no fuerza scroll horizontal.
  - Tarjeta del teléfono (Adam: «que esa columna ocupe todo el ancho»): `.horas > div:has(.insignias)` toma el renglón
    entero, `.horasTiempo` va en la última columna y `.horas` usa `grid-auto-flow: row dense`. A 343 px el motivo pasa
    de 97×126 px (~7 renglones) a 285×36 (2); sin insignias la tarjeta queda igual; solo con salida, entrada y tiempo
    siguen arriba. Desplegado (d05d1ec8, `/root/deploy-insignias-movil.log`) y medido con el CSS servido.
  - **Incidente de disco (18:44–18:47 UTC):** al reconstruir `nexara-transcriptor` el disco llegó a 100 %:
    `nexara-db` quedó reiniciándose («could not write lock file postmaster.pid»; se recuperó sola a las 18:47:19, redo
    normal) y Redis rechazó escrituras (MISCONF, ya sano). `docker builder prune -f` liberó ~5 GB: 97 % → 90 %.
    `/api/health` responde 503 mientras el disco esté ≥ 90 % (`thresholdPercent: 0.9`); `/api/health/live` da 200.
    Por orden de Adam (13:05) se borraron las 7 imágenes `prev`/`rollback` sin contenedor (Ágora ×4, ARTA ×2,
    ZYNORATEK ×1): ya no hay punto de regreso por imagen para esos tres. Disco 92 % → 89 % (8 GB libres) y
    `/api/health` volvió a 200. `nexara-transcriptor:small-20261026` se quedó: es la imagen de `transcriptor-dictado`.

- **26-10 ~05:10 UTC (claude-code, R-1) — Transcriptor aparte para dictado (whisper `small`, 1 CPU).**
  - Decisión del coordinador (opción b): el turbo q8_0 tardaba en un dictado lo que dura el audio y el dictado
    de 2 min podía pasar del límite de 100 s. Ahora `/api/ai/voz/transcribir` usa `TranscriptorService.dictar`:
    va a `TRANSCRIPTOR_DICTADO_URL` (servicio `transcriptor-dictado` del compose) y, si falla o tarda más del 70 %
    del plazo, cae al principal con el tiempo que quede. Las partes de juntas siguen en el turbo. Una falla del de
    dictado no marca al principal como caído. Pruebas: 4 nuevas en `transcriptor.service.spec.ts`.
  - Medido con la imagen small (dictado sintético es-ES, opus 32 kbps): 1 CPU / 1 hilo → 19 s en 10.5 s y 110 s
    en 48 s; 1 CPU / 2 hilos peor (11.3 / 54.6 s); 1.5 CPU / 2 hilos 7.5 / 36 s; 2 CPU 5.8 / 27 s; RAM ~0.73 GB.
    Por omisión 1 CPU, 1 hilo, `cpu_shares` 256, 1 GB (variables `TRANSCRIPTOR_DICTADO_*` / `WHISPER_DICTADO_*`).
  - `update.sh` levanta `transcriptor-dictado` sin `--build` si `TRANSCRIPTOR_DICTADO_URL` está en el `.env`.
  - Desplegado SOLO el contenedor nuevo (05:08 UTC): la imagen small que ya había, re-etiquetada como
    `nexara-transcriptor-dictado` (sin build ni disco extra); `TRANSCRIPTOR_DICTADO_URL=http://transcriptor-dictado:8080`
    en `deploy/.env.nexara` (respaldo `/root/respaldos/env.nexara.20261026-dictado`); el checkout del servidor no se
    movió. Medido desde la red del API: dictado de 19 s → 10.3 s (el turbo, 19.8 s); 110 s → 48.1 s; 0.73 GB.
    El API desplegado (40ee7054) todavía no lo usa: entra con el próximo despliegue de API/web.

- **25-10 ~22:30 (claude-code) — GPS de jornada: un punto cada 30 min, entrada sin ubicación y mapa del recorrido.**
  - Adam (23-10, detalle de Iván Camargo, id 10): «aparece rota la del gps… no muestra ubicación desde la una… debe
    tomarse cada media hora… este usuario siempre dice que no muestra su ubicación al iniciar jornada».
  - Causas (con datos): (1) 08:29 la rotación de contraseñas cerró su sesión: traefik registra cada `POST /api/gps`
    con 401 cada ~5 min hasta que volvió a entrar a las 13:12 (`lastLoginAt`); el servicio de Android vivía, pero el
    punto se tiraba. (2) Ráfaga: la checada guarda un punto y el servicio mandaba otro a los segundos, y con actividad
    cada 5–10 min. (3) Sin actividad el pedido llevaba `setMinUpdateDistanceMeters(500)`: quien no se mueve no manda
    nada (usuarios 15, 58). (4) Android 14 no deja reabrir un servicio de ubicación desde segundo plano: si el
    fabricante lo cierra, se acaba hasta abrir Asistencias (probable en 40 y 57: horas sin puntos con actividad
    abierta; desde el servidor no se puede confirmar). (5) Iván en octubre checó 11 veces sin ubicación (permiso negado o ubicación apagada); la app no la
    pedía. (6) El mapa del recorrido era `/api/static-map` → Google Static Maps 403 «You must enable Billing» → 503.
  - API: `gps/cadencia-jornada.ts` (hora del punto = la del teléfono con topes; no se guarda un punto a < 20 min de
    otro; la geocerca y la entrada sí lo usan). `AttendanceService.asignarUbicacionPosterior` + columna
    `Attendance.ubicacionPosteriorAt` (migración `20261025120000_ubicacion_posterior_entrada`, aditiva): entrada sin
    coordenadas toma el primer punto de los 30 min siguientes, sigue a revisión con motivo «Ubicación tomada N min
    después de checar (al checar: …)» y sitio/distancia medidos. `GpsLatidoCronService` (cada 5 min): jornada abierta
    + consentimiento + 35 min sin punto → `PushDispatchService.sendGpsLatido` (Android: datos prioridad alta cada 30
    min; iOS: recordatorio visible como mucho cada hora).
  - Android 1.0.8 (18): `JornadaGpsReglas` (probadas en JVM) + servicio reescrito: alarma `setAndAllowWhileIdle` cada
    30 min con lectura fina y reintento a 5 min (×3), GPS continuo a 30 min sin mínimo de distancia, latido FCM,
    puntos que fallan (401) guardados con su hora y reenviados, avisos «Tu sesión se cerró» / «Toca para seguir
    registrando tu ubicación» / «Tu ubicación está apagada», reanudación en `MainActivity.onStart`, receptor de
    reinicio/actualización. Checada: `rememberAsegurarUbicacion` pide permiso y el diálogo del sistema para encender la
    ubicación antes de la foto. Sin `ACCESS_BACKGROUND_LOCATION` (declaración de Play).
  - iOS 1.0.1 (11): `ShiftGpsTracker` con lecturas sueltas al abrir y cada 30 min con la app abierta, pendientes con
    su hora; aviso de permiso/ubicación apagada antes de checar (`UbicacionChecada.swift`); latido silencioso solo si
    algún día hay «Siempre». **No se agregó «Siempre»** (2.5.4, 07-10): sin `NSLocationAlwaysAndWhenInUseUsageDescription`
    iOS no deja medir con la app cerrada; el recordatorio del servidor pide abrirla. Decisión de Adam.
  - Web: `RecorridoMapa` (MapLibre + OpenFreeMap) en vez de la imagen; línea de tiempo con «Entrada sin ubicación: …»,
    «Ubicación tomada a las …» y huecos de > 40 min (`lib/recorrido-huecos.ts`).
  - Builds: iOS 1.0.1 (11) subido a TestFlight (run 40271208749, VALID en ASC); AAB 1.0.8 (18) firmado en
    `Descargas/NEXARA-android-1.0.8-18.aab` (24.8 MB). CI de `main` en verde (tipos/tests, iOS simulador, Android).
  - Pendiente: desplegar API/web con `--with-migrate` (lo hace el coordinador); subir el AAB a Play (Adam, arrastrar
    en Play Console); probar en el teléfono de Iván. `ClientLocationPicker` también usa `/api/static-map` (sigue roto sin facturación).

- **25-10 (claude-code) — «Asignar con IA» hasta arriba de Actividades, tarjeta completa y dictado en vivo.**
  - Adam: «que el asignador de IA esté hasta arriba en actividades… y ya esté completo» y «mucho más intuitivo el
    dictado como en FinanVoz… se tarda mucho, hay que interpretar».
  - `ModulePage` tiene el slot `lead` (bajo el encabezado, antes de los KPI; `.lead:empty` no deja hueco). La pizarra
    pone ahí `AsistenteIA` en todas las pestañas (el componente no pinta nada si no es CEO/superadmin o sin IA).
  - Dictado (`lib/use-dictado-vivo.ts`): micrófono grande; reconocimiento del navegador es-MX con resultados
    intermedios, texto en vivo en la caja y onda (`OndaVoz`); se detiene a los 1.8 s de silencio o con un toque y
    entonces interpreta solo, una llamada por dictado; sin voz en 8 s avisa; permiso negado con instrucciones.
    Sin reconocimiento (Firefox): `DictadoBoton` (whisper) de respaldo y también interpreta solo. Lo escrito:
    «Preparar actividades» (Ctrl+Enter). Línea de privacidad. `DictadoBoton` del resto (actas) se queda con
    whisper a propósito (decisión «sin proveedores»; whisper va a ~1.2× tiempo real con el servidor cargado).
  - Tarjeta: tipo y subtipo editables (mismo mapeo que el API: coreKind, activityType, ticketType,
    ticketTypeCustom), solo los tipos que esa persona recibe; cliente de toda la empresa y proyecto (el API
    devuelve `opciones` con clientes y proyectos, sin pasar por la IA); obra/proyecto sin fechas toma el periodo de
    la etapa vigente (`obtenerProgramacion` + `periodoPorOmision`, con `projectMilestoneId`); bloqueos y encargo
    con el tipo efectivo; «Esto entendí · N actividades · listo en X s».
  - Capturas a 1536 px (vista Vite temporal con API y voz simuladas, ya borrada; DOM sin desbordes ni solapes):
    `.ai/eval-ia/capturas-asignar-con-ia-2026-10-25/` (inicio, escuchando con texto en vivo, entendiendo,
    tarjetas, cambio de tipo, oscuro, teléfono 390). Medido en la vista: 1.83 s de silencio hasta «Entendiendo»
    y ~0.5 s de la respuesta a las tarjetas; real ≈ 1.8 s + IA (p50 1.8 s) + 0.5 s ≈ 4 s; con un toque ≈ 2.5 s.
  - Pruebas: vitest de pizarra, dictado, ModulePage y lib (104), jest del asistente (24), tipos web y API. El
    editor de cotizaciones se pasó de tiempo con la máquina cargada (no usa nada de esto). Sin desplegar: lo
    despliega el coordinador al final. Cambio visual notable: que Adam vea las capturas antes del despliegue.

- **26-10 ~05:00 UTC (claude-code, R-1) — Transcriptor en producción: large-v3-turbo-q8_0, tope de 3 CPU, sin audio_ctx.**
  - Condición del coordinador: límite de CPU que deje al menos un núcleo a los demás y, con ese límite, ≤ ~0.8 ×
    tiempo real con voz de sala. Banco con `--cpus 3` y 3 hilos (4 vCPU = 2 núcleos con SMT), WER limpio / sala
    (× tiempo real): **turbo-q8_0, contexto completo: 20.8 / 52.8 % (1.08 / 0.78), ~1.06 GB RAM ← en producción** ·
    turbo-q8_0 + audio_ctx 1100: 13.9 / 54.0 % (0.78 / 0.58) · turbo-q8_0 partes de 30 s: sala 53.1 % (0.71) ·
    turbo-q5_0 + audio_ctx 1100: 21.3 / 53.8 % (1.18 / 0.85) · small: 22.3 / 65.5 % (0.30 / 0.23). q8_0 es más rápido
    que q5_0 en este CPU. Sin fallback de temperatura: mismo tiempo y 6 bucles en limpio → se queda. 2 hilos: 0.63.
  - **audio_ctx fuera** (`grabacion.service.ts`, `grabacion.ts`, `transcriptor.service.ts`): medido en producción, tras
    una petición SIN audio_ctx (un dictado), las partes con audio_ctx 1100 salen inventadas («En el caso de la
    Iglesia… cállate cada vez más» en vez de «Tampoco estaba facultado para anular leyes fiscales…») y más lentas,
    hasta reiniciar el contenedor. Sin audio_ctx nunca se mezcla. Cuesta ~27 % de tiempo (14 → 19 s por parte densa).
  - Desplegado SOLO el transcriptor (04:10 UTC): `WHISPER_MODEL=large-v3-turbo-q8_0` en `deploy/.env.nexara` (respaldo
    en `/root/respaldos/env.nexara.20261026-transcriptor`), construido desde los archivos de origin/main con
    `git archive` en `/root/transcriptor-build` (el checkout del servidor NO se movió); imagen anterior guardada como
    `nexara-transcriptor:small-20261026` para volver atrás. Contenedor: NanoCpus 3e9, CpuShares 512, 2 GiB, ~1.0 GB.
  - Prueba de punta a punta con el API de producción (40ee7054, `POST /api/ai/voz/transcribir`, token firmado dentro
    del contenedor): dictado de 20 s → 201 en 19.8 s, texto casi exacto; parte de junta de sala de 20 s → 201 en
    19.3 s, «Tampoco estaba facilitado para mirar leyes fiscales o aranceles entre Estados.» (small decía «No estaba
    facilitado para lograr lugares escales o garantías entre estados»). Carga mientras transcribe: load ~4, CPU libre
    13–25 %, whisper ~2.8 CPU, API público 200 en ~50 ms (máx 154 ms).
  - Pendiente / ojo: el dictado ahora tarda ~lo que dura el audio (antes ~¼). `MAX_DICTADO_MS` son 2 min y el API
    corta el dictado a los 100 s: un dictado continuo de más de ~90 s puede no alcanzar. Propuesta: un segundo
    transcriptor `small` solo para dictado (voz cercana), o bajar el dictado a 60 s. No hecho: decide el coordinador.
  - Corrección a lo de abajo: «dockerd ~1.3 CPU» era el promedio de `ps` desde el arranque (54 días), no el uso del
    momento; con el servidor en calma (load ~1) el resto de servicios usa ~0.5 CPU. Los 132 zombis son hijos de un
    solo proceso node (pid 3163642 al 23-10), no se tocaron.

- **23-10 ~19:00 UTC (claude-code, R-1) — Transcripción de juntas: modelo grande medido en el servidor y limpieza de whisper.**
  - Adam: «la transcripción es muy pobre, no tiene sentido» (junta real de 28 min, grabación 5: bucles, «nos vemos en
    el próximo vídeo», «[Noticias]», una línea en inglés). Sin Claude en este trabajo: WER por código.
  - Banco en el servidor (`apps/api/scripts/banco-transcriptor`, resultados en `resultados.jsonl`): 22 voces de FLEURS
    es_419 (dev) en una «junta» de 3.7 min, limpia y «de sala» (paso bajo, -10 dB, eco y ruido), partes como la web,
    misma imagen y banderas que producción. WER limpio / sala y × tiempo real (servidor con carga 5–8):
    small 22.3 / 65.5 % (0.30 / 0.23) · medium-q5 24.9 / 62.1 % (1.58 / 1.05) · large-v3-turbo-q8 20.8 / 52.8 %
    (1.61 / 0.77) · large-v3-turbo-q5 20.8 / 53.8 % (1.89 / 1.17) · **turbo-q5 con audio_ctx 1100: 21.3 / 53.1 %
    (1.18 / 0.88)** ← elegido. Partes de 30 s: al small le hizo perder frases (32 %) y al turbo no le mejoró la sala;
    se quedan las de 20 s. Contexto de la parte anterior como prompt: peor (20.5 / 56.7 %) → apagado. Lista de nombres
    de pila en el prompt: peor (22.3 %, un bucle) → solo clientes.
  - Producción (superado el 26-10: q8_0 y tope de 3, ver arriba): `WHISPER_MODEL=large-v3-turbo-q5_0`, `audio_ctx` 1100 en cada parte, `cpu_shares` 512 y tope de 3.5
    CPU; `update.sh` reconstruye el transcriptor con `--build`. Con el servidor ocupado queda unos minutos detrás de la
    junta y se pone al día al concluir (partes pendientes ya no se dan por perdidas a los 20 min, sino a las 3 h).
  - `limpiarTextoWhisper`: quita marcas `[...]`, oraciones de cierre de video/subtítulos, «Gracias.» suelto, oraciones
    en inglés, bucles (frase repetida 3+ veces, la misma idea con variaciones) y líneas repetidas; probado con las
    partes reales de la grabación 5 (2882 → 2682 palabras; en las partes revisadas a mano solo se fue lo inventado).
  - Navegador: sin cancelación de eco ni supresión de ruido, con control de ganancia (voz lejana), opus a 48 kbps.
    Eso no se pudo medir aquí (es el procesado de Chrome): queda por ver en la próxima junta real.
  - Ojo del servidor (no es de este trabajo): `dockerd` gasta ~1.3 CPU de forma continua y hay 133 procesos zombi;
    eso le quita al transcriptor casi un núcleo.

- **23-10 ~18:45 UTC (claude-code) — «Asignar con IA» más barato y más rápido; eval solo por la puerta con Haiku.**
  - Reglas nuevas de costo (Adam vía coordinador): pruebas solo por la puerta con el token `pruebas`, solo Haiku,
    sin juez Opus/Sonnet; objetivo de producción p95 ≤ 3.5 s, ~10 s por intento y un reintento.
  - Asistente (`asistente-actividades.ts`): el catálogo ya no va entero: `catalogoRelevante` busca en código lo
    mencionado (apodos «Beto»/«Paty»/«Toño», cómo suena «Toks»=«Tox», prefijos) y solo eso va en el mensaje;
    `proximosDias` manda el calendario calculado («el viernes» dicho en viernes ya no es hoy); `corregirHoraPasada`
    («a las 8» sin día y ya pasada → mañana); prompt recortado (5.5k → 3.7k caracteres); salida corta (`sub`,
    `quien`, `lugar`, `inicio`/`limite` con día y hora juntos, `min`, `prio`, `detalle`, sin `razonTipo`) que
    `planDeSalida` pasa al plan de siempre; `CONFIG_ASISTENTE.timeoutMs` 10 s y `reintentos` 1 (nuevo campo por
    petición en `ClaudeService`, solo esas dos líneas). Web: espera máxima 25 s y error claro con el texto intacto.
  - Medido (Haiku, puerta de pruebas, 10 llamadas en serie): antes p50 2.0 s / p95 6.3 s, 4,276 tokens de entrada,
    342 de salida, US$0.00027; después p50 1.8 s / p95 3.5 s, 3,047 / 229, US$0.00021. En producción con el catálogo
    real (antes de este cambio): caché fría 4,845 tokens → US$0.00072; con caché 4,723 leídos → US$0.00015.
    Calidad: 23/23 casos con revisiones de código.
  - Arnés del eval: `comun.ts` siempre por la puerta con `pruebas.token` (sin llave directa; sin token, error),
    juez por omisión Haiku (`--juez sonnet|opus` explícito), costo estimado antes de correr con `--max-usd`,
    `--concurrencia 1` con p50/p95; `generar-transcripciones` con Haiku por omisión (`--modelo`).
  - Gasto: antes de la regla esta tarea gastó ~US$0.70 en el eval (juez Opus); después, ~US$0.025.

- **23-10 ~18:45 UTC (claude-code) — Cada llamada a Claude dice qué función la hizo (`x-proceso`).**
  - Adam: «ve cómo perfeccionar el modelo… si consume mucho nos da en la torre, pero si es muy lento, no entiende bien
    o se traba… también nos va a generar problemas». La puerta ya registraba latencia, errores y costo por proyecto y
    modelo; ahora también por función (`PUERTA-IA-app` acfe4cf, v1.1.0, desplegada): `/uso` → `procesos` y panel
    «Por función» con objetivos de p95 y costo por llamada (`config/proyectos.json` › `nexara.objetivos`).
  - `ai/claude/claude.service.ts`: manda `x-proceso` = `procesoParaPuerta(peticion.proceso)` (minúsculas, dígitos y
    guiones, máx. 40) en las opciones de la petición; no va en el cuerpo y la puerta no lo reenvía a Anthropic. Los
    nombres que ya existen pasan tal cual: `asistente-actividades`, `triage`, `reunion-notas`, `reunion-minuta`,
    `acta-reunion`, `lab`, `eval-*`. Spec con 2 casos nuevos (6/6) y `tsc` del API limpio.
  - Falta: desplegar el API (otro paso) para que el panel deje de ver a NEXARA como `sin-proceso`.

- **23-10 ~18:10 UTC (claude-code) — Gasto de IA en pruebas: evals solo por la puerta, sin Opus.**
  - Adam: «8 dólares para lo poco que hemos usado en pruebas me parece muchísimo… optimiza con código de funciones y
    parámetros para mantener funciones reduciendo costos». Medido en la puerta (octubre): productos reales ~0.21 USD
    (NEXARA 0.20, FinanVoz 0.01); evals por la puerta 3.32 (Opus juez 1.76, Sonnet 1.37) y este eval con la llave
    directa 3.76 (sin tope).
  - `scripts/eval-minutas`: siempre por la puerta (`pruebas.token`, sin camino de llave directa), juez Haiku por
    omisión (`--juez sonnet|opus` explícito), tope 1 USD por mes calendario; lo gastado antes queda en
    `gasto.json › antes_de_la_puerta`. El arnés `src/ai/eval` lo cambia el agente de actividades.
  - Puerta (`PUERTA-IA-app` 298eba3): proyecto `pruebas` sin Opus y con tope de 4 USD al mes.

- **23-10 ~18:10 UTC (claude-code) — «Asignar con IA»: escribir o dictar llena todos los campos como «Asignar».**
  - Adam: que el CEO pueda escribir o dictar «de forma bastante profesional y rápida, y que llene todos los parámetros
    de las actividades correctamente».
  - Evidencia en producción (`audit_logs` + `Activity`): la única actividad creada con IA (AN-0270, 22-10, «Hacer la
    cotización de Anfora») quedó sin fechaInicio/fechaMaxima/entrega, sin tiempo estimado, con el LEAD sin
    `horasPlan`, sin encargo e indicaciones que repetían el título. Las de «Asignar» a mano: fecha en ~100 %,
    encargo en casi todas y el LEAD con `horasPlan` (tiempo estimado obligatorio). «Para el viernes» quedaba como
    día de inicio (solo aparecía el viernes) y «Tox nave 2» no encontraba a «Grupo Tox».
  - API `ai/asistente/asistente-actividades.ts`: plan con `fechaLimite`/`horaLimite`; `agendaDe` (cita = un momento;
    plazo = empieza hoy y vence el día del plazo, como periodo si son días distintos; sin hora: hoy la hora actual,
    otro día 09:00); hora límite escrita en indicaciones; faltantes `fecha` y `duración`; prompt con catálogo de
    clientes, sucursales y proyectos (3.er bloque en caché), reglas de tipo (obra/proyecto solo si se menciona),
    correcciones al dictar y indicaciones sin eco ni pasos inventados; `indicacionesSinEco` y `lugarDicho` en código
    (quitan eco del título y sucursales que no se dijeron); `puntaje` ignora palabras de giro («Grupo», «Hotel»).
    La propuesta trae `agenda`, `duracionMin`, `prioridad`, `encargo`, `indicaciones`.
  - Web `AsistenteIA.tsx` + `lib/asistente-ia-api.ts`: la tarjeta muestra indicaciones y deja corregir responsable,
    cliente, proyecto, día, hora, «Al» (último día), tiempo, prioridad, encargo (reglas de «Asignar» por persona) y
    título/indicaciones («Editar texto»); bloquea igual que «Asignar» (día en servicio/obra, tiempo obligatorio,
    encargo de quien reparte); al crear suma al responsable como LEAD con `horasPlan` (y cupo en despacho);
    botón «Confirmar las N que están listas».
  - Eval (23 casos, 8 nuevos con plazos, duración, dictado con autocorrección y el dictado real de Christian con otro
    cliente; juez Opus con el catálogo y las actividades finales): antes 0.849, 0/23 perfectos, 5 inventos, juez
    3.57 → después 0.944, 9/23, 3 inventos, juez 4.26; revisiones de código 0.99–1.0 en 4 corridas. Haiku 5.5 low sin
    razonamiento, ~US$0.0002 por llamada (con razonamiento 2.4× sin mejorar). Gasto del eval 3.14 de 4 USD.
  - Pendiente: apps nativas sin IA (lo propone el agente principal); periodo por etapa del proyecto (lo que
    «Asignar» propone en obra/proyecto) no se calcula con IA.

- **23-10 ~17:35 UTC (claude-code) — Minuta profesional: título, descripción, tipo, participantes y cada tema concluido.**
  - Adam: «parámetros para no tener costos elevados y perfección de entendimiento… título y todo profesional… que llene
    participantes (fue yo con ARTA Producciones)… que desglose todos los puntos, no un resumen súper resumido… concluye
    cada uno de los parámetros sin llenar de información basura».
  - `minuta-ia.ts`: esquema nuevo con `descripcion`, `tipoSugerido` (enum MeetingType), `organizaciones`, `participantes`
    (nombre, organización, rol; los de NEXARA se ligan a su usuario con `buscar`, los de fuera no) y por tema
    planteamiento (`resumen`), desarrollo (`puntos`), `conclusion` siempre y `estado` (decidido, en_seguimiento,
    abierto, informativo). Prompt: todos los temas sin juntarlos, conclusión obligatoria, fechas escritas, nada de
    relleno; `EMPRESA` menciona el software a la medida (ARTA). Contexto con `Tipo actual` y `Conduce`.
    `CONFIG_MINUTA.esfuerzo` medium (probado con la junta real: mejor quién se reunió y pendientes, ~US$0.055).
    Campos nuevos opcionales en `Minuta` para que las minutas viejas abran.
  - `grabacion.service.ts` `cerrarReunion`: agenda ← descripción si estaba vacía; con título genérico, título y tipo
    sugeridos (una junta con cliente no entra a la serie del cierre semanal); quien conduce y los participantes de
    NEXARA quedan como asistentes presentes. Solo commiteé mis hunks: los de transcripción son del agente de reuniones.
  - PDF: portada con descripción, «Con» (organizaciones) y participantes en dos columnas con «y N más»; cada tema cierra
    con etiqueta de estado y su conclusión; riesgos sin mitigación como lista (sin «No se definió»); «Por asignar».
    Web `MinutaReunion.tsx`: bloque «Con …» con descripción y participantes, estado en la conclusión de cada tema.
  - Pruebas: API reuniones 77/77, tipos API y web, vitest grabacion. Junta real (28 min) con Sonnet medium: 5 temas con
    estado y conclusión, EXTRAORDINARIA, «ARTA Producciones: …», 7 hojas.

- **23-10 ~17:10 UTC (claude-code) — Minuta de reuniones: PDF solo con el resumen y prompt para audio de sala.**
  - Adam probó una junta real de 28 min (reunión 7, grabación 5): «la transcripción es muy pobre… el PDF toma audios
    literalmente; que la moldee a un PDF bien estructurado de resumen».
  - `minuta-pdf.ts`: fuera el anexo con la transcripción completa (y el campo `transcripcion` del payload y
    `marcaAnexo`); el texto sigue en la app (`GET :id/transcripcion`). Prueba nueva: el texto literal no cambia el PDF.
  - `minuta-ia.ts` (notas y minuta): regla para audio de sala (bucles, frases inventadas en silencios, pedazos sin
    sentido u otro idioma se ignoran; reconstruir solo con contexto claro; nunca armar horas, fechas o cifras con
    pedazos) y bloque `REGLAS_REDACCION` (con sus palabras, tercera persona, sin citas, sin hablar del audio).
  - Prueba con la junta real por la puerta (proyecto pruebas, Sonnet 5.5): antes el resumen decía «la transcripción
    es de muy baja calidad», ahora no; 6 temas, «viernes 30 a las 10» bien (un intento intermedio puso 10:30 y se
    corrigió con la regla), PDF de 7 hojas sin anexo, ~US$0.044.
  - La calidad del texto de whisper la está trabajando el agente de reuniones (modelo, partes de 30 s, contexto entre
    partes, filtro de bucles); sus cambios en `ai/voz/transcriptor*.ts` no van en este commit.

- **23-10 ~00:00 (claude-code, R-1) — Reuniones automáticas: grabar con un botón, notas en vivo y minuta en PDF.**
  - Adam (22-10): «le pulsas comenzar a grabar reunión y tiene que empezar a tomar todas las notas… en cuanto le
    des que concluyó, genera un PDF completo que desglose por apartados… con el menor uso posible de tokens».
  - Web `/erp/reuniones`: botón principal «Comenzar a grabar reunión» (pide el micrófono en el mismo toque, crea
    la junta de hoy y graba). Panel en la página (`GrabarReunion.tsx`): «Grabando · 12:34», Pausar/Reanudar,
    «Concluir reunión», partes de 1 min que se suben solas con reintento sin fin (3→30 s, `online`), aviso a las
    2 h 50 y conclusión sola a las 3 h; notas en vivo (`NotasEnVivo.tsx`). En el detalle: asistentes editables,
    minuta (`MinutaReunion.tsx`) con PDF, «Enviar a asistentes» (EmailService/SMTP), acuerdos propuestos con
    responsable, fecha y prioridad (nada se crea solo), lecciones y riesgos sin marcar, seguimiento de la reunión
    anterior, transcripción y notas por tramo; grabación abierta → «Seguir grabando» o «Concluir con lo grabado».
    Pegar transcripción/notas va por el mismo camino (`POST :id/texto`).
  - API `grabaciones-reuniones` (solo quien conduce): `POST :id/partes` (audio + inicioMs/duracionMs; el audio se
    borra al transcribirse), `GET :id?notasDesde=n`, `POST :id/concluir|regenerar|texto|acuerdos|enviar`,
    `GET :id/pdf|transcripcion`, `DELETE :id`. `GET /reuniones/:id/pdf` da la minuta si existe. Tablas nuevas
    `meeting_recordings` y `meeting_recording_parts` (migración `20261023120000_grabacion_reuniones_minuta`).
    Cola (BullMQ): transcribir parte → notas por tramo (candado en BD) → minuta al concluir.
  - IA (`meetings/minuta-ia.ts`): notas cada ~4 min/250 palabras (o 1,500) con Haiku 5.5 low sin razonamiento y
    sistema en caché (~US$0.0002/min); minuta con Sonnet 5.5 low sobre la transcripción completa (JSON con esquema;
    `ANTHROPIC_MINUTA_MODEL` / `ANTHROPIC_NOTAS_MODEL` cambian modelo). PDF `minuta-pdf.ts` (estilo propuesta
    técnica): portada, resumen, top 5, índice con páginas, temas, decisiones, tabla de acuerdos, pendientes,
    riesgos, cifras, lecciones/próximos pasos, seguimiento y anexo con marcas de tiempo.
  - Eval (`apps/api/scripts/eval-minutas`, 8 juntas sintéticas de 11–56 min, juez Opus 5.5): minuta Sonnet sobre
    transcripción completa 0.88 / juez 4.33 vs sobre notas 0.77 / 3.93 (y más cara) vs Haiku completa 0.83 / 4.07.
    Costo por junta: 30 min ≈ US$0.07, 60 ≈ 0.12, 90 ≈ 0.17. Gasto del eval US$3.76 de 4 (llave directa).
  - Tomé los cambios de N-1 en `acta-ia.ts`/`acta-ia.service.ts` (CONFIG_ACTA, `peticionActa`): el endpoint
    `reuniones/:id/acta-ia` queda pero la web ya no lo usa.
  - Desplegado `b5cddc7a` (`--with-migrate`, web con revisión de tipos) y verificado en api.nexara.com.mx con audio
    sintético de 4 min (TTS español, 5 partes por `POST :id/partes`): notas en vivo a los 4 min, minuta en 24 s,
    reunión #3 quedó REALIZADA con título sugerido y minuta en `notas`, PDF 200, audio borrado, 401 sin token,
    US$0.050 en la puerta. El token de prueba se firmó dentro de `nexara-api` (30 min, sin jti) y no salió del servidor.
  - Ajuste tras la prueba: la IA asignó «Diana» a una «Daniela» de la empresa → regla de nombres parecidos en el
    prompt (eval m4/m7 0.81/0.88 → 0.85/0.90); Syscom en el vocabulario de whisper; lecciones y riesgos plegados en
    la lista de acuerdos propuestos; ancho de bloques y contraste de «Pendiente».
  - `b8d895ee` desplegado y verificado: la #3 regenerada ya deja «Diana», «Mafer», «Jorge» como se dijeron (no los
    cambia por otra persona); reunión #4 (misma serie, texto pegado por `POST :id/texto`) trae seguimiento de los 10
    acuerdos de la #3 (cumplido / en proceso / bloqueado / sin mención), US$0.020 con 3.5k tokens del sistema en
    caché; confirmar acuerdos 200; «Enviar» sin asistentes → 400 con mensaje claro (no se mandó correo real).
    Las reuniones #3 y #4 quedaron tituladas «[Prueba de grabación] …» para que Adam las reconozca o las cancele.
  - Detalle de la reunión: «Editar título» (además de asistentes editables).
  - Muestras para Adam (scratchpad de la sesión): `minuta-muestra.pdf`, `minuta-produccion-reunion3.pdf`,
    `captura-grabacion-1536.png`, `captura-minuta-1536.png`. Lo visual espera su visto bueno.
  - **Micrófono (prueba de Adam: «No se escuchó nada»):** su Chrome entregaba «Line 1 (Virtual Audio Cable)»
    mudo. `lib/microfono.ts` mide ~1 s cada micrófono (AnalyserNode; `muted` o cero exacto = sin señal) y prueba
    recordado → el del navegador → «default» → «communications» → entradas reales (virtuales/mezcla estéreo solo si
    no hay otra); recuerda el que sonó en `localStorage` (`nexara.microfono`). Panel: medidor de nivel junto a
    «Grabando · 12:34», selector «Micrófono» (cambiar a mitad cierra la parte y abre la siguiente sin perder nada)
    y aviso a los 5 s de silencio digital. Permiso como el de notificaciones (`use-permiso-microfono.ts` +
    `PermisoMicrofono.tsx`): tarjeta en `prompt`, instrucciones + «Ya lo permití» en `denied`, nada en `granted`;
    sin `permissions.query` (Safari viejo) va directo a `getUserMedia`. Probado con dispositivos falsos (vitest);
    el micrófono real de Adam NO se pudo probar desde aquí.
  - **Onda y transcripción en vivo (Adam: «barritas como un audio de WhatsApp» y ver el texto al hablar):**
    `OndaVoz.tsx` (canvas + requestAnimationFrame, 48 barras a ~20 fps con RMS suavizado; puntito bajo el umbral;
    con «reducir movimiento», indicador fijo) reemplaza al medidor. `TranscripcionEnVivo.tsx`: texto de whisper
    (`GET :id?textoDesde=p`) y, mientras llega, vista previa del reconocimiento del navegador (`use-dictado`,
    es-MX, se reinicia solo; usa la pista elegida en Chrome reciente). Partes de 20 s (medido en el servidor:
    20 s se transcriben en ~5 s → ~25 % del transcriptor por reunión; 60 s en 11.8 s) y consulta cada 6 s.
    Pie con aviso cierto de privacidad e interruptor «Vista previa del navegador» (encendido, `localStorage`).
    Sin SpeechRecognition (Firefox): solo whisper con «transcribiendo…».
  - Pendiente: navegar a otra pantalla del panel dentro de la app corta la grabación (lo subido queda; al volver,
    «Seguir grabando»); solo el cierre de pestaña pide confirmación. App móvil sin cambios.

- **23-10 ~00:10 (claude-code, N-1) — IA de NEXARA por la puerta única, modelo más barato medido con eval.**
  - Adam (22-10): «que llamen bien a la API con el modelo más barato que funcione perfectamente y acomoda
    las instrucciones… optimicemos el costo». Guía: `C:\dev\scripts\ai-os\IA-CLAUDE.md`.
  - Servidor (lo hizo el coordinador): `nexara-api` ya llama a `http://puerta-ia:8080` con el token de NEXARA
    (`/etc/ai/anthropic.env` → `/etc/ai/nexara-claude.env`). La llave vieja sigue en `/etc/secrets/anthropic.env`.
  - `ClaudeService`: opción `pensar` (false = `disabled` en Haiku, `between_tools` en Sonnet), caché en cada
    bloque de sistema, costo con caché leída/escrita, `tokensPensamiento`, mensajes en español para
    `budget_exceeded` y modelo no permitido por la puerta, sin texto del modelo en los logs, método `texto()`.
  - «Asignar con IA»: prompt nuevo (apodos, nombres ambiguos, cliente/sitio, fechas, títulos en infinitivo,
    nunca plan vacío sin pregunta), esquema con `acciones` primero, búsqueda que encuentra «Bodegas Luna
    Atlixco» y «CEDIS de Tox», y candado en código: si la IA elige a uno de dos «Antonio», no se elige.
    Config: Haiku 5.5, esfuerzo low, sin razonamiento, max 3000. Eval 15 casos: 0.877 → 0.993 (15/15 en las
    revisiones de código en 3 corridas), ~$0.0002 por llamada con caché, ~2 s.
  - Triage: de OpenAI a `ClaudeService` (Haiku 5.5, salida estructurada, `triage-ia.ts`); bandera
    `product.ai.triage` sigue apagada. Eval 12/12.
  - Lab: Claude por `ClaudeService` (puerta + token de NEXARA); ya no usa `ANTHROPIC_BASE_URL/AUTH_TOKEN`.
  - Eval: `apps/api/src/ai/eval/` (`npm run eval:ia -w apps/api -- --funcion asistente|actas|triage --variantes
    haiku-low-np,sonnet-low`); resúmenes y gasto en `resultados/`, detalle en `.ai/eval-ia/` (ignorado).
  - **Actas: NO se tocaron (las toma R-1).** Eval de actas hecho con el prompt actual: Sonnet low 0.966
    (15 inventos) vs Haiku low 0.921 (34 inventos) → Haiku aún no iguala; se queda Sonnet. Mis cambios en
    `meetings/acta-ia.ts` y `acta-ia.service.ts` (CONFIG_ACTA, `peticionActa`) quedaron sin commitear para R-1.
  - **Desplegado** con el deploy de R-1 (05:37 UTC, `b5cddc7a`, que trae mi `c84bae4c`); no corrí otro.
    Entorno: `/etc/ai/nexara-claude.env` + `ANTHROPIC_ASSISTANT_MODEL=claude-haiku-5-5`; en `deploy/.env.nexara`
    `ANTHROPIC_BASE_URL=http://puerta-ia:8080` y `ANTHROPIC_AUTH_TOKEN` vacío (respaldo `.env.nexara.bak-20261023-ia`;
    el proxy viejo de terceros ya no se usa).
  - **Verificado por HTTP real** (dentro de `nexara-api`, CEO de pruebas id 35, token de 10 min sin sesión):
    `ai/asistente/estado` 200; `interpretar` 201 en 1.4–2.4 s con Haiku sin razonamiento (~US$0.0002–0.0005);
    el caso «urgente… que X vaya ya, y compren 10 RJ45» que antes devolvía plan vacío ahora da 2 actividades;
    `ai/triage` 201 (reglas, bandera apagada) y el triage con Claude directo P1/CORRECTIVO; `lab/ai` 201 «OK» por
    la puerta (bandera `lab.ai.live` encendida); Opus en la puerta → «no está permitido» (esperado);
    `reuniones/2/acta-ia` 201 con Sonnet (US$0.011). La puerta registró todo en `/uso` (NEXARA: US$0.025 del mes).
  - Gasto de pruebas de N-1: US$2.44 de 4 (proyecto `pruebas` de la puerta).

- **22-10 ~15:40 (claude-code) — «No cumplida» al cierre de jornada (desplegado) + propuesta del evaluador IA.**
  - Adam: «cualquier actividad que no se acabe después de la jornada laboral se toma como incumplida… y que se
    pueda poner que una actividad no se cumplió, pero mucho más profesional».
  - Commit `5d800f59`, desplegado con `--with-migrate` (migración `20261022200000_actividad_no_cumplida`
    aplicada; web compiló con revisión de tipos). Estatus «No cumplida» + tabla `activity_non_compliances`.
  - Cron cada 5 min (`ActivityNonComplianceService`): cierre = salida más tarde de quienes la ejecutan (18:00 por
    omisión), aviso 1 h antes, «Por Validar» nunca se cierra, solo lo que vence desde el 22-10. Simulación de solo
    lectura en producción: 10 actividades de hoy cerraban a las 18:00 si no se entregaban; las 6 vencidas antes
    (AN-0009, 0189, 0232, 0241, 0249 y AN-0001 sin fecha) siguen abiertas a propósito: Adam decide.
  - Superiores: «Registrar incumplimiento» (causa + observaciones) y «Reprogramar» (reabre; el registro queda).
    KPIs: cuenta como «sin entregar». Web: etiqueta roja, diálogos, aviso en detalle, historial, «No cumplidas» en
    Mis actividades. No verificado visualmente (sin sesión en el panel).
  - Bug corregido de paso: el aviso de atrasos leía 400 actividades incluyendo cerradas (con >400 dejaba de avisar).
  - **Propuesta** `.ai/CUMPLIMIENTO-EVALUADOR-SPEC.md` (complejidad + tiempo estándar, integridad, evaluador IA):
    esperando 4 decisiones de Adam; no construir antes.
  - Móvil (`23fdf90f`): paridad en Android e iOS (estatus, aviso, registrar y reprogramar). Android 115 pruebas JVM
    y `assembleDebug` OK. **iOS sin compilar aquí**: lo compila el workflow «iOS capturas de App Store (simulador)»
    que disparó ese push; revisar su resultado. Sin cambio de versión: sale en la próxima publicación de tiendas.
  - Main local y remoto quedaron reconciliados (rebase; la versión local de reuniones del 12-10 se guardó en
    `.ai/salvado/2026-10-12-reuniones-local/` y en `git stash`, sin aplicar: Adam decide).

- **19-10 ~11:30 (claude-code) — Cuarto rechazo iOS (12-10, 2.3.10) diagnosticado: captura de iPad con imagen Android.**
  - Adam: «revisa el nuevo rechazo… y verifica cómo ajustar todo para que no nos vuelvan a rechazar».
  - Build 1.0.0 (10) rechazado el 12-10 (iPad Air M3) por «non-iOS status bar images». Apple adjuntó la imagen
    de marketing de Android de septiembre. Por la API interna de ASC: la versión 1.0 conserva un juego
    `APP_IPAD_PRO_3GEN_129` con esa sola imagen (`imgonline-com-ua-resize-L2apCDrgZOu.png`, 2048×2732), oculto en
    la pestaña iPhone porque la app es solo iPhone. Explica también el rechazo 2.3.10 del 04-10.
  - **Adam debe pulsar**: Gestor de recursos multimedia → iPad → «Eliminar todo» → Guardar → «Actualizar
    revisión» → responder (texto en `docs/store/IOS-RESPUESTA-APPLE.md`) → «Volver a enviar». El clasificador
    de permisos bloquea a Claude el borrado y la API DELETE. Sin build nuevo.
  - Verificado en ASC: sin adjuntos, sin vistas previas, descripción sin «Android», solo es-MX, categorías
    Negocios/Productividad, demo `play.review@nexara.com.mx`. Android **1.0.7 (17) publicada** en Play desde el
    12-10 (2 países, base 93 %).
  - Nueva «Lista de verificación antes de CADA envío» al final de `docs/store/IOS-RESPUESTA-APPLE.md` (revisar
    iPhone/iPad/Watch/iMessage en el Gestor multimedia, textos, binario, 2.1, flujo de reenvío).
  - **~11:40: reenviada.** Adam pulsó «Eliminar todo» (juego de iPad vacío, verificado por la API); Claude pulsó
    «Actualizar revisión», publicó la respuesta en el Resolution Center (hoy 11:34) y «Volver a enviar»:
    **1.0.0 (10) «Pendiente de revisión»**. Nada que hacer hasta que Apple conteste.
  - **22-10: APROBADA.** La versión 1.0 está en `PENDING_DEVELOPER_RELEASE` (lanzamiento manual): falta pulsar
    «Publicar esta versión» en ASC para que salga en la App Store. Adam decide cuándo.
  - **22-10 ~10:20: PUBLICADA.** Adam autorizó; Claude pulsó «Publicar esta versión» (175 países). Estado
    `READY_FOR_DISTRIBUTION`; la ficha https://apps.apple.com/mx/app/id6814597698 tarda unas horas en aparecer.
  - Los 14 archivos de reuniones sin commitear son del turno anterior: no se tocaron. **main local y remoto
    divergieron** (remoto: `63accdee` reuniones 12-10 + `399cd877` asistencia 14-10; local: `283ce9b6` + docs
    `f66b13c7`); los cambios sin commitear NO coinciden con lo del remoto. Adam decide cómo reconciliar; los
    commits de docs de este turno están solo en local.
- **12-10 ~21:35 (claude-code, nube) — Reuniones simple (`.ai/REUNIONES-SIMPLE-SPEC.md`).**
  - IA de reuniones (grabar, transcribir, acta) solo encargados de área: fuera de `MEETINGS_STAFF_URL_RULES`; ENC_SOPORTE conduce (lead).
  - `POST reuniones/:id/acuerdos` acepta `crearActividad`: crea Tarea·Junta INTERNAL del responsable (`acuerdo-actividad.ts`, vía `ActivitiesService.create`) y la liga; si falla, el acuerdo queda y responde `avisoActividad`.
  - Web: «Empezar reunión ahora» (crea, abre y graba sola), acta se genera sola al terminar la transcripción, 3 pestañas (Reuniones, Mis acuerdos, Agenda); vencidos y lecciones son filtros.
  - Pendiente de lo que encontró la revisión en la lap: cerrar el detalle corta la grabación; minuta a mano sin IA; error de saldo claro.
- **12-10 ~06:00 (claude-code, nube) — Voz a texto propia (whisper), sin proveedores.**
  - Adam: «lo que pensabas hacer con un proveedor debemos hacerlo nosotros con código». Sustituye la idea de AssemblyAI.
  - `deploy/docker/Dockerfile.transcriptor` + servicio `transcriptor` (perfil, red interna): whisper.cpp v1.9.5
    compilado en el servidor, modelo `WHISPER_MODEL` (small por omisión) + VAD silero, `POST /inference`.
    Activar: `docker compose --profile transcriptor up -d --build transcriptor` y `TRANSCRIPTOR_URL=http://transcriptor:8080`.
  - API: `ai/voz/transcriptor.service.ts`; `GET ai/voz/estado`, `POST ai/voz/transcribir` (dictado, síncrono).
    Juntas: `grabaciones-reuniones/:id` (GET/DELETE) y `:id/partes` (POST); trabajo de cola `reunion.transcribir-parte`.
    Estado en disco (`uploads/grabaciones-reuniones/<empresa>/<reunión>/parte-NNNN.{webm,txt,err}`), carpeta bloqueada
    en `/uploads`. Audio se borra tras transcribir salvo `GRABACION_CONSERVAR_AUDIO=1`. Matriz: `VOZ_IA_URL_RULES`.
  - Web: `DictadoBoton` usa el transcriptor propio si existe (si no, el del navegador); `reuniones/GrabarReunion.tsx`
    graba en partes de 5 min (`lib/use-grabadora.ts`) y deja el texto en ActaIA.
  - Probado: compilación de whisper-server, contrato HTTP y servicio contra el binario real con modelo de prueba,
    partes de MediaRecorder decodificables por ffmpeg. No probado con modelo real (HuggingFace bloqueado aquí).

- **12-10 ~05:30 (claude-code, nube) — IA con Claude: asignar actividades y actas de reunión.**
  - Adam: «que el CEO escriba "que Antonio vaya a Tox a las 3" y la IA asigne»; luego actas de reunión.
  - API `ai/claude/claude.service.ts`: único cliente de Claude (SDK `@anthropic-ai/sdk`), clave solo en
    `ANTHROPIC_API_KEY`, salida JSON con esquema, caché del prompt, tope diario por empresa
    (`CLAUDE_TOPE_DIARIO`, 300). Sin clave, todo se oculta o responde 503 con mensaje claro.
  - Asistente: `POST ai/asistente/interpretar` (Haiku por omisión, `ANTHROPIC_ASSISTANT_MODEL`) propone; la web
    (`components/pizarra/AsistenteIA.tsx`, en Actividades) confirma con `POST /activities`. Matriz:
    `ASISTENTE_IA_URL_RULES` dentro de superiores y del selector de personas.
  - Actas: `POST reuniones/:id/acta-ia` (Sonnet, `ANTHROPIC_ACTAS_MODEL`, tope 110 s por el corte de 120 s del API)
    propone minuta y acuerdos; `reuniones/ActaIA.tsx` guarda con `PATCH :id` y `POST :id/acuerdos`.
  - Falta: poner la clave en el `.env` del servidor y probar con Claude real; grabación + transcripción de audio
    (hecho después con whisper propio, ver arriba) y PDF del acta.
  - Pruebas: 4 de `accounting/qa-adversarial.spec.ts` fallan igual en `main` (zona horaria del contenedor).

- **09-10 ~12:10 (claude-code) — iOS build 10 listo para reenvío + Android 1.0.7 (17).**
  - iOS: build 1.0.0 (10) subido (workflow `ios-testflight.yml`), en ASC descripción y Notes sin ubicación en
    segundo plano, build 10 en la versión 1.0, respuesta a Apple publicada, «Actualizar revisión» → elemento «Listo
    para revisión». El clic final «Volver a enviar a revisión de apps» lo da Adam.
  - Android: `gradle.properties` VERSION_CODE 17 / VERSION_NAME 1.0.7; `bundleRelease` firmado (26 MB) copiado a
    `Descargas/NEXARA-android-1.0.7-17.aab`; 793 pruebas JVM en verde. Incluye escáner único y menú vivo, motivo de
    sin ubicación + aviso de ubicación apagada, identidad en la cola sin conexión, adjuntos comerciales, cotización
    sin IVA. El AAB no cabe por `file_upload` (tope 10 MB): Adam lo arrastra en Play Console.

- **09-10 ~10:30 (claude-code) — Iván «compartiendo ubicación» en la app vs «Sin ubicación» en la web + horas del recorrido.**
  - No es contradicción: la app dice que la jornada está abierta y el GPS de jornada encendido; la web marca la
    CHECADA de las 9:21, que llegó sin coordenadas (app instalada: lectura balanceada sin reintento; la versión de
    `main` ya reintenta con GPS fino). El GPS de jornada manda un punto cada 30 min y solo si se movió 500 m
    (`JornadaGps.INTERVAL_MS`/`MIN_DISTANCE_M`): hoy solo uno a las 10:10.
  - Bug corregido: al checar la salida (`attendance.service`) y al apagar el consentimiento (`gps.service`) se hacía
    `updateMany({ estaActivo: false, ultimaActualizacion: now })` y TODO el recorrido del día quedaba a la hora de la
    salida (los 28 puntos de Iván del 08-10 dicen 18:37). Ahora solo `estaActivo: false`. Lo ya sobrescrito no se
    puede recuperar.

- **08-10 ~11:30 (claude-code) — Registro de teléfonos con la ubicación apagada.**
  - Adam: «que nos registre si hay algún dispositivo con la ubicación apagada».
  - **Migración `20261008120000_estado_ubicacion`** (aditiva): tabla `location_status_events` (userId, companyId,
    estado APAGADA/SIN_PERMISO/ENCENDIDA, fuente APP/CHECADA/GPS, origen, deviceInfo, at). Desplegar con
    `--with-migrate`.
  - API `attendance/estado-ubicacion.ts`: solo cambios (`debeRegistrarse`: ENCENDIDA solo cierra un tramo abierto;
    el mismo aviso de otro día abre tramo nuevo), `tramosSinUbicacion`. `POST attendance/estado-ubicacion`
    (`EstadoUbicacionController`, registrado antes de `AttendanceController`); la checada anota APAGADA/SIN_PERMISO
    por `ubicacionFalla` y ENCENDIDA si trae coordenadas; cada punto de `POST gps` cierra un tramo.
    `attendance/hierarchy/range` trae `sinUbicacion` por persona.
  - Web Asistencias (columna Estado): «Ubicación apagada desde 10:15» (rojo, sigue apagada) o «Ubicación apagada
    2 veces · 1 h 35 min» (ámbar), detalle en el `title` (`avisoUbicacion` en `lib/attendance-validacion.ts`).
  - Android: `JornadaGpsService` escucha `PROVIDERS_CHANGED_ACTION` con la jornada abierta y manda el estado
    (`util/EstadoUbicacion.kt`). iOS: `Util/EstadoUbicacionMonitor.swift` (solo permiso, sin pedir ubicaciones) al
    volver a primer plano y en `locationManagerDidChangeAuthorization`; en iOS «apagada» se revisa antes que el
    permiso (con la ubicación apagada el permiso sale `.denied`). Ambas requieren nueva versión en tiendas.

- **08-10 ~11:10 (claude-code) — «Sin ubicación» dice por qué + la cola sin conexión ya no se toma por PC.**
  - Adam (captura de Asistencias): «por qué hay muchos usuarios sin ubicación… que diga por qué».
  - Diagnóstico con datos: Iván, Mónica y Roberto (Android) mandaron la checada sin coordenadas y sin causa (tienen
    permiso; su GPS de jornada mandó puntos minutos después): `DeviceLocation.current()` usa BALANCED (Wi-Fi/celda) y
    no reintenta con GPS. Salvador checó sin señal: la app la mandó después por `OfflineSyncCoordinator`, que usaba un
    OkHttp sin identidad (`okhttp/4.x`) → el API la leía como PC/WEB; con la excepción web cerrada eso se RECHAZA
    (5 checadas reales rechazadas así del 28-09 al 06-10: infraestructura 28-09 entrada, finanzas 29-09 salida y
    30-09 entrada, Daniela 30-09, soporte 06-10 salida). La excepción web está abierta hasta el 18-10.
  - API: `ubicacionFalla` en `CreateAttendanceDto` (PERMISO_NEGADO, UBICACION_APAGADA, SIN_SENAL, NO_DISPONIBLE,
    ERROR) → `motivoSinUbicacion` («Sin ubicación: ubicación del teléfono apagada», «…: checada desde el navegador»,
    sin causa: «…: la app no informó la causa (versión anterior)»). `clienteNativoSinIdentidad`: `okhttp/…` = Android,
    `CFNetwork … Darwin` = iOS (origen y deviceInfo «… NEXARA App (envío diferido)»).
  - Web: `AttendanceForm` manda `ubicacionFalla` con `fallaDeGeolocalizacion` (código 1/2/3 del navegador).
  - Apps (hechas 08-10 ~11:30): identidad en la cola sin conexión y en los clientes propios (Android `AppIdentity`,
    iOS `DeviceIdentity.aplicar`), reintento con GPS fino (12 s) y `ubicacionFalla` con nota en la confirmación.

- **08-10 ~09:45 (claude-code) — Almacén: tipo de artículo + capacidad de empaque + búsqueda rápida (API y web).**
  - Adam: «tipado más fuerte… búsqueda rápida en stock y almacén… un taladro es uno y uno, otro un bote de cinchos
    con 100 piezas»; aprobó 4 tipos (Herramienta, Equipo, Consumible, Por medida) y búsqueda «en ambas» pantallas.
  - **Migración `20261007220000_tipo_articulo`** (aditiva, idempotente): `Product.tipoArticulo` VARCHAR(20) null +
    índice (companyId, tipoArticulo). Desplegar con `--with-migrate`.
  - API: `catalog/tipo-articulo.ts`; `catalog/dto/producto.dto.ts` (alta/edición validadas: con el
    `forbidNonWhitelisted` global, campos de más → 400; PATCH acepta `sku` con 409 si se repite); HERRAMIENTA no es
    producto (400) y EQUIPO no lleva empaque; el empaque (nombre + capacidad) se crea o corrige como default de compra.
    `GET tool-requests/busqueda-rapida?q=&tipo=&limite=` (`busqueda-rapida.service.ts` +
    `warehouse/busqueda-rapida.ts` puro): herramientas y artículos juntos, sin acentos, por código del empaque, quién
    la tiene, conteos por tipo. `stock/levels` trae `tipoArticulo` y `packagings` del producto.
  - Web: `BusquedaRapidaInventario` en Almacén («Todos») y Herramientas («Herramientas»), chips con conteo, Enter del
    lector abre el código exacto, flechas/Esc; `ArticuloDialog` (alta/edición con tipo obligatorio, empaque Bote/Bolsa/
    Caja/Paquete o presentación en metros, «1 bote = 100 pz»; tras alta abre la Entrada); existencias en empaques
    («3 botes + 40 pz»). `useEmpaquesDeArticulos` solo pide los que `stock/levels` no traiga.
  - Pendiente: alta por código del Escáner (`stock/products/por-codigo`) aún sin tipo; apps sin tipo ni búsqueda rápida.
  - Desplegado 08-10 ~09:40 con `--with-migrate` (migración aplicada). La búsqueda funciona. 08-10 ~10:05 Adam pidió «elimina el
    martillo, empezamos de cero»: borrada la herramienta 1 (empresa 1, sin préstamos ni kits; respaldo en el servidor
    `/root/respaldos/martillo-tool_inventory_items-1-2026-10-08.json`). Empresa 1 queda con 0 herramientas y 0 artículos.

- **08-10 ~09:30 (claude-code) — iOS: menú vivo + un solo escáner (paridad con Android).**
  - `AuthRepository.refreshNavigation(forzar:)` (máx. cada 5 min, una sola petición en curso, conserva el menú si
    falla, solo guarda si cambió y respeta el token vigente); `CoreShellView` la llama al montar y en cada
    `scenePhase == .active` (forzada si la sesión no trae menú); `maybeExtendSession` pasa por ella; el login anota la
    lectura. Demo y cliente/sucursal no piden nada.
  - `UI/Core/Extras/EscanerDeCodigos.swift` (nuevo) usado por Almacén y Herramientas con el mismo orden, errores y
    textos que Android; reglas puras en `EscaneoReglas`; `CodigoBarras` con la forma de etiqueta; `canOpenExtra` en
    `Access/CoreNavigation.swift`; cámara EAN/UPC + Code 128 con acceso a Almacén.
  - Verificado: `scripts/ios-static-check.py` 0 problemas. Compilación: la del CI (sin Mac local).

- **08-10 ~09:25 (claude-code) — Android: menú vivo + un solo escáner (herramienta o artículo) para Iván.**
  - Adam: «Iván solo tiene para escanear herramientas… las que se escanean son las de almacén, y él no tiene el módulo».
  - Menú: `MainActivity` relee `me/navigation` en cada vuelta a primer plano, máx. cada 5 min
    (`SessionRefreshPolicy.shouldRefreshNavigation`, hora a nivel de proceso). `AuthRepository`: sin red/5xx conserva el
    menú guardado; `refreshNavigation()` solo guarda si cambió. `ConsoleNavHost`: la barra de abajo también sigue a la
    sesión (destino inicial fijo desde el rediseño v2).
  - Escáner: `ui/console/more/EscanerUnificado.kt` (`EscanerDeCodigos`) usado por Almacén y Herramientas. Orden
    (`EscaneoRules`): sin acceso a Almacén → solo herramienta («No es una herramienta registrada.»); con acceso y forma
    de etiqueta (`CodigoBarrasRules.esFormaEtiquetaHerramienta`, `ABC-…`) → herramienta y luego artículo; otro código →
    artículo y luego herramienta (código de fabricante); nada → «Dar de alta». 404/403 pasan a la siguiente búsqueda;
    red/5xx se muestra. Títulos «Escanear artículo o herramienta» / «Escanear herramienta o artículo».
  - Verificado: `compileDebugKotlin` y `testDebugUnitTest` (778, 0 fallos). Requiere nueva versión en Play.

- **08-10 ~09:20 (claude-code) — iOS: rechazo de Apple 2.5.4 → GPS de jornada solo en primer plano.**
  - Apple rechazó 1.0.0 (9) el 07-10 (guía 2.5.4): `location` en `UIBackgroundModes` solo para seguir a empleados no
    se acepta. Texto íntegro, causa y respuesta en inglés en `docs/store/IOS-RESPUESTA-APPLE.md` (sección del 07-10).
  - `Info.plist`: sin `location` en `UIBackgroundModes` y sin el texto del permiso «Siempre». `ShiftGpsTracker.swift`:
    solo «Mientras se usa la app», sin `allowsBackgroundLocationUpdates` ni cambios significativos; `resumeIfNeeded()`
    re-arma al volver a primer plano. En iOS el recorrido solo se registra con la app abierta; Android igual que antes.
  - **Pendiente (con OK de Adam):** workflow `ios-testflight.yml` version=1.0.0 build=10 upload=true; en App Store
    Connect cambiar descripción y Notes (ya en el doc), elegir el build 10, responder y reenviar. Si Adam necesita
    seguir con la app cerrada, la vía es Custom App por Apple Business Manager, no la tienda pública.

- **08-10 ~09:10 (claude-code) — KPIs: «Actividad por día» (quién no tocó nada o solo una).**
  - Adam: «profundizar más en las actividades: ayer tal solo registró una actividad o ayer no registró ninguna; quiénes
    casi no han sido productivos».
  - API `me/kpis-equipo.ts`: `DiaKpi.actividadesDelDia` (actividades distintas con reloj corriendo ese día o entregadas
    ese día) y `entregasDelDia`; `TotalesKpi.actividadDiaria` = { esperados, sinActividad, conUna, promedio } sobre los
    días que debía trabajar (equipo: suma y promedio ponderado). Servicio: `KpiPersonaFila.actividadPorDia` (filas
    compactas `ActividadDelDiaFila` con estado trabajado/sin_trabajo/sin_checar/justificado/pendiente) vía
    `actividadPorDiaDe`. No cambia el cumplimiento (es lectura).
  - Web: `components/kpis/ActividadPorDia.tsx` en Indicadores (entre las tarjetas y «Por persona», no en «solo yo»):
    tabla persona × últimos 15 días (verde ≥2, ámbar 1, rojo 0/F, J justificado), columna «Sin · Una · Prom.», orden
    por días sin nada y resumen del último día terminado con nombres. Pruebas: `ActividadPorDia.spec.tsx`.
  - Apps: aún no lo muestran (los datos ya vienen en `GET me/kpis-equipo`).

- **07-10 ~16:00 (claude-code) — IVA opcional en cotizaciones + almacén para Iván.**
  - **IVA:** `Cotizacion.conIva` (migración `20261007200000_cotizacion_con_iva`, ADD COLUMN default true). Sin factura:
    `calculateTotals/calculateLine(…, { conIva: false })` ponen IVA y retenciones en 0 (la partida conserva su tasa);
    servicio (crear/editar/recalcular/PDF interno), vista previa, PDF del cliente (`cotizacion-formato-nexara`: sin renglón
    de IVA y «sin IVA (no incluye factura)»), propuesta técnica y PDF interno. Web: `Switch` «Requiere factura (lleva
    IVA)» bajo el margen en `SeccionCotizacion`, totales del editor con `totalesDePartidas(…, conIva)`. Apps: «Sin IVA
    (sin factura)» en Importes.
  - **Iván (administracion.ventas@) controla el almacén** sin cambiarle el rol: `api/src/warehouse/almacen-access.ts`
    (por correo, como herramientas) → `UrlAccessGuard` usa `ALMACEN_POR_CORREO_URL_RULES` (`checkUrlRules`),
    `AuthService.applyAlmacenByEmail` (STOCK/WAREHOUSE VIEW+MANAGE, CATALOG_VIEW), `me.service` (menú web/apps). Web:
    `lib/almacen-access.ts` en `canUserAccessPath` y `getErpInventorySectionConfig` (manage sin borrar). Para darlo a otra
    persona: agregar su correo en los dos archivos.
  - **Pendiente (Adam):** tipado de artículos de almacén/herramientas (pieza única vs empaque con N piezas vs equipo) y
    búsqueda rápida; nóminas/tabuladores para cobertura de costo en KPIs.

- **07-10 ~15:15 (claude-code) — KPIs v3: días perdidos y carga MULTIPLICAN el cumplimiento.**
  - Adam: «debe bajar mucho su rendimiento en un día si no lo trabajaron y no está justificado» y «prioriza mucho
    carga de trabajo en relación con horas que estuvieron en la oficina; si es muy bajo deberían bajar mucho».
  - `me/kpis-equipo.ts`: `DiasDeTrabajoKpi` (esperados = laborables terminados —o hoy pasada su salida/18:00— desde su
    ingreso y sin justificar; trabajado = ≥ `MIN_TRABAJO_DIA_MIN` 30 min con actividad o una entrega ese día; perdido =
    sin checar o checó sin trabajo). `DiaKpi` + `trabajado/sinTrabajo/noTrabajado`. Cumplimiento = promedio ponderado
    (entregas 20, ritmo 20, tiempo 15, ocupación 15, asistencia 15, forma 10, uniforme 5) × días trabajados/esperados ×
    min(1, carga% / `META_CARGA_PCT` 50). Sin trabajar ninguno → 0. `carga` y `dias` salen en `cumplimientoPartes` con
    peso 0 («multiplica el total»); web/Android/iOS ya no pintan «pesa 0 %». Semáforo: 1 día perdido = rojo.
  - Servicio: permisos/vacaciones APROBADOS (`leave_requests`) cuentan como justificados (`leerPermisos`).
  - Web ranking: «carga N %» en la fila y avisos «N días sin trabajar» / «Carga N %» primero.

- **07-10 ~13:00 (claude-code) — adjuntos en actividades comerciales + guardar/compartir PDFs en las apps.**
  - Adam: «que en actividades de tipo comercial se pueda adjuntar un archivo (evidencias en Excel, Word o PDF) y se vea
    embebido… en la iOS intento descargar o enviar por WhatsApp las cotizaciones y se queda trabado».
  - **API (desplegado):** tabla `activity_attachments` (migración `20261007150000_activity_attachments`, aditiva) y
    `activities/attachments/*`: `GET/POST activities/:id/adjuntos` (multipart `files`, 10 × 25 MB; pdf, imágenes,
    xlsx/xls/xlsm/csv, docx/doc, pptx/ppt, txt), `DELETE …/:adjuntoId`, `GET …/:adjuntoId/archivo` (nombre original en
    `filename*`), `GET …/:adjuntoId/vista-previa` (HTML sin scripts de Excel/CSV/Word, CSP propia;
    `common/files/vista-previa-documento.ts` con exceljs + **mammoth** nuevo en `apps/api`). Adjuntar: equipo de la
    actividad, dirección o `activities.manage`; quitar: quien subió, responsable/creador o gestor (borrado lógico).
  - **Causa del bug iOS:** `PDFViewerScreen` compartía `ShareLink(item: data)` (bytes sin nombre ni tipo). Ahora escribe
    un archivo temporal con nombre + `.pdf` forzado (los folios con varios participantes llevan punto) y ofrece «Guardar
    en Archivos» + «Compartir» (`UI/Common/PDFViewerView.swift`: `NxArchivoTemporal`, `nxAccionesDeArchivo`,
    `DocumentoScreen` con Vista Rápida). Android: `ui/common/DocumentoViewer.kt` (`DocumentoDialog` con Guardar por el
    selector de Android, Compartir, Abrir con…, PDF/imagen/HTML en WebView sin JS).
  - **Web (desplegada):** `components/erp/ArchivosDeActividad.tsx` + `lib/actividad-adjuntos-api.ts` en el detalle de la
    actividad comercial (PDF con pdf.js, imagen, Excel/CSV/Word con `<iframe sandbox srcDoc>` de `/vista-previa`).
  - **Android:** `ActividadAdjuntosSection` en el Detalle (comercial), `DocumentoDialog` para la cotización y
    `ProtectedPdfDialog` (Guardar con selector, Compartir, Abrir con…; PDF página por página). `ApiClient.authed` tiene
    `withOffline` (subir/bajar/quitar adjuntos sin la capa offline). El portal de tickets aún abre PDFs con `openFile`.
  - **iOS:** `ActivityAdjuntosSection` (Archivos o Fotos, Vista Rápida a pantalla completa, quitar con confirmación);
    demo con AN-0155 comercial y adjuntos reales (xlsx/docx/pdf) en `Demo/DemoFixtures+Adjuntos.swift`. Pendiente
    revisar en iPhone: `EvidenceCaptureFlowView.swift` tiene dos `.fileImporter` seguidos (líneas ~306 y ~319).
  - **No publicado en tiendas.**

- **07-10 ~10:40 (claude-code) — KPIs «en tiempo y forma» + Mi equipo con detalle (pedido de Adam).**
  - Adam: «los que cumplen más en tiempo y forma son Daniela y Luis» y el ranking los ponía abajo. Causa con datos
    reales (28-09→07-10): «Productividad» = reloj de actividad ÷ jornada (premiaba dejar el reloj prendido: David
    98 % con 1 entrega) y «a tiempo» se medía con `fechaFinalizacion` (hora en que el JEFE aprueba) y con la fecha
    máxima cruda (el formulario la guarda = hora de inicio → todo lo del mismo día salía tarde). Luis 17/18 a tiempo,
    Daniela 13/14, 0 devueltas.
  - API: `limiteDeEntrega()` exportado de `activities/semaforo-actividad.ts` (el mismo tope del semáforo) y usado en
    `pizarra-kpi.ts` (`vencida`/`aTiempo`), `workflow-kpis.ts` (SLA con `entregadaAt` = fin real o evidencia, ya no la
    aprobación) y KPIs. `me/kpis-equipo.ts`: `EntregaKpi`, `entregasDelRango`, `resumenEntregas`, `cumplimientoDe`
    (pesos 40 entregas a tiempo / 25 aprobadas a la primera / 25 asistencia puntual / 10 uniforme; null sin entregas);
    `TotalesKpi` + `entregas`, `asistenciaPuntual`, `cumplimientoPct`, `cumplimientoPartes`; el semáforo ya no usa la
    productividad. `kpis-equipo.service.ts` `leerEntregas` (asignadas hasta 120 días antes, sin despacho LEAD; revisiones
    de `activity_evidence_reviews`), detalle por persona trae `entregas[]`.
  - Mi equipo (`me/board`): `entradaHoyAt`, `salidaHoyAt`, `currentLateReason` ('inicio'|'tope'|'plan'), `idleSinceAt`
    y `lastFinished` ahora también en «sin_actividad» (última de cualquier día; ocio = máx(entrada de hoy, lo último que
    terminó hoy)). Web: tarjeta «Para atender hoy» (`components/pizarra/AtencionEquipo.tsx`, solo rango Hoy) con
    Atrasados / Sin nada asignado / Sin entrada hoy; hint «2 atrasados · 9 sin nada asignado · 3 sin entrada».
  - Web KPIs: tarjeta «Cumplimiento», «Tiempo en actividades» (antes Productividad), orden por cumplimiento, barra de
    entregas (a tiempo/tarde/sin entregar) y en el detalle las partes + tabla «Entregas».
  - **v2 (~11:30, Adam: «que siempre estén haciendo algo y se tarden lo adecuado… Alejandro un día hizo una sola y
    Daniela cinco»):** cumplimiento con 8 partes (`PESOS_CUMPLIMIENTO`): entregas a tiempo 20, ritmo de entregas 20
    (entregas/día vs percentil 75 del equipo, mín. 1; `referenciaDeRitmo` + `conReferencia`, por eso `getEquipo` calcula
    en dos pasadas y `getPersona` lee a todo su equipo), tiempo adecuado 15 (minutos reales de sesiones ≤ tiempo máximo o
    estimado+25 %; varios días no se mide), aprobadas a la primera 10, carga 10 (estimado de lo entregado ÷ horas
    trabajadas, meta 75 %; sin estimado = real hasta 2 h), siempre con algo 10 (tiempo con actividad, cada una recortada
    a su máximo del día, sin plan 4 h; `recortaPorTope`; meta 70 %), asistencia puntual 10, uniforme 5. Web: columna
    «Tiempo» en Entregas del detalle y «N por día · N/N en su tiempo» en el ranking.
  - **Apps (~11:20):** Android e iOS con lo mismo que la web: KPIs ordenados por cumplimiento (tira Cumplimiento /
    Puntualidad / Tiempo en actividades sin semáforo / Uniforme / Extra; tarjeta Cumplimiento · Entregas · Puntualidad;
    al desplegar, las partes que mande el API, genéricas) y Mi equipo con desglose de «Con retraso» y «Para atender
    hoy» (solo rango Hoy; sin «＋ Asignar» porque esa pestaña no asigna). API vieja: Android/iOS distinguen
    `entradaHoyAt` ausente de nulo (iOS `traeJornadaHoy` con `c.contains`). `NxMetric` acepta pie de varios renglones
    en las dos. iOS demo: Fernanda sin entrada hoy, Javier atrasado, Ricardo sin nada desde que entró, Paola ya salió.
    Android: suite completa de pruebas en verde. iOS: sin target de pruebas unitarias; compila en CI.
    **No publicado en tiendas** (iOS build 9 sigue en revisión; Android 1.0.6 en revisión).

- **07-10 ~07:50 (claude-code) — pedido de Adam (iOS sigue sin aprobarse):**
  - **Checar desde la web, 10 días más:** `attendance.web_checkin_until` (companyId 1) = `2026-10-18T05:48:52Z`
    (17-oct 23:48 hora de México), con `apps/api/scripts/set-web-checkin-window.sql` (`hours=256`). Se cierra sola.
  - **Jornadas del 06-10 cerradas a mano** (las había cerrado el cierre automático, sin salida real): José Antonio
    Ramírez (id 39, checa por Safari en iPhone) salida 20:05 → **18:31** (446 min); Mónica García (id 5) 19:05 →
    **18:00** (475 min). Igual que `corregirChecada`: hora nueva, `validacion` OK, fila en `attendance_corrections`
    con antes/después/motivo y `porId` 2 (Adam), `AttendanceDay` recalculado. Hecho por SQL en una transacción con
    comprobación (no se levantó otra instancia del API para no disparar tareas programadas), así que **no les llegó
    el aviso «Corrigieron tu checada»**. Las entradas siguen como estaban (Antonio PENDIENTE por web, Mónica REVISAR
    por «sin ubicación»).

- **05-10 ~18:10 (claude-code) — APPS PUBLICADAS (autorizado por Adam).**
  - **Android 1.0.6 (16)** en revisión de Google para producción (lanzamiento completo) junto con **8 capturas
    nuevas** de la ficha (diseño teal; `scripts/store-demo/enmarcar-capturas.py` ya usa el teal y titulares
    nuevos; `generar-fixtures.py` con la checada demo a las 10:05). Capturas tomadas en el emulador `nexara_phone`
    con la sesión de `play.review` (la inició Adam) + `files/store_demo/serve` + `checador` + un fixture extra
    `me__activities.json` empujado por adb (no está en el generador: Inicio y Mis actividades salían vacíos).
    OJO emulador: estaba en **UTC** (horas desfasadas 6 h) → `adb shell cmd alarm set-timezone America/Mexico_City`.
    Al terminar se borró `files/store_demo`.
  - **iOS 1.0 con build 1.0.0 (9)** (TestFlight por `ios-testflight.yml`, también en el grupo «Equipo NEXARA»):
    se quitó el 8 de revisión, se puso el 9 y **10 capturas nuevas** (las de `ios-screenshots.yml` modo tienda,
    `docs/store/ios-screenshots/`) en «iPhone con Dynamic Island (pantalla grande)» del Gestor de recursos
    multimedia (ASC nuevo: el «obligatorio» es la pantalla mediana pero se escala de la grande). «Pendiente de
    revisión» desde 18:07. Publicación manual tras aprobar (así estaba).
  - **Control de nómina semanal** (pedido de Adam con sus dos Excel): especificación en `.ai/CONTROL-NOMINA-SPEC.md`.
    **06-10:** hecho. API `employee-payments/control-semanal` (GET, `export.xlsx`, PATCH `dia`/`fila`, descuentos,
    `cerrar`, `reabrir`) con la lógica pura en `control-nomina.ts`, servicio, Excel de 2 hojas idéntico a sus formatos
    + «Cómo se calcula» (`control-nomina-excel.ts`), migración aditiva `20261005120000_control_nomina_semanal`
    (4 tablas `nomina_*`), y el hueco de `preview-period`/`prenomina/batch` sin política de módulo cerrado. Web:
    pestaña «Control semanal» en Pagos a empleados (`components/finance/ControlNominaSemanal.tsx`,
    `lib/control-nomina*.ts`). Jest employee-payments 144 verde, vitest 39 verde, tsc API/web 0. Las sugerencias
    de descuento por falta (id `sugerido-AAAA-MM-DD`) no se «descartan» (no existen en el servidor): solo se aceptan.

- **05-10 ~15:10 (cursor) — Pizarra: «Libre» dura 15 min y luego «Sin nada asignado».** Pedido de Adam con
  captura de core.nexara.com.mx/erp/pizarra (Luis Joel «Libre · Terminó 12:00» a las 14:40). En
  `apps/api/src/me/team-board.service.ts` (`LIBRE_TRAS_TERMINAR_MS = 15 min`): si lo último que terminó fue hace
  más de 15 min y no tiene nada abierto, el estado queda `sin_actividad` sin `lastFinished`/`idleSinceAt` (web,
  Android e iOS solo pintan el estado del servidor, no se tocaron). Pruebas en `team-board-tarjetas.spec.ts`
  (10 min → libre, 30 min → sin nada asignado). Desplegado. **No toqué** los cambios sin commitear de iOS
  (`TicketsRepository.swift`, `PortalComponents.swift`): son del turno de Claude. Ojo Claude: el
  `pull --autostash` de mi push los guardó en `stash@{0}` (autostash) mientras editabas `PortalComponents.swift`;
  los devolví al disco con merge a 3 vías (stash + tu edición de 14:47, sin conflictos). El stash sigue ahí de
  respaldo; bórralo tú cuando confirmes que el disco está bien.

- **05-10 ~14:45 (claude-code) — cierre de la paridad iOS ← Android sobre lo de Cursor (sin pisar nada).**
  Revisadas las 36 capturas de `9a8e5b41`. Arreglado (`e3c391cd`, iOS): **la hora y la batería salían en NEGRO
  sobre la barra teal en todas las pantallas** (mismo efecto del rechazo 2.3.10) → estilo global
  (`UIViewControllerBasedStatusBarAppearance = NO`) que decide `NxStatusBar.textoBlanco` desde el shell (Inicio sin
  cubierta = negro, resto = blanco) y la raíz (login/bienvenida negro, portal blanco) — **verificar en las
  capturas de CI que la hora salga blanca**; doble flecha en Notificaciones; «Solic…» en Vehículos; columna de
  hora de «Después, hoy» a 58 (iOS y Android); demo: KPIs escalados al rango (3 retardos en 1 día) y horas de
  plan/asignación dentro de 10–18 (`DemoStore.atEnJornada`). Android: «Cotizacion_monto» → «Cotización» en
  Aprobaciones (+ prueba) y fecha de devolución de Herramientas un día antes en el escáner (fecha sin hora leída
  como UTC). En curso con agentes: pantallas viejas del portal iOS y `AlmacenEscaneo`. El AAB 1.0.6 (16) de Cursor
  NO trae estos arreglos de Android: se regenera.
  **~15:20:** hora blanca VERIFICADA en las capturas (teal = 255,255,255; Inicio negro). Portal iOS a paridad
  (`5a4f9250`), escáner de Almacén iOS (`8f5ed4d8`), cubiertas sin el «volver» del sistema. El build de iOS falló
  por `ApiClient.swift:162` (acceso solapado a `comps`) → arreglado. Android: 10 errores del portal (el grave:
  «Sincronizar inventario» borraba todos los equipos al mandarlos sin `equipmentName`; ahora no manda `items`),
  `PortalRules.kt` + 20 pruebas. **OJO stash:** `stash@{0}` «autostash» lo dejó un `pull --autostash` de Cursor
  (14:47) con una copia VIEJA del portal iOS: NO hacer `pop`. **Pendiente de decidir:** «Sincronizar» en un
  inventario que viene de un servicio crea otro vacío (API `syncManualSnapshot` solo busca los manuales; igual en
  web/iOS/Android). Adam autorizó publicar las dos apps (iOS build 9 a revisión reemplazando el 8; Android
  1.0.6 (16) a producción) cuando CI esté verde.

- **05-10 ~14:35 (cursor) — Paridad iOS ← Android terminada (fase B) y avisos de Android.** Pedido de Adam:
  «la iOS tiene muchos errores y le falta paridad en UI y colores; las notificaciones de Android son pobres
  (feas, a destiempo, sin información, no suenan)».
  - **iOS (`9a8e5b41`, CI «iOS · compilar» VERDE a la primera, capturas en `docs/ios-paridad/iphone-69/`):** se
    terminó el trabajo a medias de la fase B de Claude con 7 agentes por área (Inicio/Actividades, detalle,
    Asistencias/Chat, Perfil/Clientes/Avisos/Login, Viáticos/Vehículos/Almacén/Proyectos/KPIs/Portal,
    Herramientas, y Cotizaciones/Pagos/Gastos/Aprobaciones nuevas en el hub «Más»). `UIDesignRequiresCompatibility`
    en Info.plist (barras planas). Demo sin «8:22 h» sin checada. **Falta:** pantallas viejas del portal en
    `PortalScreens.swift` (Perfil, Sucursales, Solicitudes, Tickets, Calificación, Inventarios) siguen con Form/List;
    `AlmacenEscaneo` sin portar; en Inicio las etiquetas bajo la hora salen cortadas («Esta sem…»). Build 9 de iOS
    no se ha mandado (TestFlight lo dispara Adam). Geocerca: se dejó 500 m (API y Android), no 100 m.
  - **API (`f2839e3f`, DESPLEGADO):** «X está vencida» (SLA_BREACH) salía cada 2 h, 24/7, a gerencia y Claudia
    (679 y 677 en 14 días). Ahora lunes–sábado 9–19 h, dedupe 20 h, collapseKey estable.
  - **Android (`6f949759`, AAB 1.0.6 (16) listo en `app/build/outputs/bundle/release/app-release.aab`, SIN subir
    a Play):** botones «Responder»/«Marcar como leído» (chat) y «Marcar como leída» (eventos) vía
    `push/NotificationActionReceiver.kt`; aviso en Inicio (`NotificationHealthBanner`) si avisos apagados, canal
    silenciado o batería restringida, con botón a Ajustes; acento y splash teal (#1F9E84, antes azul).
  - CI: errores de xcodebuild salen como anotaciones; `.ai/ci-anotaciones.ps1 <sha>` los lee sin `gh`.

- **05-10 ~11:35 (cursor) — Excel con texto encimado. DESPLEGADO (`abda19d4`).** Adam mandó capturas: «En
  palabras» y las notas de «Información» se encimaban sobre las filas de abajo. Causa general en
  `common/excel/reporte-excel.ts` (todos los reportes): filas con alto fijo 17 aunque el texto se ajuste, y Excel
  no recalcula el alto de una fila con alto fijo. Ahora `lineasDeTexto`/`altoParaLineas` calculan el alto del
  encabezado, de las filas con columnas que envuelven y de cada renglón de «Información». «En palabras» ya no
  repite el día (está en su columna) y va en una línea (ancho 56). Sin LibreOffice local: no se vio el Excel como
  imagen; pruebas de alto en `pre-nomina-dias.spec.ts`.

- **05-10 ~11:25 (cursor) — Excel día por día más específico. DESPLEGADO (`8343ac06`).** Adam: «que diga lunes
  tantas horas y productivas tantas». `pre-nomina-dias.ts`: día completo («Lunes 05/10»); «Horas por día» con
  dos columnas por fecha (Trabajadas / Productivas, ancho 16 para que el encabezado quepa en 2 líneas) más
  totales y productividad; «Detalle diario» con columna «En palabras» («Lunes 05/10: 8 h 10 min trabajadas,
  5 h 20 min productivas (65 %)»). Jest employee-payments 57 verde.

- **05-10 ~11:15 (cursor) — «Atrasada» recién asignada e iniciada. DESPLEGADO (`fbb9bf89`).** AN-0074 (tarea,
  En Proceso): el formulario manda `fechaInicio = fechaMaxima = fechaEntregaEsperada` (10:20) y
  `semaforo-actividad.ts` tomaba esa hora como tope → roja al minuto y aviso de atraso a las 10:25. Ahora `topeDe`:
  un tope que no es posterior al inicio = fin de ese día (como un periodo de 1 día); sin iniciar pasada la hora
  sigue roja por «inicio», y pasar el plan sigue rojo. Cubre pizarra, tarjeta de persona, listados y avisos.
  **Pendiente:** conteos crudos `fechaMaxima/fechaEntregaEsperada < now` en executive, ceo-brief, analytics,
  ai-triage y activity-feed siguen contando como vencidas las de hora citada; el formulario no tiene campo de
  límite real (si Adam quiere uno, es un campo nuevo «Termina a las»).

- **05-10 ~10:50 (cursor) — Excel de pre-nómina día por día. DESPLEGADO (`3e71923f`).** Pedido de Adam: elegir
  semana/mes/día y ver cuánto trabajó cada quien cada día. El Excel ya seguía el selector; lo confuso era que
  «Semana» = lunes→hoy (un lunes solo trae hoy). Hecho: presets **Semana pasada** (lun–dom anterior) y **Mes
  pasado** (`RangoPreset` + `PRESETS_NOMINA` en `PizarraKpi.tsx`, solo en KPIs del equipo y su detalle; la
  pizarra conserva los 4 de siempre); el botón dice «Excel · 28 sep – 4 oct». El Excel suma dos hojas
  (`employee-payments/pre-nomina-dias.ts`): **Horas por día** (matriz persona × fecha, total y días trabajados)
  y **Detalle diario** (entrada, salida, estado, comida, laboradas, productivas, inactivas, productividad,
  retardo, extra calculado/aprobado, decisión y nota). `getEquipo(..., { conDias })` devuelve `dias` sin tramos.
  API `tsc` 0 + jest employee-payments/me 254 verde; web `tsc` 0 + vitest verde (6 fallas al correr todo junto
  eran carga: cotizaciones/chat/vehículos pasan solos). **NO toqué el iOS a medias de Claude (nota de abajo)**: no
  corrí `salvar`/`cerrar` para no commitearlo; commits solo con mis archivos.

- **05-10 ~09:50 (claude-code) — [RESUELTO por cursor 14:35: fase B terminada y commiteada, CI verde] SE CORTÓ POR LÍMITE DE USO A MITAD DE LA FASE B.**
  Hecho y empujado: fallas de Christian (`4224cac7`), Android sin Ejecutivo/Documentos (`0cd5a4b6`), capturas de
  paridad en CI (`ed7f3921`), jornada 10:00–18:00 en API/web **desplegada y verificada** en Hetzner
  (`02cc7abf`; `expectedStartHm`=10:00, `expectedEndHm`=18:00 en vivo), fase A iOS (`ed9f7a61`, CI verde,
  capturas en `docs/ios-paridad/iphone-69/`).
  **Sin commitear en disco (~79 archivos iOS):** trabajo A MEDIAS de los 10 agentes de la fase B (B1 Inicio/
  Actividades, B2 detalle, B3 Asistencias/Comidas, B4 Chat, B5 Perfil/Clientes/Avisos/Login, B6 Viáticos/
  Vehículos/Almacén/Proyectos/KPIs, B7 Cotizaciones/Pagos nuevos, B8 Gastos/Aprobaciones nuevos, B9 Herramientas,
  B10 Portal). Excepción: `UI/Core/TeamEvidenceView.swift` (evidencias del equipo) SÍ quedó terminado por un
  subagente de B2 (estático limpio, sin compilar). El resto se detuvo en mitad de una edición: **seguramente NO compila**. No es de Cursor ni de otro
  turno: es de este. Antes de seguir: `python scripts/ios-static-check.py`, revisar `git diff` por área y
  terminar cada una contra Android con las reglas de `.ai/FASE-B-REGLAS-IOS.md` (alcance por agente: ver el
  encargo de cada área en ese archivo + el inventario Android/iOS de esta sesión). No commitear hasta que CI
  (`ci.yml`, trabajo «iOS · compilar») pase; `docs/ios-paridad/` se regenera en cada push.
  **Pendientes vistos en las capturas tras la fase A:** (1) iOS 26 pinta los botones de la barra teal como
  burbujas de cristal → añadir `UIDesignRequiresCompatibility = YES` en `Resources/Info.plist` para el aspecto
  plano de Android; (2) demo: «Sin entrada registrada» con «8:22 h trabajadas» y cronómetro 8:22:00 sin checada
  (sospecha: `historicPunches` en `Demo/DemoFixtures+Attendance.swift` no excluye hoy) y «PRODUCTIVIDAD DEL DÍA
  27:29:28» (no existe en Android: quitar); (3) Notificaciones/Clientes con la barra apretada. Build 8 sigue en
  revisión de Apple sin nada de esto; decidir con Adam si se manda un 9. El emulador `nexara_phone` tiene el
  debug actual instalado esperando que Adam inicie sesión (para capturas de referencia Android).

- **05-10 (claude-code) — PARIDAD TOTAL iOS ← Android (pedido de Adam: «la app iOS no se parece en nada»).**
  Android es la referencia en funciones y en UI/UX. Hecho: Android ya no tiene **Ejecutivo** ni **Documentos**
  (eran los dos únicos módulos de «Más» que solo abrían la web; se borraron la ficha «ábrelo en la web», la
  etiqueta «En la web» y la ruta `console/more/{key}`). En curso (iOS, por fases): A) sistema de diseño con los
  tokens exactos de Android, barra inferior propia igual a la de Android, barra superior teal y hub «Más»;
  B) cada pantalla a paridad + pantallas nativas que iOS no tiene (Cotizaciones, Aprobaciones, Gastos, Pagos a
  empleados, Herramientas completo). Mientras no existan, esos módulos no salen en iOS; ninguno abre la web.
  Referencia visual: emulador `nexara_phone` con el debug actual (`-PSCREENSHOT_API=true`) + modo `store_demo`
  (`files/store_demo/serve`); hace falta que Adam inicie sesión (no tecleamos contraseñas).
  **Fase A hecha (base iOS = Android):** `NxColors` con los valores exactos de Android (fijos, sin oscuro),
  `NxType`, componentes nuevos en `UI/Enterprise/NxParityComponents.swift` (NxPanelShell, NxListRow,
  NxMetricStrip, NxFilterBar/Pill, NxSegmented, NxSearchField, NxUnderlineTabs, NxFab, NxAvatar, More*…),
  barra inferior propia `NxBottomBar` sobre el `TabView` con la barra nativa oculta y barra superior teal
  `.nxBrandNavBar(title:showsBell:)` en `UI/Enterprise/NxNavigationChrome.swift`; hub «Más» como Android, sin
  Ejecutivo ni Documentos ni nada «En la web». Cotizaciones/Aprobaciones/Gastos/Pagos no salen en el hub hasta
  tener pantalla (fase B). Reglas para pantallas: cada una aplica `.nxBrandNavBar()` a lo que apila,
  `.nxListBackground()` en `List`/`Form`, y no poner `.tint` de marca en la raíz (AccentColor oscuro = blanco).
  **Capturas de paridad sin Mac:** `ios-screenshots.yml` ahora también corre en cada push a `main` que toque
  `apps/mobile-native/ios/**`: `ParityScreenshotsUITests` recorre todas las pantallas en modo demo y el bot deja
  los PNG en `docs/ios-paridad/iphone-69/` (commit `[skip ci]`; hacer `git pull --rebase` antes de empujar).
  **Horario (Adam, 05-10):** jornada normal 10:00–18:00 para todos (hay quien entra antes o sale después),
  comida 15:00–16:00 (ya estaba así en `lunch-breaks.service.ts`), 15 min de gracia, jornada ordinaria 8 h netas
  (lo que dice la web). El API pasó oficina (09:00) y contratista (08:00) a `JORNADA_ENTRADA_HM = '10:00'` y
  añadió `expectedEndHm` → `'18:00'` (`attendance-hybrid.match.ts`); `horarioDePlantilla` ya trae salida; textos
  «Oficina · 10:00 a 18:00» en KPIs/nómina y en la ayuda de horarios de la web. Specs del API (468) y de la web
  al día. El demo de iOS pasó de 8:00–17:30 a 10:00–18:00. **Regla de Adam: las dudas de negocio se
  resuelven leyendo la web o Android, no preguntándole.**

- **05-10 (claude-code) — tres fallas del build 1.0.0 (8) con la cuenta de Christian, arregladas en código
  (NO hay build nuevo todavía):**
  1. **Faltaban Chat y Asistencia en iOS.** Para dirección (CEO, dir_admin) `me/navigation` manda comodines
     (`/erp/**`) y la clave `attendance`, no `chat` ni `asistencias`; iOS filtraba las pestañas por claves.
     Ahora guarda las rutas (`SessionUser.navPaths`, sin las de `/api`) y decide por ruta como Android
     (`CoreNavigation.routeAllows`/`ruleMatches`, espejo de `CoreMenu.ruleMatches`); super admin ve todo
     (Clientes sigue dependiendo del sector). Las sesiones abiertas piden `me/navigation` otra vez si les
     faltan las rutas (no en modo demo, para que la revisión de Apple se comporte igual que antes).
     Afecta también a `play.review@nexara.com.mx` (rol CEO), así que el revisor tampoco veía esas pestañas.
  2. **Inicio daba error y quedaba vacío:** el API niega «Mis actividades» a dirección general (403,
     `isCeoEquivalentEmail` = gerencia@ y claudia.bernal@). Inicio ya no la pide para esas cuentas y muestra
     «Tu equipo hoy» con un botón a la pizarra. Igual en iOS (fuera del modo demo, donde la persona ficticia
     sí tiene cola) y en Android (que tenía el mismo 403). Que no salga la tarjeta de checar entrada es
     correcto: CEO = asistencia en modo `manage`, no se registra a sí mismo, en las dos plataformas.
  3. **El tema seguía el modo oscuro del iPhone:** Android es siempre claro; `Info.plist` fija
     `UIUserInterfaceStyle = Light`.
  Verificado en local: `scripts/ios-static-check.py` limpio, Android `compileDebugKotlin` + `testDebugUnitTest`
  en verde. La compilación real de iOS la hace el trabajo `ios` de `ci.yml` al empujar. **Pendiente de Adam:**
  decidir si se retira el 8 de revisión y se manda un build 9 (`ios-testflight.yml` desde su Chrome) o se
  espera el veredicto del 8 y el 9 va como actualización.

- **04-10 21:50 (claude-code) — push de iOS:** todo listo salvo subir la llave a Firebase. App ID con Push
  activado; build 1.0.0 (8) firmado con `aps-environment = production`; Firebase FCM v1 habilitado. Se
  registró la llave APNs «NEXARA APNs» (Key ID `3U672539N2`, Sandbox & Production, Team Scoped). **Adam ya
  subió el `.p8` en Firebase → Cloud Messaging → NEXARA iOS, en desarrollo y producción (verificado
  21:56).** Push de iOS completo, sin build nuevo ni reenvío. **Probado en iPhone real a las 22:15:**
  Adam instaló el build 8 por TestFlight (grupo interno «Equipo NEXARA», tester `ad.pozo.ont@icloud.com`),
  entró con la cuenta de Christian y recibió el push de prueba (`UserPushEndpoint` id 372). Android ya funciona
  (FCM puro, nada que configurar en Google Play). En TestFlight los builds 1, 3, 5, 6 y 7 aparecieron
  caducados el 04-10; el 8 (en revisión) sigue vigente.

- **04-10 (claude-code): NEXARA iOS 1.0 REENVIADA a revisión — build 1.0.0 (8), «Pendiente de revisión»
  desde las 18:32.** Apple había rechazado la 1.0 (6) solo por 2.3.10 («remove non-iOS status bar
  images», revisada en iPad Air 11"): las capturas SÍ eran del simulador de iOS, pero `DemoBanner` pintaba
  su azul detrás de la barra de estado (`53202c98`, ahora va como pastilla debajo). Además:
  `256e6ff1` `ConsoleHelpers.mapStr` devolvía «<null>» para los `null` de JSON (pastillas «<null>» en el
  chat, también con el servidor real); Inicio ya no corta la prioridad; capturas con hora de México y
  batería normal. Capturas regeneradas en GitHub (`ios-screenshots.yml`, iPhone 17 Pro Max, commit
  `3724a510`) y subidas a ASC 6,9" en orden (Inicio, Actividades, Asistencia, chat ×2, Más, Clientes,
  Notificaciones, Mi perfil); 6,5" usa 6,9". Descripción y notas al revisor sin «organigrama» (ya no está
  en las apps), con la navegación nueva y rutas «Más > Mi perfil > …». Builds 7 y 8 subidos por
  `ios-testflight.yml` (el 8 es el enviado). **Si Apple vuelve a escribir: leer el mensaje en
  Revisión de apps.**

- **03-10 ~10:00 (claude-code):** `50e9b8cc` («Recordarme») **desplegado y verificado** (API/web sanas).
  **Chat purgado en producción a pedido de Adam** («como si nunca hubiéramos mandado ningún mensaje»):
  borrados 63 mensajes (y sus 312 lecturas), 157 notificaciones del chat (`category='chat'` o
  `entityType='chat_message'`) y 16 conversaciones directas (se vuelven a crear solas al escribir);
  los 6 canales restantes (#general, #anuncios, #operaciones, «Actividades» y 2 de la empresa 2) quedan
  sin último mensaje ni marcas de leído. Adjuntos de `uploads/chat` (5) movidos al respaldo.
  **Respaldo verificado fila por fila** en el servidor: `/root/respaldos/chat-purga-20261003/`
  (`chat-tablas.sql` data-only —restaurar con `--disable-triggers` por la FK circular de hilos—,
  `notificaciones-chat.csv`, `uploads-chat/`). Ojo al scriptar por SSH: `docker exec -i … psql` dentro
  de `bash -s <<EOF` se come el resto del script por stdin (usar `</dev/null`).

- **03-10 09:45 (claude-code):** el deploy del rediseño (`c85edb8b`) **sí quedó en producción** (web y API
  reiniciadas, mapa de cobertura nuevo responde 200). Después:
  - **«Recordarme» no duraba**: el login sí pedía y recibía la sesión de 30 días, pero al recargar,
    `syncProfile` (`UserContext.tsx`) rehacía al usuario con `auth/profile`, que no trae `remember` ni
    `expiresAt`; la sesión quedaba como no recordada y `safePersistUser` borraba la copia de
    localStorage (y bajaba `nx_session` a 1 día). Ahora conserva ambos de la sesión guardada. Prueba
    `UserContext.remember.spec.tsx` (falla con el código anterior). Quien entró antes del arreglo debe
    volver a entrar con la casilla marcada.
  - **Organigrama**: Mónica García (id 5) no tenía jefe (`managerId` NULL → «Sin jefe», línea punteada).
    En producción `managerId = 1` (Christian), igual que Daniela. Cambio solo de datos.

- **Turno 03-10 (mañana, claude-code — rediseño v2, en paralelo con la sesión de dependencias):**
  **Etapas 5 y 6 terminadas** (commits locales; push y deploy al cierre de este turno):
  - `ba6b4cf9` primer tramo (préstamos/kits de herramientas, reabasto, recolección, recorrido, prioridad).
  - `8fdb7059` **apps** Android+iOS: teal `#1F9E84`, pestaña Inicio, barra inferior de 5 destinos,
    dock de acción en el detalle (Iniciar/Reanudar/Pausar). Android 699 pruebas en verde. **iOS sin
    compilar** (Windows): verificar en Xcode aislamiento de hilo principal, `#Preview`, dock sobre listas,
    diálogo de pausa, insignias y capturas. Falta build/release de tiendas. (Este commit se llevó por
    índice compartido dos borrados de maplibre de la otra sesión; el estado final es el correcto.)
  - `ff2f138e` Asistencias · `3b9aa281` pizarra/ficha/flujo/Mis actividades · `b5b97f4c` Almacén y
    Herramientas (+ API: existencias traen foto/categoría/precio; valor del inventario con `unitCost`,
    antes salía $0) · `ce1cea7c` Cotizaciones · `42219482` **fix base**: `Field` remontaba el input al
    aparecer/irse un error (se perdía el foco) · `b7eb4512` Clientes y Proyectos · `3283ec98` detalle,
    evidencias y alta de actividad.
  - Resultado: `style={{` y `<button>` crudos casi en cero en los módulos migrados (quedan los de valores
    calculados). Quedan 94 `style={{` en 6 componentes de `components/ops` que **ninguna página importa**
    (`ActivityEvidenceReviewPanel`, `EvidenceReviewQueue`, `OpsActivitiesBoard`, `OpsTicketRequestQueue`,
    `OpsProjectDetailShell`; `OpsActivitiesImport` sí tiene 1 uso): candidatos a borrar.
  - Pruebas al cierre (con los cambios de dependencias incluidos): API 272 suites / 3,366, web 111 / 957,
    `tsc` API y web 0, Android compile + unit tests verde.
  - **No visto en navegador** (no hay sesión local): Adam debe recorrer Actividades, Cotizaciones, Almacén,
    Asistencias, Clientes y Proyectos en claro/oscuro y en el celular.
  - `.ai/audit/` (reporte de `ollama_audit`) queda **sin commitear a propósito**: puede llevar fragmentos
    de llaves.

- **Turno 03-10 (mañana, claude-code — dependencias, en paralelo con el agente del rediseño v2):**
  commits **locales, sin push ni deploy** (debajo hay commits del rediseño que su agente aún no sube):
  - `5f51ac19` parches de runtime: protobufjs 7.6.6, websocket-driver 0.7.5, tar 7 (vía override de
    `@mapbox/node-pre-gyp` 2), multer 2.4.0 en todo el árbol, axios 1.20, engine.io/socket.io-parser/ws,
    path-to-regexp, form-data, grpc-js, busboy, basic-ftp 5.3.1, lodash 4.18 bajo swagger. Borrado
    `apps/api/pnpm-lock.yaml` (ningún build lo usa).
  - `b35be85e` maplibre-gl 6.11.2: ESM, sin variante CSP; worker módulo en `public/maplibre/`
    (`maplibre-worker.spec.ts` vigila que sea copia exacta del paquete). Verificado en Chrome headless
    contra `next start`: idéntico a producción, tema claro OK.
  - `fd351cee` mapa de cobertura de Adam en versión clara/oscura (`CoverageMap`, webp 1200/1600/2000).
    Solo se ve en Inicio: el middleware manda `/cobertura` → `/proyectos`, que no tiene mapa.
  - `017cf330` nodemailer 10.0.13 (+ prueba de envío con las dos formas de importar); sale `@types/nodemailer`.
  - **Next 14 → 15: solo plan** en `.ai/PLAN-NEXT15.md` (≈10–14 h, recomendado 15.5.x). Espera a Adam.
  - trivy: 353 → 113 hallazgos; CRITICAL 8 → 3 (2 de `next`, sin exposición hoy; 1 es la llave de Stripe
    en `deploy/.env.nexara`, archivo local ignorado por git). HIGH 181 → 46.
  - **Trampa de npm 11:** no aplica `overrides` nuevos a dependencias de un workspace si ya hay lock. Truco:
    agregar el paquete padre a `dependencies` de la raíz, `npm install`, quitarlo, `npm install`.
    `npm ls` las marca «invalid»; el install (también el de Docker) respeta el lock.
  - **Índice compartido:** `git rm` deja el borrado preparado y el siguiente `git commit` de otro agente se
    lo lleva (pasó en `8fdb7059`). Con varios agentes, commitear con rutas explícitas (`git commit -- rutas`).
- **Último turno (antes de este):** claude-code
- **Fecha:** 2026-10-02 (noche)
- **Revisé el turno de Cursor:** reglas respetadas (solo `main`, trailer, árbol limpio, RELEVO al día,
  `tsc` 0, producción en el commit declarado). Única desviación: eligió la dirección A del chat sin
  esperar a Adam; Adam ya lo vio y siguió, se queda. En el servidor quedó un cambio sin commitear de
  Cursor en `deploy/docker/Dockerfile.web` (CACHEBUST fijo) y archivos sueltos (`" 2"`, `*.bak-recordarme-*`):
  **no los toqué**.
- **Hecho (este turno, desplegado sin migraciones):** los 8 hallazgos de seguridad que quedaron abiertos
  del paquete de 6 agentes:
  - `7ca4ff7a` fotos de evidencia por campos: subir/quitar exige asignado vigente, responsable o
    EVIDENCES_REVIEW; la congelación la decide la evidencia de **quien subió** la foto. Pausar acota el
    padrón a la empresa; `tenant()` de sesiones falla cerrado; abrir/terminar reciben companyId; el cron
    de alertas lee sesiones por empresa.
  - `c5b457e2` códigos de barras: actividad ligada a un movimiento debe ser del tenant; DTOs reales con
    class-validator; el inventario/escáner de herramientas **ya no escribe en GET** — los códigos
    pendientes se completan con `POST tool-requests/inventory/codigos/completar` (TOOLS_MANAGE). En
    producción hay 3 herramientas y 1 sin código.
  - `acd5ff8e` clientes/proyectos: reutilizar un cliente por nombre en el alta rápida exige poder abrir
    su ficha (si no, 403 «Ya existe un cliente con ese nombre… pide a coordinación…»); sumar tipos o
    rellenar datos exige gestionar el padrón. Proyectos: alta rápida exige ver al cliente y, si no es
    PROYECTO, las reglas de `addClientSector`. Regla única en `ventas/client-access.ts`. Con los roles
    reales solo puede frenar a José Antonio (`enc_soporte`) con un prospecto comercial ajeno.
  - `fdbca24a` **Etapa 4 del rediseño**: `ModulePage`, `FormPage`, `RecordPage` en `components/base`,
    `DataTable` con `rowActions`, selección y celdas `PersonCell/ProgressCell/StatusCell/WhenCell`
    (API previa intacta). Aún no las usa ninguna página.
  - Pruebas: API 271 suites / 3,364 (la única falla en corrida completa es el tope de 5 s de
    `propuesta-vista-previa.spec.ts`; sola pasa 8/8); web 107 / 941; `tsc` API y web 0.
- **EN CURSO (sin commitear, agentes):** Etapa 5 por módulo en web (pizarra/mis actividades; detalle y
  alta de actividad; cotizaciones; almacén+herramientas; asistencias; clientes+proyectos) y Etapa 6 en
  apps (Android a medias por un agente que se cortó; iOS sin empezar). Si entras y ves esos archivos
  sucios, son de esos agentes: `relevo.ps1 salvar` y no los reescribas.
- **Turno anterior (cursor) — Hecho y DESPLEGADO (HEAD `00babcee`, migración `20261003010000_guardias` aplicada):**
  - `f3d33c8c` **Sugerencia de nómina** (pestaña en Pagos a empleados, `GET employee-payments/sugerencia-nomina`,
    solo lectura). Divisor = horario de cada persona (40 h oficina; 48 h sin horario fijo): **Adam lo aprobó así**.
  - `93f6d593` **Guardias de fin de semana**: sáb/dom solo checa entrada quien tiene guardia (422 +
    rechazo `FIN_DE_SEMANA_SIN_GUARDIA`, sin avisar jefes); con guardia sin geocerca de oficina; entrada
    automática al subir foto de inicio de servicio/tarea (`attendance/entrada-guardia.ts`); botón
    «Guardias» en Asistencias; aviso en el formulario de actividad. Regla absoluta (aunque el horario
    tenga sábado); un encargado no se programa a sí mismo; apps no tienen pantalla de guardias aún.
  - `b89ae264` **Chat estilo Slack (Dirección A, Etapa 1)** + tarjetas de folio (actividad/cotización).
    Arreglé yo un hueco: pastilla interna `[x](//otro.com)` o `/\otro.com` ya no genera enlace (prueba en
    `rich-text.spec.tsx`). Etapa 2 pendiente: hilos, Menciones, Guardados, Archivos; API debería mandar
    quién fijó y el puesto del autor.
  - `79cf420a` **Apps**: pausar/reanudar (técnico y jefe desde Pizarra), escáner con cámara en Almacén y
    Herramientas (Android CameraX+ML Kit; iOS AVFoundation), mensaje correcto del rechazo de fin de semana.
    Android 677 tests verde. **iOS sin compilar** (Windows). **Falta build/release de tiendas.**
  - **Rediseño UI aprobado por Adam** (maquetas en `.ai/ui-maquetas/png/`, plan en `.ai/ui-maquetas/PLAN.md`,
    sidebar CLARO): `2ba59eef` Etapas 1-2 (tokens v2 en `ui-tokens.scss`, `components/base` unificado:
    Button 7 variantes, Stat con icono/tendencia/semáforo, StatusBadge con `estado-tono.ts`, campos con
    error/válido, FormSection/FormFooter, Alert, Toast; `components/ui/*` ahora envoltorios del base con
    la misma API). `00babcee` Etapa 3 (sidebar 264/68 px, grupos Hoy · Clientes y obra · Recursos ·
    Finanzas · Mi cuenta, iconos SVG, contadores de chat y aprobaciones, `sidebar-presentation.ts`).
  - Verificación final: API jest 270 suites / 3319; web vitest 103 / 913; `tsc` API y web 0.
- **SIGUIENTE (rediseño):** Etapa 4 plantillas (`ModulePage`/`FormPage`/`RecordPage`, `DataTable` con
  acciones por fila y selección) y Etapa 5 módulos: Actividades/pizarra → detalle → alta → Cotizaciones →
  Almacén → Clientes/Proyectos → Asistencias → Finanzas. Etapa 6 apps nativas (teal `#1F9E84`, pestaña
  Inicio, barra inferior M3, dock de acción). Etapa 7 regla ESLint. Sin contador en Actividades/Viáticos
  ni franja «En jornada» en el sidebar: no hay endpoint verificado.
- **Hecho antes (paquete grande de 6 agentes: commiteado y DESPLEGADO, `101192ad`, con migraciones):**
  `20261002130000_activity_work_sessions`, `20261002140000_clientes_varios_tipos` y
  `20261002150000_producto_codigo_barras` aplicadas en producción (`_prisma_migrations`, sin rollback);
  API sana. Antes: `tsc` API y web 0; jest API completo en verde (las fallas al correr todo junto eran
  lentitud: las suites de cotizaciones pasan solas); vitest web en verde; Android
  `:app:testDebugUnitTest` en verde. iOS no se compila en Windows: revisado a mano. Revisión de
  seguridad de endpoints nuevos sin hallazgos (cada uno con RBAC; pausar a otro valida alcance; UPC
  codifica el código hacia proveedor fijo). El `prisma:error` de `WorkflowSeedService` al arrancar es
  la semilla de siempre (nombre duplicado), no es de esto.
  - **Organigrama:** el agente murió con 5 pruebas rojas; las 5 eran de las pruebas, no del dibujo
    (plantilla «de 17» que sumaba 20, `getByTitle` no alcanza `<title>` dentro de `<path>`, jsdom sin
    `PointerEvent`, nivel esperado mal contado). 35/35. **No lo vi en navegador**: pedir a Adam que
    abra `/erp/organigrama`.
  - **iOS:** `CoreModels.swift` (`CoreEvidence.label(_:coreKind:)`) se había quedado fuera del commit
    de actividades y los archivos ya commiteados lo usan: sin `1931efd1` iOS no compilaba.
  - **Perfiles desactivados:** el botón Activar/Desactivar de Perfiles (`06c5db82`) ya estaba en
    producción. Nuevo (`bce4d424`): la API ya no deja asignar a un inactivo (antes solo lo escondía el
    selector; dirección/mismo departamento pasaban): `ActivitiesService.assertResponsableActivo` en
    create/update (cubre formulario, proyectos y programación), kit de herramientas y OT de
    mantenimiento. Reuniones, proyectos y equipo de actividad ya lo validaban.
  - **Pendiente de Adam:** pie del membrete del PDF de cotización (imagen) trae «Malltertaiment,
    Explanada Puebla…» y «(22) 01 79 18 71»; si ya no van, que diga cuáles y se edita la imagen.
    Las apps nativas (sin organigrama, comercial, geocerca 500 m) necesitan su propio build/release.
- **Hecho (organigrama, 21:20):** Adam lo aprobó en producción y pidió una «rayita» secundaria de Luis
  a José Antonio. `d47732f9`: un lateral conserva su línea de mando y suma el puente punteado (cuando
  el jefe queda un anillo adentro). Desplegado; en BD `User.id=7` (Luis) `lateralDeId=39` (Antonio).
- **Del pedido grande de las 12:50 solo falta:** build/release de las apps en tiendas (y compilar iOS en
  macOS + probar cámara en dispositivos reales). Guardias, nómina, chat y apps ya están (ver arriba).
- **Contexto del paquete (02-10, ~13:25), por área:**
  1. **Cotizaciones — TERMINADO por su agente, falta mi revisión:** el PDF ya toma `depositPercent`/`note`
     del editor (antes `paymentTerms`→`PAGO_DEFAULT`, por eso el 50 % no se quitaba); datos fiscales del
     emisor (`EMISOR`) arriba del título en la hoja 1; `GET cotizaciones/partidas-frecuentes` + «Usadas
     antes» en `FilaNueva` (margen vacío). 412 tests de `src/cotizaciones` en verde según el agente.
     Muestra: `scratchpad/cotizacion-encabezado.png` — **mirarla antes de publicar**. Ojo: el pie del
     membrete trae otra dirección/teléfono que los datos fiscales.
  2. **Actividades (en curso):** comercial para Paulina (`finanzas@nexara.com.mx`) en web/Android/iOS;
     «Inicio/Conclusión de actividad» en comercial; geocerca 500 m por tipo (servicio, proyecto, obra y
     tarea salvo recolección/entrega/compra; nunca comercial); auditoría de que la evidencia no se pierda.
  3. **Sesiones de tiempo (en curso, dueño del esquema):** tabla `activity_work_sessions` (migración
     `20261002130000_activity_work_sessions`), tope 12 h, cierre al checar salida, pausa por jefe/CEO,
     KPIs desde sesiones.
  4. **Clientes + proyectos (en curso):** Clientes de vuelta al menú para quien lleva comercial, base única
     con el alta rápida, proyectos por cliente (posible migración `20261002140000_*`).
  5. **Organigrama radial + quitar Organigrama de Android/iOS (en curso).** Dejó `tsc` web con 2 errores
     (`eyebrow` en `erp/organigrama/page.tsx` y `erp/hr/orgchart/page.tsx`) al momento del corte.
  6. **Códigos de barras (en curso):** lector USB y UPC en almacén, Code 128 propio y etiquetas de
     herramientas (posible migración `20261002150000_*`).
  **Chat:** solo maquetas (`scratchpad/chat/direccion-a.png`, `direccion-b.png`, `auditoria.md`, `plan.md`);
  Adam debe elegir A o B antes de construir. **Sin empezar:** guardias de fin de semana, sugerencia de
  nómina (horas productivas vs laboradas) y las pantallas nuevas en las apps (pausar, escáner con cámara).
- **Hecho (Chat: «Crear canal» no se podía usar y se veía horrible):** Adam mandó captura: sin botón
  «Crear», casilla gigante y «Canal privado» lejos. Dos causas en `WorkspaceChat`: (1) los tokens
  `--nx-*` (`--nx-send`, `--nx-line`, `--nx-accent`…) vivían solo en `.shell`, pero **todos los modales
  del chat cuelgan fuera de `.shell`** (hermanos de `.fill`): `.sendBtn` quedaba sin fondo con texto
  blanco → «Crear» invisible, y los bordes (`--nx-line`) desaparecían; (2) el estilo global
  `:where(input…)` de `utilities.scss` da `width:100%` y alto de campo a cualquier input, también a la
  casilla. Fix: los tokens ahora son `.shell, .modalBackdrop {…}` (arregla también DM, invitar, selector
  de entidades, cambiador de canales y lectores, que compartían el problema); casilla en una tarjeta
  `.optionRow` con tamaño propio y descripción; texto de ayuda; **los errores van dentro del modal**
  (antes `setError` salía detrás del fondo, p. ej. «Ya existe un canal con ese nombre» parecía «no
  pasa nada»); Enter crea; botón «Crear canal» deshabilitado sin nombre y «Creando…» mientras guarda.
  Backend sin cambios (`POST chat/channels` no pide permiso extra). Verificado con una réplica estática
  del modal en Chrome headless (no con el chat real: no hay sesión ni entorno local); web 696/696,
  `tsc` 0. **Pendiente: que Adam lo pruebe.**
- **Hecho (cotizaciones: la partida escrita en «Nueva partida» ya no se pierde si no das Enter):**
  Adam mandó dos capturas de NEX-CE00002201-0005 (cotización 18): en una computadora la 2.ª partida
  tenía nombre y precio 220 pero el subtotal/total seguían en $9,379.45 y el PDF mostraba una sola
  partida. En producción (`cotizacion_items`) solo estaba la partida 1: la otra nunca se agregó. Causa:
  la última fila de `TablaPartidas` (`FilaNueva`) es un borrador con estado local y solo pasa a ser
  partida con Enter o el botón «↵» — pero se ve idéntica a una real (incluso enseña su total), así que
  quien no daba Enter creía tenerla. Ahora `FilaNueva` se agrega sola al salir de la fila (`onBlur` de
  la fila + `setTimeout` que revisa dónde quedó el foco: moverse entre sus celdas, el botón ↵, el
  catálogo o cambiar de ventana no la agregan a medias) y **sin robar el foco**
  (`alAgregar(p, { conFoco: false })`); Enter sigue igual. El «↵» se resalta mientras hay algo por
  agregar. `TablaPartidas.spec.tsx` nuevo (5 tests; el principal falla sin el arreglo — verificado
  quitando el `onBlur`), 64/64 en `cotizaciones`+`lib/cotizacion*`, `tsc` 0. **La partida 2 de la
  cotización 18 no está en la base: hay que volver a capturarla** (cualquier cotización donde pase
  lo mismo igual).
- **Hecho (Perfiles: Christian activa y desactiva perfiles desde su propio menú):** Adam pidió poder
  desactivar a alguien que se fue (sin credenciales ni asignación, historial intacto, reactivable).
  `/erp/users` ya hacía eso (`isActive` corta login/sesiones en `auth.service`/`jwt.strategy`, saca
  del chat y apaga el ACS vía `UsersService.updateHrFields`, y `team-board` filtra `isActive: true`),
  pero **el menú de Christian solo llega a «Perfiles»** (`/erp/perfiles` → `AltaUsuarioPanel`), sin
  enlace a `/erp/users` — por eso «sigo sin poder» aunque la función existía. Se puso el control donde
  él trabaja: `PATCH users/delegated/:id/activo` (`UsersDelegationService.cambiarActivo`; solo
  dirección, nunca uno mismo ni las cuentas del dueño/developer; reusa `updateHrFields` y deja
  `USER_DEACTIVATED`/`USER_REACTIVATED` en auditoría). La lista de Perfiles de dirección ahora
  incluye a los inactivos (`activo` en `PersonaEquipo`, orden activos primero) para poder
  reactivarlos; los encargados (Antonio/Luis/David) siguen viendo solo su equipo activo y sin el
  botón. UI: botón Desactivar/Activar con confirmación, etiqueta «Desactivado», sin «Editar» para
  inactivos. 7 tests de servicio + 3 de pantalla; `tsc` 0, API 3005/3005. **Pendiente: que Adam lo
  pruebe con la persona que se fue.**
- **Fecha (turno anterior):** 2026-10-01
- **Hecho (Roberto Vivanco solo podía recibir «Servicio», no «Tarea»):** Antonio (su jefe directo,
  managerId 39→40) no podía asignarle una tarea de recolección de material — el selector de «Tipo
  de actividad» solo le mostraba Servicio («Solo ves los tipos que Roberto Paul puede recibir»).
  Investigué permisos de organigrama y correo (`equipo-alcance.ts`) y Roberto está completamente
  dentro del alcance de Antonio por los dos caminos — el límite real estaba en
  `apps/web/lib/activity-kinds.ts`: `RECEIVE_BY_EMAIL[roberto]` tenía un comentario explícito
  («Roberto: solo atiende servicios») y solo `['servicio']`, a diferencia de Carolina/Alejandro
  (su mismo equipo de soporte) que ya tenían `['tarea', 'proyecto', 'servicio']`. Se iguala a
  Roberto con ellos — decisión explícita de Adam («absolutamente todos deben tener tareas»). Mismo
  cambio espejado en `CoreActivityKinds.kt` (Android) y `CoreActivityRules.swift` (iOS) para que no
  reaparezca el mismo límite ahí; **las apps nativas necesitan su propio build/release para
  llevarlo** (no las toca este deploy web). `tsc` 0, 480/480 en `lib/`.
- **Hecho (Evidencia por campos: nadie la documenta sin haber tomado antes la entrada):** Adam vio
  en el panel que AN-0031 tenía «Evidencia por campos» 2/2 sin que a Antonio le apareciera hecho el
  Paso 1 — el stepper de `ActivityEvidenceFlow` y la pantalla de «Evidencia por campos» son dos
  flujos independientes en la misma página, y nada impedía documentar campos sin haber tomado la
  entrada. `ActivityEvidenceFieldsService.guardarFoto()` ahora exige que el `ActivityEvidence` del
  usuario tenga `entryPhotoUrl` antes de guardar cualquier foto de campo («Primero toma la foto de
  entrada (Paso 1)…»); sin entrada, no hay campos. 3 tests (`activity-evidence-fields-paso1.spec.ts`).
- **Hecho (excepción puntual: adjuntar entrada/salida en vez de cámara — AN-0031 de Antonio):** tras
  destrabar el cierre (ver abajo), Antonio reportó que ya tenía las fotos de entrada/salida «en el
  carrete» y pedía adjuntarlas en vez de volver a tomarlas con la cámara. Adam fue explícito: la
  regla de «solo cámara en vivo» (`lib/evidencia-adjunto.ts` lo documenta así: la galería se puede
  falsear) se queda igual para todos — esto es una excepción puntual, **solo para esa asignación**,
  que se cierra sola. Se agregó `evidence.allow_attach:<activityId>` en `system_settings` (mismo
  patrón que `attendance.web_checkin_until`): pura (`adjuntar-entrada-salida.ts`,
  `ventanaAdjuntarEntradaSalida`, 5 tests) + expuesta como `allowAttach`/`allowAttachUntil` en
  `GET activity-evidence/:activityId`. En `ActivityEvidenceFlow.tsx`, el Paso 1 y el Paso 5 muestran
  un botón «📎 Adjuntar (excepción)» junto al de cámara solo cuando `allowAttach` es cierto — reusa
  `dataUrlDeImagen`/`getGeolocation`/`setPendingPhoto` ya existentes (mismo flujo de vista previa y
  envío que la cámara en vivo; la ubicación sigue siendo la de ahora mismo, de donde sea que se
  adjunte). Nada cambia para nadie más. Ventana abierta para AN-0031 (companyId 1) por 6 horas vía
  `apps/api/scripts/set-evidence-attach-window.sql` (correrlo de nuevo con otras horas la amplía;
  `DELETE FROM system_settings WHERE key = 'evidence.allow_attach:31'...` la cierra antes). `tsc` 0,
  285/285 en `src/activities`, 2998/2998 en todo el API. **Pendiente: confirmar con Adam/Antonio que
  ya ve el botón y que las fotos quedan guardadas.**
- **Hecho (gate de «Finalizar actividad»: no veía la Evidencia por campos — AN-0031 de Antonio):**
  por WhatsApp, Antonio no podía cerrar AN-0031 («no me aparece el botón de finalizar»). En la base:
  su «Evidencia por campos» (Cámara 1, Antes+Después) estaba 100% completa (`activity_evidence_fields`
  / `activity_evidence_field_photos`), pero el gate de `ActivitiesService.update()` (Armor, antes de
  pasar a Finalizada) solo miraba el modelo `Evidence` **viejo** (`tipoEvidencia` = llegada/salida/
  hoja) — y ese modelo llevaba 0 filas para esta actividad porque nada de los flujos actuales
  (ActivityEvidence de 5 pasos, ni Evidencia por campos) escribe ahí. Cualquier actividad con
  plantilla de campos propios quedaba bloqueada para siempre, sin importar qué tan completa
  estuviera. Fix: si la actividad tiene `activity_evidence_fields`, su `progresoDeCampos()` (de
  `evidence-fields.helpers.ts`, la misma función pura que ya usa la pantalla «Evidencia por
  campos») manda y se salta el chequeo viejo; sin campos propios, sigue el flujo de siempre
  (sin tocarlo, para no regresar nada). 4 tests nuevos (`activities-evidence-gate.spec.ts`) +
  277/277 en `src/activities` + 2990/2990 en todo el API. **Pendiente: que Antonio vuelva a
  intentar cerrar AN-0031** (ya no debería faltarle nada).
- **Hecho (/erp/pizarra/flujo: una sola franja, sin el reglón desalineado):** Adam mandó captura de
  esa página y dijo «se ve horrible» — la causa concreta: eran dos `StatRow` separados (uno de 6
  columnas con `FlujoKpiStrip`, otro de 3 columnas debajo) sobre el mismo ancho, así que las
  columnas de la segunda fila quedaban el doble de anchas que las de la primera y no alineaban —
  más la redundancia de «A tiempo» como % en la primera fila y como conteo en la segunda. Se
  reemplazaron ambos por un solo `StatRow cols={8}` con los 8 valores reales (ya no se reusa
  `FlujoKpiStrip` en esta página; esa sigue igual donde sí se usa: la franja compacta de Actividades
  y Mi equipo). `tsc` 0, 34/34 en los specs de pizarra/team-board-api.
- **Hecho (Flujo del periodo: el clic no se notaba — sin señal visual persistente):** Adam probó el
  fix de «cada número abre su lista» y reportó «sigue igual». El `href` del `Stat` sí funcionaba,
  pero no había ninguna señal visible sin pasar el mouse (el fondo solo cambiaba en `:hover`), así
  que en una captura se ve idéntico a antes. Se agregó una flechita «›» siempre visible junto al
  número y un subrayado punteado en la etiqueta cuando el `Stat` es clicable (`piezas.module.css` /
  `piezas.tsx`). **Importante:** si la pestaña ya estaba abierta desde antes del despliegue
  anterior, un simple refresh (F5) también hace falta — React ya tenía cargado el bundle viejo en
  memoria.
- **Hecho (Flujo del periodo: ventana de checar desde la web, 5 días más):** Antonio avisó por
  WhatsApp que no le dejaba cargar su asistencia («se checa desde la app NEXARA»): la excepción
  `attendance.web_checkin_until` (companyId 1, NEXARA) había vencido el 30-sep. Se corrió de nuevo
  `set-web-checkin-window.sql` (vía `docker exec -i nexara-db psql`, sin tocar código ni
  redesplegar) con `hours=120` → vence el 06-oct 17:12 UTC. El backend la relee de la tabla en cada
  consulta (sin caché) y la pantalla de «Mi jornada» se refresca sola cada 5 min, así que no hace
  falta nada más. Para la próxima vez: `apps/api/scripts/set-web-checkin-window.sql`, o
  `COMPANY_ID=1 APLICAR=1 HORAS=120 bash apps/api/scripts/activar-perfil-ceo.sh` desde el servidor.
- **Hecho (Flujo del periodo: cada número abre su lista real, ya no son cifras vagas):** Adam vio
  «Asignadas 57, Iniciadas 52…» en Actividades → Asignadas por mí y dijo que no especificaban nada
  (ni de quién, ni cuáles). Se agregó `GET me/kpis/flujo/:bucket` (`me.controller.ts` →
  `TeamBoardService.getWorkflowActivities`) que lista las actividades reales detrás de cada balde
  (assigned/started/evidence/closed/slaOnTime/slaLate con `activityAssignee`; peerRejected con
  `activityPeerRequest`). Para que el número de la franja y la lista nunca se desacoplen, se extrajo
  `clasificarActividad()` en `workflow-kpis.ts` como única fuente de verdad — tanto el conteo
  (`accumulateWorkflow`, sin cambio de comportamiento) como el detalle la usan. `Stat`
  (`components/base/piezas.tsx`) ganó un `href` opcional (se vuelve `<Link>`, mismas clases CSS,
  sin tocar los ~30 usos existentes que no lo pasan). `FlujoKpiStrip` enlaza 5 de los 6 números
  (no «A tiempo», que es un % y no un balde) a `/erp/pizarra/flujo/[bucket]` (página nueva, mismo
  patrón que `/erp/pizarra/flujo`: `RangoSelector`, tarjetas `PersonaPhotoCard` con link a
  `/erp/actividades/:id`). La página de detalle (`/erp/pizarra/flujo`) también enlaza sus 2 cifras
  de SLA (A tiempo / Tarde). Backend: 3 tests nuevos (`workflow-bucket.spec.ts`) + 170/170 en
  `src/me`. Web: `tsc` 0 (tras limpiar `.next/types` de una ruta temporal vieja de la sesión
  anterior), 34/34 en los specs de `team-board-api`/`base`/`pizarra`. **No lo probé a mano en el
  navegador**: Docker Desktop no arrancó en esta máquina (ya documentado, sin forzar «Reset to
  factory defaults» — borraría la BD local) y no hay stack local levantado para loguearme como
  CEO. **Desplegado, pendiente que Adam confirme en Actividades → cualquier pestaña con Flujo del
  periodo, dando clic en un número.**
- **Hecho (planos: orden de página — firma al final de verdad, no antes):** tras el fix de `3595081c`
  (planos embebidos en el PDF que de verdad descarga el cliente, `cotizacion-formato-nexara.ts`), Adam
  reportó que los planos salían al final y el cierre (ATENTAMENTE + firma) quedaba antes — pidió que el
  cierre vaya siempre hasta el final de verdad. Se reordenó: la lista de «ANEXOS» no imprimibles y las
  imágenes de plano a página completa ahora van antes del cierre (antes iban después); el cierre se
  mueve a una hoja propia cuando hubo algún anexo con página propia, para no encimarse con un plano (bug
  real que se hubiera visto: la imagen no avanzaba `p.y` tras dibujarse). Los planos en PDF real (los que
  se anexan con `pdf-lib`, páginas vectoriales tal cual) ahora se **insertan** antes de la última página
  del documento (la del cierre) en vez de añadirse siempre al final — `anexarPaginasPdf()` en
  `common/pdf/planos-pdf.ts` ganó la opción `antesDeFinal`. Imágenes de plano también quedaron centradas
  horizontalmente (antes pegadas al margen izquierdo). Test nuevo que fija el orden (la página del plano
  antes que la del cierre, cierre siempre en la última página). Verificado con los dos planos reales de
  la cotización 13 (bajados de nuevo por `scp`): 4 páginas — 1) datos/partidas, 2) IPADE A-01, 3) RED CCTV
  IPADE, 4) ATENTAMENTE + firma — confirmado con PyMuPDF. `tsc` 0, jest API 2983/2983. **Pendiente
  desplegar y pedirle a Adam que confirme en una cotización real.**
- **Hecho (quiebre angosto de la tabla de cotizaciones, cierre de iOS y Android):** con Costo y Margen %
  como columnas fijas (9 en total), el quiebre «sin columnas opcionales» seguía en 560px — entre 560 y
  900px la tabla se apretaba sin pasar a modo apilado (Marca/Modelo como «M.» sueltos, Costo/Margen sin
  caja visible). Se sube ese quiebre a 900px, igualándolo al de columnas opcionales (que quedó idéntico
  y se borró por duplicado). Verificado en el navegador a 700px (apilado, con valores) y 1100px
  (columnas). **Desplegado** (`43627301`).
  **iOS:** con la ayuda de Adam entré a App Store Connect (Chrome del propio Adam, ya con su sesión) —
  la versión 1.0 llevaba desde el lunes «Pendiente de revisión» con el build 5. Se quitó de la cola
  («eliminar esta versión del proceso de revisión»), se adjuntó el build 6 y se guardó. **Adam mismo la
  volvió a mandar a revisión** (el botón «Añadir a revisión» lo apretó él, no yo). Capturas, descripción
  y demás metadatos ya estaban completos de antes; no se tocaron.
  **Android:** el AAB (versionCode 14 / 1.0.5, ver arriba) pesa 24.4 MB — por encima del límite de 10 MB
  de la herramienta de subida de archivos de esta sesión (Claude en Chrome), así que no pude arrastrarlo
  yo. Adam dijo haberlo adjuntado él mismo, pero al recargar «Crear versión de producción» (dos veces,
  en pestañas distintas) el cuadro de subida seguía vacío y el texto decía «Ningún app bundle... se
  incluirá en esta versión» — sin bundle real adjuntado pese a lo que se veía en su pantalla. Se le dio
  de nuevo la ruta exacta del archivo para que lo arrastre él. **Si retomas esto sin haber visto el
  cierre: entra a Play Console → NEXARA → Producción → esa versión en borrador y confirma con tus
  propios ojos que el app bundle 14 (1.0.5) aparece antes de tocar nada — esta sesión no logró
  confirmarlo.**
- **Hecho (margen por partida: de campo escondido a columna real; Adam insistió con captura):** el
  primer intento (campo «Margen %» bajo el título, ensanchado de 4.25rem a 6rem) seguía sin verse como
  algo editable — Adam mandó otra captura: «sigo sin ver la columna... solo el general», y luego «es
  una columna y se puede editar por partida... cada partida nueva puede llevar un porcentaje distinto».
  Costo y Margen % salieron del detalle (donde quedan Marca/Modelo/Descripción del PDF) y se volvieron
  columnas de verdad entre Cantidad y Precio — igual que el Excel de Quina. `columnasDeTabla()` pasó de
  7 a 9 columnas fijas (Costo y Margen no son de «Personalizar», nunca se imprimen en el PDF final); se
  actualizaron los dos quiebres angostos (`@container` ≤900px con columnas opcionales y ≤560px) para no
  descuadrar la rejilla. Verificado a mano en el navegador (ruta temporal `/tmp-preview-margen`, borrada
  después): costo 100 + margen 50 → precio 150 solo, subtotal se recalcula. web `tsc` 0, vitest 81/81
  archivos (688/688). **Desplegado** (`08c1bdb4`).
- **Hecho (iOS: build 6 a TestFlight, terminado en verde):** `CFBundleVersion` 5 → 6 (App Store Connect
  rechaza un build ya subido o menor), tag `ios-testflight-1.0.0-6` empujado → workflow
  `ios-testflight.yml` corrió en macOS runners y terminó `success` (run 36767760994). Trae los fixes de
  evidencia libre, checklist de vehículo y avatarUrl de sesión fusionados hoy desde Cursor Cloud Agent.
  **Falta:** en App Store Connect → TestFlight confirmar que el build 6 quedó disponible y, si aplica,
  mandarlo a revisión de Apple (el rechazo del 28-09 seguía pendiente de reenvío).
- **Hecho (Android: AAB firmado, build exitoso, sin subir a Play):** `VERSION_CODE` 13 → 14,
  `VERSION_NAME` 1.0.4 → 1.0.5 (commit `aef82e66`); `pwsh scripts/build-play-aab.ps1 -BumpVersionCode
  -VersionName 1.0.5 -Clean` → `BUILD SUCCESSFUL in 13m 34s`, AAB de 24.4 MB. Trae todos los arreglos
  acumulados sin subir (autoasignarse, evidencia libre, foto/nombre en «Más», auditoría de UI/UX, «Kit
  personal», el `DurationField` duplicado, evidencia libre en cola, checklist de vehículo). No hay
  publicación automática a Play configurada (sin cuenta de servicio ni fastlane): el `.aab` se mandó a
  Adam por archivo — **falta que él lo suba a mano** en Play Console → `mx.nexara.mobile.nativeapp` →
  Producción o prueba interna → Crear versión. El archivo queda en
  `apps/mobile-native/android/app/build/outputs/bundle/release/app-release.aab` (no versionado; se
  pierde si se hace `-Clean` de nuevo sin respaldarlo antes). El `mapping.txt` de esta versión sí quedó
  archivado: `apps/mobile-native/play-releases/mapping-v14-1.0.5.txt`.
- **Hecho (cursor, verificación de producción + CI Android):** producción corre `489fe64b` (código
  idéntico a `135d4533`, que solo añadió este relevo); contenedores `nexara-web`/`nexara-api`
  recreados 18:46 UTC por otro despliegue y sanos; verificado dentro de los contenedores que el
  build trae el picker de horas/minutos (chunk de `pizarra/[userId]/asignar`) y la transacción de
  `addEvidencePhoto`. Migraciones: la última aplicada es `20260929180000_cotizacion_margen_general`
  y no hay nuevas. `app.`/`core.`/`nexara.com.mx` y `api.nexara.com.mx/api/health` responden 200.
  CI de `135d4533`: todo verde salvo Android, que compilaba y pasaba tests pero fallaba el chequeo
  de «errores crudos»: `EvidenceCaptureFlow.kt` mostraba `e.message` al adjuntar imagen → ahora
  `e.toUserMessage(...)`. Local: API `tsc` 0 y jest 2979/2979 (1 timeout del PDF solo bajo carga,
  pasa aislado); web `tsc` 0 y vitest 688/688 (1 timeout de viáticos bajo carga, pasa aislado);
  Android compile + unit tests OK. **Ojo:** en el servidor `deploy/docker/Dockerfile.web` tiene
  un cache-bust fijo editado a mano y hay `*.bak-recordarme-20260926` sin trackear; no se tocaron.
  En local queda sin commitear `cotizaciones/_editor/editor.module.css` de otro agente; no se tocó.
- **Hecho (margen % por partida en cotizaciones, pedido de Quina/Monica por WhatsApp):** el cliente
  pidió capturar costo/margen/precio por renglón, no un solo margen global — Adam mandó capturas de
  WhatsApp y un ejemplo en Excel. Cada partida (`CotizacionItem.marginPercent`, ya existía en el
  schema pero era un no-op para el precio) ahora, con costo interno puesto, calcula el precio al
  cliente como costo × (1 + margen/100) — markup sobre costo, igual que pidió Quina, NO el margen
  sobre venta que usa `sellFromCost` en el cotizador inteligente (son cosas distintas, no se tocó esa).
  Es aparte del margen de la cotización (`Cotizacion.marginPercent`, sigue yendo una sola vez sobre el
  total con IVA, sin tocar ese cálculo para no arriesgar cotizaciones ya enviadas) — si se usan los dos
  a la vez se suman, y el editor avisa de eso bajo el campo de margen general. El servidor recalcula el
  precio en `normalizeItems` (no confía en lo que mande el navegador). PDF interno: costo, margen % y
  precio por partida, más un renglón de margen ponderado de las partidas en el desglose. PDF final (el
  que ve el cliente): sin cambios, sigue sin costo ni margen, solo precio ya incluido. Sin migración
  real (solo un comentario `///` en el schema). Verificado: API jest 248/248 suites, 2979/2979 pruebas,
  `tsc` 0; web vitest 81/81 archivos, 688/688 pruebas, `tsc` 0. **Desplegado.**
- **Hecho (rescate de un checkpoint-commit de Cursor Cloud Agent que se llevó este trabajo a otra
  rama):** a medio hacer el margen por partida, la automatización de Cursor Cloud Agent hizo un commit
  de respaldo (`checkpoint before checking out cursor/cloud-agent-1790788798658-1ofgu`) de TODO lo sin
  confirmar en el checkout compartido — mi trabajo de cotizaciones mezclado con archivos que Cursor
  traía a medias (evidencia libre, picker de horas, checklist de vehículo) — y cambió el checkout a esa
  rama, dejando `main` local un commit adelante pero sin ese checkout activo. Nada se perdió (`git
  reflog` lo confirmó), pero hubo que separar con cuidado lo mío de lo de Cursor sin usar ningún
  comando destructivo (nada de `reset --hard`, `checkout --`, `clean` ni `stash drop`): `checkout main`
  → `reset --soft` al commit anterior (no toca el índice) → `git add` solo de mis archivos → el resto
  (ya duplicado byte a byte en la rama de Cursor, confirmado con `git diff` antes de tocar nada) a un
  `git stash` con nombre, que se queda ahí sin borrar. Esa rama de Cursor traía además un bug real:
  `CoreActivityFormScreen.kt` tenía la función `DurationField` pegada dos veces, idéntica — Kotlin la
  veía como overload conflictivo y no compilaba. Se dejó una sola copia, recompiló limpio, y la rama
  (con evidencia libre + picker de horas/minutos + **el pendiente de iOS que había quedado para una
  sesión con Mac: `ChecklistVehiculoView.swift` avisa antes de perder las fotos del checklist de
  vehículo al salir sin enviar**) se fusionó a `main` sin conflictos, con jest/vitest/tsc/Android en
  verde antes y después de fusionar, y se borró (local y remota) según la regla del repo. Se quitó de
  paso un script de depuración (`.ai/tmp-probe.js`) que se había colado en el checkpoint. **Ojo para
  quien retome:** queda un `git stash` viejo (mensaje «leftover: WIP de Cursor recuperado del
  checkpoint...») con versiones desactualizadas de `ActivityEvidenceFlow.tsx`, `OpsActivityForm.tsx` y
  `asignar/page.tsx` — ya están superadas por lo que se fusionó a main, se puede tirar cuando Adam lo
  pida por su nombre (`stash drop`), no antes.
- **Hecho (auditoría grande de bugs y UI/UX — Android + web):** Adam pidió «una pasada grandísima»
  a las apps móviles y a la web porque «tienen muchos errores». Se lanzaron 4 agentes de lectura en
  paralelo (Android, iOS, web operativo, web back-office) más el que arregló lo de «Kit personal»
  (commit `4129a7fc`, ver abajo). De ~28 hallazgos concretos con archivo y línea, se arreglaron los de
  mayor impacto y menor riesgo:
  - **Android:** «Vaciar cola» offline ya pide confirmación (borraba TODO sin avisar — mismo tipo de
    daño que la evidencia libre). El detalle de actividad ya no se queda mudo si falla un refresh tras
    cancelar/pasar de compañero (antes no decía nada y se veía el estatus viejo sin explicación). Los
    tres íconos del compositor de chat y el de «Opciones» del mensaje volvieron al tamaño de toque de
    Material3 (estaban forzados por debajo de lo accesible). «Abrir en la web» sin navegador instalado
    ahora avisa en vez de quedarse mudo. `MyProfileScreen` ya no adivina éxito/error buscando la
    palabra «guardado» en el texto (frágil).
  - **Web:** el detalle de actividad ya no borra toda la pantalla si un refresh falla después de una
    acción que sí funcionó (ahora conserva lo último bueno y avisa con «Reintentar», salvo que sea
    literalmente otra actividad la que nunca cargó). «Eliminar actividad» ya no convive con el modo
    editar (evitaba un caso raro donde el error de borrar podía perderse). «Asignadas por mí» ya tiene
    botón de reintentar. Los íconos del header del chat en móvil suben a 40px. Gastos y Pagos a
    empleados ya avisan antes de cerrar el modal con cambios sin guardar (mismo patrón que Documentos,
    pero les faltaba el prop `dirty`). Cuatro secciones de Contabilidad (periodos, centros de costo,
    presupuestos, presupuesto vs. real) y dos más (plantillas de rol en Usuarios, proyectos en el
    detalle de Cliente) dejaron de tragarse el error silenciosamente mostrando «no hay nada» en vez de
    avisar que algo falló.
  - **El bug recurrente de `limit=100`/`limit=50` (ya conocido, «siete pantallas» en agosto) seguía
    vivo en más lugares:** pólizas contables y movimientos bancarios ahora cargan por tandas de 500
    (igual que ya se hizo para Facturas) con «Cargar más» si hay más; **`users/hr-staff` se llamaba con
    `?limit=50` desde RH y `?limit=100` desde Sanciones, truncando la plantilla completa de cualquier
    empresa con más personal que eso — se quitó el parámetro: ese endpoint, sin `limit`, ya regresaba
    la lista completa sin paginar (estaba hecho para eso, solo que nadie lo estaba usando así).**
  - **iOS:** el agente confirmó que el diff de «foto y nombre arriba de Más» (commit `cc395ab8`)
    compila bien a mano (orden del init memberwise correcto). Encontró 7 más, el más importante:
    `ChecklistVehiculoView.swift` tiene el MISMO bug que se arregló para evidencia libre (fotos del
    checklist de vehículo solo en memoria, se pierden si se cierra la hoja o muere la app) — **no se
    tocó**, por no seguir apilando cambios de iOS sin poder compilarlos. Queda en la cola para quien
    tenga Mac, junto con el resto de hallazgos de iOS (detalle completo en la respuesta de esa sesión,
    no repetido aquí por espacio).
  Verificado: API sin tocar en esta ronda; web `tsc` 0, vitest 78/675 en dos rondas; Android
  `compileDebugKotlin` y `testDebugUnitTest` en verde en tres rondas. **Falta desplegar** (web) y
  **falta compilar + subir build nuevo** (Android — mismo pendiente que evidencia libre y
  autoasignarse, un solo build serviría para las tres cosas).
- **Fecha:** 2026-10-02
- **Hecho (bug real: «Kit personal» se perdía al asignar — Luis mandó captura por WhatsApp):** Luis
  (`coord_operaciones`) le mandó a Adam una captura: en el flujo de asignar (`/erp/pizarra/[userId]/asignar`,
  José Antonio de destino), marcó «Kit personal» sin tocar el buscador de «Almacén de herramientas» (lo
  dejó vacío), le dio «Asignar actividad» y la pantalla le devolvió «Error interno del servidor» junto al
  botón. Investigué a fondo todo el camino real de ese clic — creación de la actividad (`activities.service.ts`),
  RBAC de asignación cruzada de departamento Luis→Antonio (`asignacion-departamento.ts`, que ya documenta
  este mismo flujo de despacho), validación de inventario y kit en `activity-tools.service.ts`, y si las 216
  migraciones de Prisma estaban realmente aplicadas en producción (sí, una por una, sin faltantes) — sin
  lograr reproducir un 500 real con exactamente ese payload. Sí encontré y confirmé por `git log` una
  regresión concreta, del mismo commit que metió «Kit personal» (`4ecc6131`, 24-09): `guardarHerramientas`
  en `OpsActivityForm.tsx` se salta por completo el PUT a `/activities/:id/herramientas` cuando la lista de
  renglones está vacía (`herramientas.length === 0`) — una condición que tenía sentido ANTES de que
  existiera el flag de kit («si no hay nada que guardar, no llames a la API»), pero que nadie actualizó
  cuando se agregó `usaKit` como una segunda razón independiente para guardar. Resultado: marcar el
  checkbox sin agregar nada del almacén se veía bien en pantalla pero nunca llegaba a la API — la actividad
  quedaba con `usesPersonalKit=false` en silencio, sin aviso ni error. Arreglo: función pura nueva
  `debeGuardarChecklist(herramientas, usaKit)` en `lib/herramientas-checklist.ts`
  (`herramientas.length > 0 || usaKit`), usada en el gate de `guardarHerramientas`. De paso, el mock
  compartido de `activity-tools.service.spec.ts` (`build()`) nunca tuvo `prisma.activity.update` — la
  llamada que persiste `usesPersonalKit` dentro de la transacción — así que esa ruta llevaba desde el 24-09
  sin cobertura real (cualquier prueba que mandara el payload tal como lo arma el controller habría tronado
  con `TypeError: tx.activity.update is not a function`). Se agregó el mock y dos pruebas: una que manda
  exactamente la forma que manda el controller (objeto `{requisitos: [], usePersonalKit: true}`, no el
  arreglo plano viejo de las pruebas anteriores) y confirma que sí se llama `activity.update`, y otra que
  confirma que un guardado normal no lo toca por accidente. **Ojo:** no pude confirmar que ESTE fue el 500
  exacto que vio Luis — el contenedor de producción se recicló entre el reporte y esta sesión (deploy de
  16:13 de hoy, para otro fix) y se perdieron los logs con el stacktrace real. Si el «Error interno del
  servidor» vuelve a aparecer al asignar, lo primero es capturar `docker logs nexara-api` ANTES de
  redesplegar — `all-exception.filter.ts` sí registra `originalMessage` y `stack` completos, solo que no
  sobreviven a un `docker compose up` que recrea el contenedor.
  Verificado: API `tsc` 0, jest 245/246 suites en verde (2955/2956 — la 1 que falla,
  `propuesta-tecnica-pdf.spec.ts`, es un timeout de 5 s en un test de PDF ajeno a este cambio, pasa solo en
  aislado: es lento bajo `--runInBand` con 2 956 pruebas, no lo causó este fix); web `tsc` 0, vitest
  78/78 archivos, 675/675 en verde. Sin migración. **Desplegado a producción.**
- **Hecho (foto y nombre arriba de «Más», Android + iOS):** Adam pidió que se viera la foto de
  perfil y el nombre «arriba del todo» en el menú de la app, amigable. Ninguna de las dos apps tiene
  drawer: «Más» es lo más parecido a un menú de cuenta, así que ahí va, como primera tarjeta, con
  foto (o iniciales) + nombre + departamento, y lleva a Mi perfil al tocarla. Android (commit
  `a942d0eb`, compila y tests en verde) lee `SessionStore` local, sin red. iOS (commit `cc395ab8`,
  **sin compilar, sin Mac**) nunca guardaba `avatarUrl` en la sesión — se agregó el campo
  (`Codable` con default `nil`, las sesiones ya guardadas en Keychain siguen bien) y se hidrata en
  login y se refresca en `GET auth/profile`. Mismo pendiente que la evidencia libre: alguien con Mac
  debe compilar antes de generar build.
- **Fecha:** 2026-10-02
- **Hecho (evidencia libre que se perdía — API, web, Android, iOS):** Luis reportó que tomaba varias
  fotos de evidencia («fotos en sitio», sin campos), salía de la pantalla y volvía, y ya no estaban.
  Causa: esa foto solo se acumulaba en memoria del cliente (React state en web, `remember` de Compose
  en Android, `@State` en iOS); nada llegaba al servidor hasta tocar «enviar». Las fotos **por campo**
  nunca tuvieron este problema porque ya mandaban cada una de inmediato. Arreglo: nuevo endpoint
  `POST activity-evidence/:id/evidence-photos/draft` (commit `a21b1973`) que agrega una foto sin cerrar
  el paso — mismo espíritu que las de campo. Los tres clientes ahora mandan cada foto libre al tomarla,
  no al final: web (`ActivityEvidenceFlow.tsx`, mismo commit), Android (`EvidenceCaptureFlow.kt`, commit
  `2e32ed81`, reusa el interceptor de cola offline sin tocarlo — la ruta no estaba en ninguna lista de
  «solo en línea»), iOS (`EvidenceCaptureFlowView.swift` + `CoreRepository.swift`, sin commitear
  todavía). `removeEvidencePhoto` ya no exige el mínimo mientras se sigue capturando y ahora realinea
  `evidencePhotosGeo` al quitar una foto (antes quedaba desfasado).
  **iOS, nota importante:** `CapturedGeoPhoto` exige una `UIImage` local — no se puede reconstruir una
  miniatura real de una foto recuperada del servidor sin descargarla. Se optó por NO tocar
  `pendingPhotos` (sigue siendo solo lo capturado en esta sesión, para la miniatura) y agregar
  `confirmedPhotoURLs: [String]` como fuente de verdad para el conteo, el botón «Enviar» y el envío
  final — se hidrata del GET al abrir la pantalla. Si hay fotos recuperadas de un intento anterior, un
  texto lo avisa («N de un intento anterior ya guardadas») pero no se pueden quitar una por una desde
  ahí (limitación aceptada: si Adam quiere poder quitarlas, hace falta cargarlas con `AsyncImage` desde
  la URL, no se hizo por riesgo de compilar sin Mac para verificar). **No se pudo compilar ni correr
  tests de iOS en esta sesión** (Windows, sin Xcode): el cambio se revisó a mano con cuidado y siguiendo
  el patrón ya probado de `sendCampoPhoto`, pero alguien con Mac debe compilar antes de generar un
  build nuevo — sobre todo porque el build de iOS ya tenía pendiente el reenvío a Apple tras el rechazo
  del 28-09 (ver esa entrada más abajo).
  Verificado: API `tsc` 0, jest 246/2 954 (incluye `activity-evidence-draft-photos.spec.ts`, nuevo);
  web `tsc` 0, vitest 78/672; Android `:app:compileDebugKotlin` y `:app:testDebugUnitTest` en verde.
  Desplegado a producción (API + web). Android: falta compilar y subir un build nuevo (ver pendiente
  de «Auto-asignarme» abajo, mismo build serviría para las dos cosas).
- **Diagnóstico (David no puede autoasignarse actividades):** el código ya está arreglado desde ayer
  (commit `fad23c2e`, 28-09 20:23 UTC — el botón ya no se escondía con la cola vacía) pero **nunca se
  compiló un AAB con ese fix**: el último artefacto construido es `NEXARA-v1.0.2-vc11.aab`/mapping
  v12-1.0.3 del 22-09, seis días antes del fix. David sigue con esa versión instalada. Falta: subir
  `versionCode`/`versionName` (13/1.0.4, el siguiente libre — ver `apps/mobile-native/play-releases/`),
  `pwsh -File scripts/build-play-aab.ps1 -VersionCode 13 -VersionName 1.0.4 -Clean` (keystore y
  `key.properties` ya están en el repo local) y decidir con Adam cómo llega al teléfono de David:
  ¿subida formal a Play (revisión, tarda) o un APK de debug/release directo para probar ya? Este mismo
  build llevaría también el arreglo de evidencia libre de arriba.
- **Hecho (bug real: `/erp/perfiles` no abría para David, Antonio y Luis):**
- **Hecho (bug real: `/erp/perfiles` no abría para David, Antonio y Luis):** Adam probó con la cuenta de
  David (coordinador de operaciones) y el ítem «Perfiles» del menú se veía, pero al entrar rebotaba —
  igual le habría pasado a Antonio y Luis. Causa: `page-matrix.ts` (RBAC v2 del frontend, whitelist de
  páginas por rol) nunca tuvo `/erp/perfiles` registrado; `AppShell.tsx` tiene un guard
  (`accessGuardWarning` = `!canUserAccessPath(...)`) que redirige a la entrada del panel apenas detecta
  una ruta fuera de la whitelist del rol — el swap del ítem del menú («Mi perfil» → «Perfiles») usa un
  chequeo distinto (`cargarContextoAlta`), así que el link SÍ aparecía pero la página nunca cargaba. Solo
  CEO, `super_admin` y `dir_admin` tienen `/erp/**` y por eso a mí (probando como Christian) nunca me
  tocó. Agregado `'/erp/perfiles'` junto a `'/erp/my-profile'` en los 14 roles que no tienen ese comodín
  (arquitecto, dir_operaciones, coord_admin, administrativo, coord_operaciones, ing_campo, ing_soporte,
  enc_soporte, coord_ventas, vendedor, lider_diseno, disenador, rh, contabilidad). `cliente` (portal)
  sigue sin acceso, correcto. Prueba nueva en `page-matrix.spec.ts` que cubre los 14 roles + CEO/dir_admin
  (sí) + cliente (no), para que no se vuelva a colar. Sin migración. Verificado: web `tsc` 0, vitest
  78/672 en verde. **Falta desplegar.**
- **Último turno:** cursor
  edición, `AltaUsuarioPanel.tsx`). Ya aplicado, sin pruebas que lo referenciaran por texto.
- **Hecho (editar perfiles, no solo la foto):** Adam probó `/erp/perfiles` y solo tenía «Cambiar foto» por persona; pidió poder
  editar de verdad. El botón por persona pasa a «Editar» y abre un modal con foto, nombre y teléfono (los cambia cualquiera con
  el permiso, con quien le reporta; dirección con cualquiera de la empresa). Si quien edita es dirección, el modal suma tipo de
  usuario, departamento, jefe y número de empleado — para los demás esos cuatro ni se muestran, y si llegaran igual al API los
  rechaza con 403 (`UsersDelegationService.actualizarFoto`, nombre sin cambiar por no romper la firma que ya usa el controlador).
  Esos cuatro campos ahora reusan `UsersService.update` en vez de un `prisma.user.update` a mano: valida rol/departamento/jefe
  contra la empresa, sincroniza el número de empleado en la membresía y empuja el cambio a control de acceso (ACS), igual que
  la edición general de usuarios — antes se perdía ese empuje si se editaba desde aquí. Nadie puede quedar como su propio jefe;
  ni el dueño ni la cuenta de desarrollo se editan desde este módulo (antes no había ese candado). `equipoDirecto()`/
  `equipoCompania()` ahora también traen `roleKey`/`departmentId`/`managerId`/`employeeNumber` de cada persona para que el modal
  llegue precargado. Tipos `PersonaEquipo` (API y web) y `UpdateDelegatedUserDto` crecieron con esos cuatro campos opcionales.
  `apps/web/lib/delegated-users-api.ts`: `cambiarFotoEquipo` → `editarPersonaEquipo` (único caller, `AltaUsuarioPanel.tsx`, ya
  actualizado). Sin migración. Pruebas nuevas en `users-delegation.service.spec.ts` (permiso por campo, auto-jefe, cuentas
  protegidas) y `AltaUsuarioPanel.spec.tsx` (edición con y sin permiso de dirección). Verificado: API `tsc` 0, jest 245/2 947 en
  verde (incluida `users-delegation.service.spec.ts` con 21 pruebas); web `tsc` 0, vitest 78/671 en verde. **Falta desplegar.**
- **Hecho (Perfiles, segundo intento — página propia):** el primer intento metía Perfiles dentro de Organigrama; Adam dijo que
  no, tenía otro plan para esa página. Reconstruido como `/erp/perfiles` (nueva, propia): sin permiso avisa «Aquí no hay nada
  para ti todavía»; con permiso muestra exactamente lo mismo que antes (alta, fotos del equipo, botón «Mi perfil»). Organigrama
  vuelve a ser solo el árbol de lectura, intacto. En el menú de cuenta (abajo izquierda) y en el ítem lateral, «Mi perfil» pasa
  a «Perfiles» solo para quien tiene el permiso; los demás sin cambio. `equipoCompania()` en `users-delegation.service.ts`
  (dirección ve toda la empresa) igual que el primer intento. Sin registrar en `access-matrix.ts`/`page-matrix.ts` (mismo
  patrón que `/erp/acceso-cuentas`: sin middleware que lo exija, la página se autogestiona con `cargarContextoAlta`).
- **Hecho (foto de perfil faltante en Asistencias):** Adam subió fotos vía Perfiles y no se veían en `/erp/asistencias`, solo en
  Actividades. Causa: `getHierarchyAttendanceRange` (`attendance.service.ts`) nunca mandaba `avatarUrl` en la respuesta, y la
  tarjeta ni lo intentaba (siempre iniciales). Se agrega `avatarUrl` al DTO y la tarjeta ya muestra la foto real con
  `resolveUserAvatarUrl`, iniciales de respaldo si no hay. Sin migración.
- **Hecho (badges de checada deformados):** `Fuera de sitio · N m` y similares (`InsigniasChecada`) usaban `border-radius: 999`
  (pastilla); en la columna angosta el texto largo envolvía a varias líneas y el radio infinito los volvía un círculo/burbuja
  ilegible (Adam lo reportó con captura). Cambiado a `borderRadius: 8` fijo — envuelve bien sin deformarse.
- **Pendiente de aprobación (NO aplicado ni desplegado):** Adam pidió «mejora la UI de las cards de asistencia». Se le mostró
  una propuesta (widget de `visualize`, antes/después del header + entrada/salida/timer) sin tocar el código real todavía.
  Falta su respuesta antes de implementarla.
- Pruebas de este bloque: API 245 suites / 2 944; web 78 archivos / 668; `tsc` limpio en ambos. Despliegue sin migración
  (`bash deploy/update.sh`).
- **Hecho (tiempo previsto también es atraso):** `evaluarSemaforo` (`semaforo-actividad.ts`) gana un tercer motivo, `'plan'`:
  si `minutosReales` supera `minutosPlan`, la tarjeta queda roja igual que por pasar el inicio o el tope (gana el peor de
  los tres). En una actividad de varios días el plan es de una jornada y no cuenta (mismo criterio que ya tenía `excedida`).
  Conectado en los dos lugares que ya tenían plan/real a la mano: `tiemposDto` (`actividad-tiempos.ts`, usa `activities.service.ts`
  y `my-activities.service.ts`) y `calculaActividad` (`me/pizarra-kpi.ts`, la pizarra). El campo `excedida` del DTO no cambió,
  solo ahora también pinta el color. **El cron `ACTIVITY_OVERDUE` (campana/push a jefe y coordinación) NO se tocó a propósito**:
  sigue mirando solo fecha de inicio, tope y fin de periodo — una actividad roja solo por exceso de plan no dispara ese aviso.
  Si Adam también quiere eso, falta extender `activity-overdue-alerts.service.ts` (su SQL inicial no trae `horasPlan` ni
  candidatea por eso). Tipo `MotivoSemaforo` re-exportado desde `actividad-tiempos.ts` (antes solo vivía en `semaforo-actividad.ts`)
  para que `my-activities.service.ts` no lo reescribiera a mano (eso rompió `tsc` la primera vez; ya corregido). Sin migración.
  Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Deploy general de la mañana:** Adam pidió desplegar todo. `origin/main` tenía trabajo de Cursor de la noche sin desplegar
  (líneas de abajo: margen de cotización, cierre solo Servicios, TestFlight, y **alta de usuarios con foto fija** en
  `/erp/organigrama`). Se corrió `tsc` + suite completa de API y web en verde (`npx prisma generate` de por medio, por la
  migración `20260929180000_cotizacion_margen_general`) y se desplegó con `--with-migrate`. Confirmado sano.
- **Intento fallido: módulo «Perfiles» (revertido).** Adam pidió que, en el menú de cuenta, «Mi perfil» se volviera «Perfiles»
  para dirección y para quien tiene gente a su cargo (Antonio, Luis, David), mostrando toda la empresa o su equipo, con
  «Mi perfil» adentro también. Se construyó reusando `/erp/organigrama` (que ya tenía el alta delegada y el cambio de foto
  del equipo): `equipoCompania()` en `users-delegation.service.ts` para que dirección viera toda la empresa, el enlace del
  menú de cuenta y el ítem lateral de la barra apuntando ahí, y un botón «Mi perfil» dentro de `AltaUsuarioPanel`. Se
  desplegó (commit `89863409`) y **Adam dijo que no**: tenía otro plan para Organigrama y no quería nada de esto ahí.
  Se revirtió limpio con `git revert --no-edit 89863409` (commit `ba87cab8`, sin `git reset`/force), se re-probó todo en
  verde (API 245/2 938, web 77/666 — un fallo de `proyectos/nuevo/page.spec.tsx` fue flake bajo carga, confirmado al
  correrlo solo) y se redesplegó sin migración. **Producción volvió a «Mi perfil» normal en los dos lugares** (menú de
  cuenta y barra lateral). **Pendiente:** preguntarle a Adam dónde SÍ quiere que viva «Perfiles» (¿página nueva propia?)
  antes de volver a intentarlo. La alta de usuarios con foto fija (línea de abajo, de Cursor) sigue viva tal cual estaba,
  sin el añadido de «Perfiles».
- **Hecho (margen de cotización sobre el total con IVA):** no se desplegó. En `/erp/cotizaciones` el margen es un solo porcentaje, sin texto de ayuda y sin margen por partida en la tabla. 20 significa total final = (subtotal − descuento + IVA + IEPS − retención) × 1.20. El precio de la partida se guarda como se escribe; el porcentaje no lo reescribe. El campo es texto (no `type=number`) y el parseo no multiplica por 100: un Decimal `{ e: 1, d: [2040000] }` es 20.4, no 204, y «20,4» es 20.4. Vacío o 0 deja el total igual. El PDF final imprime precios y total ya con ese margen e IVA, sin costo ni margen. El PDF interno muestra costo, IVA, margen y total, y recalcula aunque el total guardado sea el de antes. La API devuelve el porcentaje como número. Sin migración: sigue `Cotizacion.marginPercent`. `sellFromCost` del cotizador inteligente no se tocó.
- **Hecho (cierre solo Servicios, margen y PDFs de cotización):** no se desplegó y no se tocó producción. (1) La foto de salida sigue siendo obligatoria y con GPS. La coincidencia con el punto de inicio (100 m) solo aplica si el departamento del responsable se llama Servicios (`Department.nombre`, normalizado). No hay entidad Área: el área es el departamento. `coreKind` servicio es otro eje (Sistemas también ejecuta servicios) y no decide la regla. El API es la fuente de verdad (`exigeMismaUbicacion` en la geocerca). Web, Android e iOS solo pre-bloquean si esa bandera es true; si falta, no bloquean. Las alertas de salida de zona en vivo no cambian. (2) El margen del cotizador es markup sobre el costo: precio = costo × (1 + %/100); 20 % de $100 = $120. Se agregó `Cotizacion.marginPercent` (nullable). Si la partida tiene el suyo, incluso 0, ese gana y no se reescribe. Si está vacío, hay costo y hay margen general, el precio sale de ese general y el de la partida se queda vacío para seguir heredando. Borrar el general no recalcula precios ya guardados. Una cotización nueva nace con 20 %. El margen sobre venta de la cotización inteligente (`sellFromCost`) no se tocó. (3) PDF interno (`GET …/pdf/internal`, solo `cotizaciones.access`): por partida costo, margen % , margen $ y precio, más totales de markup. PDF final (formato Nexara): el mismo de siempre, con el precio ya con margen, sin costo ni margen. En la web, «PDF final» y «PDF interno» (este solo si ve costos). En Android, los dos botones; la API responde 403 si el rol no ve costos. iOS no tiene pantalla de PDF de cotización. Migración `20260929180000_cotizacion_margen_general` (columna nullable, sin backfill). Despliegue cuando toque: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (TestFlight, subida):** `altool --upload-app` de Xcode 26 aborta al ver el bundle id de un `.bundle` de Firebase (`firebase-ios-sdk.FirebaseCore.resources`). Quitar la versión no bastó (runs 36481182560 y 36481867326). Borrar `CFBundleIdentifier` (16f8b141) cambió el error a «The main Info.plist did not contain CFBundleIdentifier» y el fallback no corrió: `$((dirname …))` es aritmética, bash 3.2 sale en 0 y el run 36483216893 quedó en verde sin subir el build 4. Ahora el id numérico se pide a la API de App Store Connect con la misma llave (esta app: `6814597698`), se sube con `altool --upload-package --apple-id --bundle-id` y la versión/build del IPA; si altool falla se prueba `--use-old-altool` y después `iTMSTransporter`. El paso sale en 1 si no hay acuse. Los identificadores de los bundles de privacidad se conservan. **Subido:** 1.0.0 (5), commit `0a69bdec`, tag `ios-testflight-1.0.0-5`, run https://github.com/AdamPark7014/NEXARA-app/actions/runs/36486467950 en verde con acuse `UPLOAD SUCCEEDED` y Delivery UUID `182fa17f-37aa-4ca4-b0d0-7dbdacbf7b1b`. En App Store Connect hay que elegir ese build cuando termine de procesar.
- **Hecho (alta de usuarios con foto fija):** en `/erp/organigrama`, «Dar de alta a alguien» solo sale si la persona tiene subordinados directos (`managerId`, activos, de su empresa; el lateral no cuenta) y puede crear algún tipo. El API lo vuelve a exigir: sin subordinados, `GET /api/users/delegated/contexto` trae `puede: false` y `POST /api/users/delegated` responde 403. Christian (CEO, usuario 1) ve el formulario completo: nombre, correo, contraseña, teléfono, foto, cualquier rol salvo otro CEO, super admin y cliente de portal, departamento, jefe y número de empleado. Obligatorios: nombre, correo, contraseña y rol. David (`operaciones@`) ve el básico (nombre, correo, contraseña, teléfono, foto) y solo crea instaladores (`ing_campo`); el rol y el jefe quedan fijos y el jefe es él. Antonio (`jose.ramirez@`) igual para soporte (`ing_soporte`). Luis (`direccion.operaciones@`) crea los mismos tipos que Antonio, también en básico, y el jefe es él. La concesión sigue siendo por correo (`users.creation_grants`), porque David y Luis comparten rol. La foto es archivo o cámara, recorte cuadrado centrado, vista en círculo, y se guarda en `User.avatarUrl`: es la que ya pintan la web, Android e iOS. No es la de entrada ni la de salida. La selfie de checada (`usarFotoComoAvatarSiFalta`) solo rellena el avatar si está vacío y no pisa esta foto. Desde el mismo módulo se cambia la foto de quien le reporta; dirección puede con cualquiera de la empresa (`PATCH /api/users/delegated/:id`). El teléfono va a `UserProfile.telefono`. Sin migración. Guía: `docs/ALTA-USUARIOS.md`. Despliegue (no corrido): `cd /var/www/nexara-app && bash deploy/update.sh`.
- **Hecho («deployalo todo», ~13:35-15:05):** Adam pidió desplegar todo; Cursor siguió subiendo commits sin parar durante toda la tarde
  (unas 10 tandas). Cada tanda: `git pull --ff-only` (o rebase si hubo choque), `npx prisma generate` cuando tocaba `schema.prisma`,
  `tsc` + suite completa de API y web en verde, push si había algo propio, y `bash deploy/update.sh` (`--with-migrate` cuando traía
  migración) en el servidor. Un conflicto real: `df566a73` (Cursor) metió marca/modelo/costo/margen dentro de la celda de descripción
  de `TablaPartidas.tsx` y rompió el Tab documentado (desc→unidad→cant→precio) más una prueba; se corrigió con `tabIndex={-1}` en esos
  5 campos, y ese fix chocó de nuevo al rebasar sobre `e5ade93e` (Cursor cambió el textarea a `TextoAuto`): se resolvió quedándose con
  `TextoAuto`/`onValor` + el `tabIndex={-1}`.
  **Hallazgo importante:** hay OTRA sesión (al menos una, de iOS/TestFlight, autor "claude-code" en sus commits) desplegando en el
  mismo servidor con el mismo patrón `setsid nohup ./deploy/update.sh --with-migrate &` sin que yo la lanzara — se vio un proceso vivo
  (ppid=1, sin cron/systemd/webhook) que no era mío. No hay colisión real (cada `update.sh` es idempotente: pull a lo último, build
  determinista, migraciones con `_prisma_migrations`), pero si dos deploys hacen `docker compose build` a la vez puede haber carreras
  raras. Vale la pena que Adam sepa que puede haber más de un agente desplegando a la vez.
  **Estado final verificado (15:05):** servidor en `ddcb9475` (todo el código de esta tarde), 5 contenedores healthy, endpoints
  públicos responden bien; lo único más nuevo en origin/main es `16f8b141` que solo toca `.github/workflows/ios-testflight.yml`
  (no afecta api/web, no necesita redeploy).
- **Hecho (avatar de «Mi equipo», foto de Carolina):** `attendance.service.ts` (`usarFotoComoAvatarSiFalta`, línea ~92) toma la
  selfie de la primera checada como `avatarUrl` cuando está en `null`, y se queda fija — por eso salían selfies de checada en vez
  de fotos de perfil (evidencia real: David Morales Zenón). Se armó un widget comparando el tamaño real del aro (74px) con la selfie
  actual contra un recorte cara+hombros de la tarjeta de marca que mandó Adam; aprobó y pidió subir la de Carolina. Subida a
  `/var/www/nexara-app/uploads/users/1790629211392-carolina.jpg` (recorte 480×480 de la tarjeta original) y `User.avatarUrl` actualizado
  para `soporte@nexara.com.mx` (id 13). Verificado que el archivo existe y el registro apunta bien; NO se pudo probar con `curl` porque
  `/uploads/*` exige sesión (correcto, no es bug). Adam va a mandar las 18 tarjetas restantes para repetir el recorte y la subida.
  **Pendiente decidir con Adam:** si además se apaga `usarFotoComoAvatarSiFalta` (para que nadie más se quede con una selfie fija) una
  vez que todos tengan foto real, o se deja como respaldo para altas nuevas sin foto.
- **Hecho (foto en cada punto, web y apps):** en el detalle de la actividad, «Evidencia por campos» ya no dice que las fotos solo se toman desde la app. El responsable y quien sigue asignado ven en cada punto «Tomar foto» (cámara del navegador, `capture` en móvil) y «Adjuntar» (archivo o captura). También vale Ctrl+V y arrastrar sobre el hueco. Si hay varios puntos pendientes, hay que soltar o pegar sobre ese hueco. En despacho, el lead que solo reparte no sube. Quien solo mira el detalle no ve los botones. En Android e iOS, en cada punto, «Adjuntar» es un botón al lado de «Tomar foto» (galería o archivo); la foto de entrada y la de salida siguen siendo solo cámara. Android `versionCode` 13 / `versionName` 1.0.4 (incluye «Auto-asignarme» con la cola vacía). iOS `CFBundleVersion` 4, marketing 1.0.0 (TestFlight ya tenía 1.0.0 build 3). Sin migración. Despliegue web: `cd /var/www/nexara-app && bash deploy/update.sh`. El APK/AAB no lo genera el CI: en el portátil, `pwsh -File scripts/build-play-aab.ps1 -VersionCode 13 -VersionName 1.0.4 -Clean` (hace falta `key.properties` y el keystore). El AAB queda en `apps/mobile-native/android/app/build/outputs/bundle/release/app-release.aab`. iOS: tag `ios-testflight-*` dispara `.github/workflows/ios-testflight.yml` (secretos de Apple en el repo).
- **Hecho (eliminar actividad, solo Christian):** en `/erp/actividades/{id}` el botón «Eliminar actividad» va en la misma fila que Pasar a otro compañero, Cancelar actividad y Editar, y solo lo ve el usuario 1. Pide confirmación y vuelve a la pizarra. `DELETE /api/activities/:id` responde 403 a cualquier otro id (el servicio, no el permiso de gestionar actividades). La matriz de URLs abre ese DELETE solo al rol CEO; el servicio vuelve a exigir el usuario 1. Es borrado lógico: `deletedAt` ya existía; la migración `20260928260000_activity_deleted_by` agrega `deletedById`. No se usa `delete()` de Prisma porque el middleware lo reescribe y perdería quién la borró. El folio siguiente sigue contando las filas borradas para no reutilizar AN-0001. Pizarra, Mi equipo, listas, detalle, KPIs (incluido el `groupBy` del tablero y el SQL de ranking), app móvil (mismos endpoints), búsqueda global y la del chat filtran `deletedAt IS NULL`. Una solicitud de equipo ya no enlaza el folio si la actividad está borrada. La pizarra escucha `activity:updated` y `entity:updated` (modelo Activity); el tablero de operaciones y la app móvil ya escuchaban `entity:updated`, que el middleware emite al guardar. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (eliminar mensaje del chat, solo Christian):** en `/erp/chat` el menú de cada mensaje tiene «Eliminar» solo si el usuario es el 1 (Christian). Pide confirmación. `DELETE /api/chat/messages/:id` responde 403 a cualquier otro id, aunque armen la petición. Puede borrar cualquier mensaje de cualquier autor en cualquier canal o DM de su empresa (no hace falta ser miembro). Es borrado lógico: `deletedAt` ya existía; la migración `20260928250000_chat_message_deleted_by` agrega `deletedById`. El texto se queda en la fila para auditoría y la API no lo devuelve. Las consultas (lista, hilo, fijados, búsqueda, no leídos, reacciones, edición) filtran `deletedAt: null`. El pin se quita en la misma escritura y la vista previa del canal pasa al mensaje anterior. El aviso en vivo va a la sala de la empresa: `chat:message-deleted` (web, iOS y Android ya lo escuchan) y `chat:message:deleted`. Los clientes lo quitan de la lista, de fijados y de la búsqueda; si una respuesta lo citaba, muestra «Mensaje eliminado» sin el texto; el contador de no leídos baja si ese mensaje todavía contaba. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (texto del aviso de atraso):** el push y la campana dicen «Actividad atrasada». Al responsable y a quien está asignado: «Tu actividad {AN} · {título} está atrasada. Asegúrate de cumplirla en tiempo y forma.» Al jefe y a la coordinación: «La actividad {AN} · {título} de {nombre} está atrasada.» Al tocarla se abre `/erp/actividades/{id}` (web, Android e iOS ya leen ese `relatedUrl`). Sin migración nueva. Si `20260928200000_actividad_atrasada` aún no está aplicada: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`. Si ya está: `bash deploy/update.sh`.
- **Hecho (semáforo de actividades):** el recuadro ya no sale naranja por prioridad Media ni por «Sin iniciar». Rojo solo si pasó `fechaInicio` sin arrancar o pasó el tope (`fechaMaxima` / `fechaEntregaEsperada`; con periodo, el fin del último día) sin terminar. Naranja si faltan 30 min o menos (`UMBRAL_POR_VENCER_MIN`). En tiempo: borde azul si no arrancó, verde si ya va. Misma regla en pizarra, Mi equipo y listados. El cron `actividades-atrasadas` (cada 5 min) avisa campana + push (`ACTIVITY_OVERDUE`) al responsable, asignados, su jefe directo y la coordinación del departamento, una vez al entrar en rojo (`overdueAlertedAt`). Recordatorio optativo en `system_settings` clave `activities.overdue_reminder_hours` (0 = solo una vez). Umbrales: `docs/SEMAFORO-ACTIVIDADES.md`. Migración `20260928200000_actividad_atrasada`. No hay variables nuevas: el push usa `WEB_PUSH_VAPID_*` y, para el APK, `FIREBASE_SERVICE_ACCOUNT_JSON`. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (autoasignarse con la cola vacía):** en la app Android, «Auto-asignarme» solo salía si había algo por hacer. Con la cola en cero y una hecha hoy (Luis: Por hacer 0, Hechas hoy 1) la pantalla ya no está vacía y el botón desaparecía. Ahora el encabezado lo muestra siempre que se pueda autoasignar, y con la cola vacía hay además el botón grande, aunque haya hechas hoy o seguimiento. Web e iOS ya lo enseñaban en ese caso. Vale para todos los roles que entran a Mis actividades (la API manda `canSelfAssign`). Sin migración. La web no cambia: hace falta una build nueva de Android.
- **Hecho (viñetas de la partida):** el corte a media palabra del PDF de NEX-MG76022606-0001 («Dim», «Indicadores LE», «Alimentac», «ench») es el texto que ya estaba guardado: antes de e5ade93e cada guardado hacía `name.slice(0, 200)` y la columna era `varchar(200)`. Pasarla a `text` no recupera lo que se perdió. El generador ya imprime el texto completo (sin maxLines, ellipsis ni alto fijo). Hay que volver a pegar la ficha. Al imprimir y en la vista previa, cada `•` (y un `-` o `*` con espacios) baja a su renglón con sangría francesa; lo de antes de la primera viñeta se queda como párrafo. Al pegar en el título o en la descripción, el editor hace lo mismo. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh`.
- **Hecho (cliente corporativo al asignar servicio):** en `/erp/pizarra/:id/asignar`, con actividad de servicio, quien ya puede crear o asignar la actividad (encargado de soporte, operativos y el resto del personal interno) ve «+ Nuevo cliente corporativo». El alta pide solo el nombre; correo, teléfono y RFC son opcionales, crea el cliente tipo CORPORATIVO, lo deja seleccionado y no mira el sector del padrón (Daniela, cuyo sector es comercial, también puede por esta vía; por el padrón sigue sin poder). «Editar» sale sobre el elegido solo si ya puede editar clientes (el encargado sí, el operativo no). `GET ventas/clientes?sector=CORPORATIVO` devuelve todos los corporativos de la empresa, sin filtro de dueño ni de sector. La migración `20260928220000` dejó CORPORATIVO solo cuando el uso más reciente fue una actividad de servicio; empate o sin uso quedó COMERCIAL, así que el select puede salir vacío con datos reales y el botón crea el que falte. Sin migración nueva. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Hecho (alta de proyecto, solo nombre y cliente):** al crear un proyecto —alta rápida desde la actividad y el asistente `/erp/proyectos/nuevo`— lo obligatorio es el nombre y el cliente. Fechas, responsable, presupuesto, sitios, descripción, cronograma, alcance y equipo son opcionales y se completan después en el proyecto. `startDate` de `operational_projects` pasa a nullable (migración `20260928240000_proyecto_inicio_opcional`). El DTO profesional y el de `operational-projects` ya no exigen la fecha; si no hay responsable, queda quien lo crea. El alta rápida ya no rellena el inicio con hoy. En el detalle, borrar el inicio planeado también se guarda. El cliente ya solo exigía el nombre (RFC, razón social y dirección siguen opcionales en BD, DTO y UI). Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (adjuntar evidencia):** en todas las actividades y para todos los roles, las fotos de evidencia (libres y por campo) se pueden tomar con la cámara o adjuntar desde galería, explorador, captura, y en escritorio también arrastrando o con Ctrl+V. Se valida que sea imagen (el PDF solo si el campo lo admite; estos campos no lo admiten: el PDF sigue en la hoja de servicio), se rechaza lo vacío o lo de más de 15 MB y se comprime como la cámara (lado 1280, JPEG 0.6, tope 5 MB). Si no hay GPS la evidencia se guarda igual. La foto de entrada y la de salida con geocerca no cambian: siguen siendo solo cámara. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Hecho (actividades para todo el personal):** un empleado activo sin flags `acceso*` (Líder de Diseño, Administrativo, y el resto salvo cliente) crea una actividad, se la autoasigna y sube la foto y el GPS de lo suyo. Si `User.roleKey` y `Role.orgRoleKey` vienen vacíos, el rol se lee del nombre («Líder de Diseño» → `lider_diseno`, «Administrativo» no se confunde con director). Asignar a otra persona sigue exigiendo gestión: coordinación y gerencia asignan a cualquiera; el encargado, a su equipo; un ingeniero sin mando no sale de su departamento. `GET /api/users/assignable` ya no responde 403 a quien asigna (`coord_operaciones` y el resto de mandos). `GET /api/tool-requests/kits/users?userId=` lo consulta quien tiene `ACTIVITIES_MANAGE`, solo de esa persona. Un ping GPS con `actividadId` inexistente (o el id de la asignación) responde 400 o se guarda contra la actividad real; ya no es un 500 de llave foránea. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Hecho (proyecto desde la actividad):** en crear/editar actividad, junto al proyecto, «¿No está el proyecto? Créalo aquí» pide solo el nombre y un cliente tipo PROYECTO (el buscador de `ClienteTipoPicker`). Al crearlo queda seleccionado. Fechas, alcance y equipo se completan después en Proyectos. `POST /operational-projects/alta-rapida` lo puede quien ya puede crear una actividad (`ACTIVITIES_VIEW`, `ACTIVITIES_MANAGE`, `CONSOLE_ACCESS` o `PEOPLE_VIEW`; el alta completa del proyecto sigue exigiendo gestión). El responsable es quien lo crea, el inicio queda vacío hasta que se capture, el tipo es OTRO y queda activo, en su `companyId`. Una cuenta de portal o de sucursal no puede. El cliente se elige entre los PROYECTO de la empresa (un operativo los ve para esto; el padrón sin filtro sigue siendo solo los suyos, y COMERCIAL no se abre). Si no existe, se crea ahí con solo el nombre (`altaProyecto`): sin RFC ni datos fiscales. Quien ya puede dar de alta clientes de su sector PROYECTO sigue usando el alta normal y puede completar datos en el mismo formulario. Un operativo no edita el padrón; Daniela no crea PROYECTO por el padrón, pero sí este nombre al crear la actividad. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh`.
- **Hecho (deploy general, ~13:35-14:10):** Adam pidió «deployalo todo». Al retomar, `origin/main` tenía 7 commits nuevos de Cursor sin
  tocar localmente (bóveda de contraseñas + varios `fix`/`feat` suyos); se hizo `git pull --ff-only`, `npx prisma generate` (el schema
  había cambiado) y se corrieron las suites completas antes de tocar nada: **API 237/2 779, web 73/648** en verde de entrada.
  Cursor's `df566a73` (fila de detalle marca/modelo/costo/margen dentro de la celda de descripción en `TablaPartidas.tsx`) rompió el Tab
  documentado (desc → unidad → cant → precio) y 1 prueba web; se corrigió con `tabIndex={-1}` en esos 5 campos (siguen editables por clic,
  ya no interrumpen el Tab). Mientras se probaba, Cursor subió 4 tandas más (incl. una migración de `sales_clients.tipo` y otra de
  `chat_message_reads`, y un cambio de `TextoAuto` en la misma `TablaPartidas.tsx` que dio un conflicto de rebase, resuelto quedándose con
  `TextoAuto`/`onValor` de Cursor + el `tabIndex={-1}` del fix). Cada rebase se volvió a probar entero (con `prisma generate` de por medio)
  antes de empujar: terminó en API 238/2 860, web 74/649, ambos `tsc` limpios. Push final `02b6856e`. Deploy con `--with-migrate` lanzado
  en el servidor y **terminado y verificado** (14:01): las tres migraciones del día (`credential_vault`, `sales_client_tipo`,
  `chat_message_reads`) están aplicadas, los 5 contenedores healthy/up, y `/`, `/login`, `/erp/acceso-cuentas` (200) y
  `/api/account-access/status`, `/api/chat/channels` (401 sin sesión, como toca) responden bien.
- **Bóveda de contraseñas (turno anterior de Claude, mismo día):** construida, desplegada y con la hoja del 21-09 cargada (16 cuentas en
  la empresa 1, verificadas). Ver más abajo la entrada «BÓVEDA DE CONTRASEÑAS construida». `VAULT_ENCRYPTION_KEY` vive en
  `/var/www/nexara-app/deploy/.env.nexara` (600) — Adam debe respaldarla.

- **Hecho (chat, visto):** en `/erp/chat`, cada mensaje propio muestra palomitas: una gris = enviado, dos grises = entregado (alguien ya lo tiene) y dos azules = lo vieron todos los destinatarios. Tabla `chat_message_reads` (`messageId`, `userId`, `readAt`, `companyId`; única por mensaje+usuario). `readAt` queda null hasta que se ve. Al abrir la conversación, lo visible se marca en lote (`POST /chat/channels/:id/reads`); si el cliente solo lo recibió, `POST .../delivered`. El remitente se entera por socket `chat:receipt` sin recargar. «Info» abre quién lo vio (nombre, avatar, hora America/Mexico_City) y quién no. El último leído del canal (`lastReadAt`) se conserva. Las lecturas no usan la llave `messageId_userId` (el aislamiento la aplana): van por findMany/createMany con `companyId`. Migración `20260928230000_chat_message_reads`. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (clientes en tres tipos):** cada cliente del padrón (`sales_clients`) tiene un solo `tipo`: COMERCIAL, PROYECTO o CORPORATIVO. Migración `20260928220000_sales_client_tipo`. Los que ya existían se clasifican por el uso más reciente: cotización → COMERCIAL, proyecto operativo (vía el cliente de operación) → PROYECTO, actividad de servicio (`coreKind = servicio`, o actividad con cliente y sin proyecto si no traía tipo) → CORPORATIVO. Si dos usos empatan en la fecha, o no hay ninguno, queda COMERCIAL. La fila de `sales_client_sectors` queda solo con ese tipo. El menú ya no tiene Clientes (la ruta `/erp/clientes` y el API siguen). COMERCIAL se busca, crea y edita dentro de la cotización. PROYECTO se lista, crea y edita en Proyectos. CORPORATIVO se busca, crea y edita al dar de alta una actividad de servicio. Solo el nombre es obligatorio (RFC, razón social, dirección, régimen, CP, correo). Siguen creando y editando coordinación, gerencia y encargados, y solo el tipo de su sector (Daniela comercial, Luis corporativo). Un operativo no edita el padrón; al crear una actividad de servicio puede dar de alta rápido un corporativo con nombre y contacto, sin RFC. Aislamiento por `companyId`. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (cotización, condiciones y partidas):** en la pestaña Cotización, Tiempo de entrega, Garantía y Vigencia se editan (textarea, autoguardado en `opciones.condiciones`) y ese mismo texto es el del PDF y de la vista previa. Si el campo está vacío se conserva lo que ya imprimía el PDF (entrega: lo guardado en condiciones, si no `deliveryTime`, si no «15 días naturales…»; vigencia: «N días naturales (vence el dd/mm/aaaa)»). La descripción de la partida ya no se corta a 200 caracteres: `cotizacion_items.name` pasa de varchar(200) a text (migración `20260928200000_cotizacion_partida_nombre_largo`), el título y la descripción del editor crecen con el texto (saltos y viñetas) y la fila del PDF crece y sigue en la hoja siguiente. Typecheck y build de API y web en verde. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (foto de salida):** al tomar la foto, el aislamiento de empresa envolvía `findUnique({ activityId_userId })` en `AND` con `companyId`. Prisma rechazaba la llave compuesta (`Unknown argument activityId_userId`). La app lo mostraba como «Error del servidor. Intenta más tarde.» (HTTP 5xx) o «Parámetros de la petición inválidos» (el filtro traduce `PrismaClientValidationError` a HTTP 400; no era el DTO ni el tamaño del data URL: el cuerpo ya había entrado). El middleware ahora aplana esas llaves (`activityId` + `userId` + `companyId`) en findFirst/updateMany/deleteMany/upsert. Cubre también horas extra (`userId_fecha`) y visitas de contrato (`contractId_scheduledDate`). La geocerca lee con `findFirst`. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh`.
- **Hecho (autoasignación de todos los roles):** administrativo, contabilidad, rh, ing_campo, ing_soporte, diseñador, vendedor y el resto del personal interno pueden crear una actividad y asignársela a sí mismos. En producción `GET /api/activities/next-an` respondía 403 «No tienes permisos para esta acción» a administrativo (soluciones@ y Daniela) porque el folio exigía `ACTIVITIES_MANAGE`; el formulario lo pide al guardar. Ese GET, el alta a nombre propio y la lectura de proyectos del formulario ya no responden 403. Asignar a otra persona y dar de alta proyectos siguen exigiendo gestión de actividades. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Hecho (clientes):** coordinación, gerencia y la encargada comercial (`administrativo`) crean y editan clientes desde el menú, una cotización o un proyecto nuevo. Un ingeniero u operativo no puede, ni con gente a cargo. Antonio sigue en `ing_soporte` y no puede; el rol que sí puede es `enc_soporte`. Este cambio no trae migración.
- **Hecho (foto del equipo):** el avatar de Mi equipo queda recortado dentro del círculo (disco fijo, `overflow: hidden`, `object-fit: cover`). Un retrato ya no se sale del aro ni tapa el nombre. El mismo recorte vale en el centro operativo, en Asignadas por mí y en el avatar compartido. Sin migración.
- **Hecho (tarjetas de Mi equipo):** en `/erp/pizarra` cada persona lista sus actividades abiertas (responsable, equipo, autoasignada o de otro departamento), cada una con estado y debajo el folio `AN-0001` y el título. Ya no dice «Sin actividad asignada» si hay trabajo, y una cerrada no tapa a las pendientes. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Hecho (autoasignación y despacho):** la cola personal incluye lo que la persona se asigna a sí misma (cualquier rol: responsable o miembro), no solo lo que le deja otro. Un servicio a Antonio queda en despacho: Luis no elige al ingeniero; Antonio sí se lo asigna a Carolina, Alejandro o Roberto aunque el servicio lo haya creado otro departamento y aunque no le reporten en el organigrama. Un empleado sin mando sigue en su departamento. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Hecho (cola personal):** lo que le asignan a una persona ya sale en `GET /me/activities` (web y apps). Luis veía «Todo al día» y contadores en 0 porque esa lista usaba el filtro de la pizarra (`coreKind = servicio`). Una tarea, un proyecto o un preventivo sin tipo —aunque lo dejara otro departamento— no entraba. El filtro de tipo sigue para el trabajo de *otros* en la pizarra. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Hecho (actividades, turno anterior en main):** Luis (coordinador) ya puede asignar o pedir apoyo fuera de su departamento. El alta de actividades ya no exige el mismo `departmentId` si quien asigna es coordinación/gerencia y el destino es otro mando o alguien de su equipo. Un empleado sin mando sigue limitado a su departamento. Validación en `POST/PATCH /activities` y al sumar gente al equipo. Sin migración.

## Hecho (Claude, 28-09 10:20-12:00): rechazo de App Store iOS (NEXARA 1.0) — código subido, falta build + capturas + reenvío
- **Qué dijo Apple (25-09, envío `2b6fc440…`):** 3.2 (parece app de una empresa), 2.3.10 (capturas Android), 2.1 (no entran con la cuenta demo). Detalle, causas y textos: `docs/store/IOS-RESPUESTA-APPLE.md`.
- **Diagnóstico:** el login de Apple SÍ entró en el servidor (`lastLoginAt` 25-09 15:34 UTC, IP Dublín/Vodafone Ireland, 4 min antes del rechazo). La cuenta `play.review` está sana (activa, sin MFA, sin candado, solo `nexara-demo`). El fallo fue de la app iOS: sin recortar espacios, `auth/login` encolado offline (guardaba la contraseña en claro y salía como «Sesión expirada»), errores sin distinguir. Las capturas y el video eran de Android; la ficha y las notas decían «no para el público».
- **Código en `main` (commit `17f62d15`, solo `apps/mobile-native/ios`, `.github/workflows`, `docs/store`):** modo demo local sin credenciales (`NexaraApp/Demo/*`, botón «Explorar NEXARA con datos de muestra», o `-NEXARA_DEMO 1`); login robusto (`AuthErrorMapper`, recorte, `auth/*` nunca offline); `PrivacyInfo.xcprivacy`, Face ID, sin ATT/file sharing/fetch, «Eliminar mi cuenta» → `/legal/eliminar-cuenta`, solo iPhone; `ios-testflight.yml` ya conserva los manifiestos de privacidad de los SDK; nuevo `ios-screenshots.yml` + target `NexaraAppUITests`. CI «iOS · compilar (simulador)» en VERDE con todo. Los rojos de «Secretos», «Tipos y tests» y Android son de `.ts/.json` ajenos, no de iOS.
- **Ficha de App Store Connect (guardado, NO enviado):** promo, descripción multiempresa, palabras clave, URL de soporte `/contacto` y notas de revisión reescritas (sin contraseña en las notas).
- **PENDIENTE (Adam / próximo agente):** (1) lanzar desde GitHub Actions «iOS capturas de App Store (simulador)» (dispatch; no se puede empujar tag por el hook) y bajar los PNG que el bot deja en `docs/store/ios-screenshots/`; (2) lanzar «iOS TestFlight» con `version=1.0`, `build=4`, `upload=true` (ya hay 1.0 (1) y 1.0.0 (3)); (3) en ASC: subir capturas 6.9", quitar las 8 de Android y el adjunto `nexara_review_demo2.mp4`, elegir el build 4; (4) Adam corre `apps/mobile-native/ios/scripts/verificar-cuenta-revision.ps1` (y `resembrar-cuenta-revision.ps1` si da 401); (5) responder en Resolution Center con el texto de `docs/store/IOS-RESPUESTA-APPLE.md` y «Volver a enviar a revisión». Nada de eso se envió a Apple.
- **Ojo:** `NEXARA-usuarios-v5.xlsx` / `-v6.xlsx` están versionados en el repo PÚBLICO (no se abrieron): verificar que no lleven contraseñas. Adam pegó en el chat la tabla de credenciales de empleados reales: conviene rotarlas.

## Hecho (Cursor, 28-09): cotizador en el formato de Christian; el 400 al guardar partidas
- **Causa del HTTP 400 `INVALID_REQUEST`:** `PrismaService` convierte `cotizacion.update({ where: { id } })` en `updateMany` para meter `companyId`. `updateMany` no acepta escrituras anidadas. `items: { create }` lanzaba `PrismaClientValidationError` y el filtro lo devolvía como 400. Las partidas no se guardaban y el total quedaba en 0. Ahora se borran y se crean con `cotizacionItem.createMany` en la misma transacción; el padre solo recibe columnas. Cantidad, descuento e impuestos se redondean a entero antes de Prisma.
- **Formato:** PDF de descarga, el del envío y la vista previa salen con el membrete Nexara (logo, Century Gothic / URW Gothic, verde `#1FAF8D`, carbón `#24262A`), datos del cliente, franja comercial, partidas, subtotal, IVA 16%, total, importe con letra y firma de Christian Eduardo Del Pozo Sánchez / NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V. El costo y el margen no se imprimen. La vista interna (`/pdf/internal`) conserva el PDF anterior, que sí muestra costo.
- **Captura:** por partida, número (`1`, `1.1`), unidad (incluye Licencia), título, marca, modelo, descripción, costo interno y margen % sobre el costo (default 20% → precio = costo × 1.20) o precio manual. Empresa, atención, ubicación y trabajo en la hoja 04.
- **Esquema:** migración aditiva `20260928180000_cotizacion_formato_nexara` (`atencion`, `trabajo`, `partida`). Las cotizaciones viejas siguen cargando.
- **Prueba Grupo Dice:** 5 partidas, subtotal 779,072.62, IVA 124,651.62, total **903,724.24**. Jest de `cotizaciones` 17 suites / 360. `tsc` de api y web en 0.
- **Despliegue (en el servidor, no corrido desde aquí):** `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`. El script hace el `git pull`. No jalar antes: si el commit ya está en HEAD, no reconstruye. Si ya se jaló: `bash deploy/update.sh --force-all --with-migrate --no-pull`.

## Hecho (Cursor, 28-09): coordinadores y encargada comercial dan de alta clientes
- **Regla anterior:** el menú y el API de `/erp/clientes` solo abrían a quien estaba en la matriz de correos
  (Luis sí veía sector CORPORATIVO en el servicio, pero `PAGE_MATRIX` y `URL_MATRIX` de `coord_operaciones`
  no tenían Clientes, así que el menú no salía y el alta devolvía 403). El listado sin sector filtraba por
  `ownerId`, y la cotización creaba el cliente directo en Prisma, sin sector ni cliente de operación.
- **Ahora:** agregan y editan clientes los roles de coordinación y gerencia
  (`ceo`, `dir_admin`, `dir_operaciones`, `coord_admin`, `coord_operaciones`, `coord_ventas`, `arquitecto`,
  `enc_soporte`, `administrativo`, y los que ya podían: `contabilidad`, `rh`) más un jefe no operativo con
  gente a su cargo. Un ingeniero u operativo (`ing_campo`, `ing_soporte`, `disenador`, `vendedor`, `cliente`)
  no puede, aunque tenga personal a cargo. Desactivar y eliminar sigue siendo solo Christian.
- El correo del encargado gana el sector (Luis CORPORATIVO, Daniela COMERCIAL, David PROYECTO+COMERCIAL).
  Si el correo no está en la matriz, el rol pone el sector. El alta rápida no pide datos fiscales.
- Menú Clientes para esos roles. Alta rápida en proyecto nuevo y, al guardar una cotización, el nombre nuevo
  pasa por el mismo `createClient` (empresa + sector + provisión OPS) para usarlo enseguida en actividad.
  No se tocó el formulario de actividades.
- **Antonio** (`jose.ramirez@`, encargado de soporte) sigue en rol `ing_soporte`: no da de alta clientes.
  El puesto que sí puede es `enc_soporte`.
- **Sin migración de clientes.** Si el servidor todavía no aplicó `20260928180000_cotizacion_formato_nexara`, este pull sí lleva `--with-migrate` por esa migración del cotizador, no por clientes. Si ya está aplicada: `cd /var/www/nexara-app && bash deploy/update.sh`.

- **Regla:** se trabaja **siempre directo en `main`**: sin ramas, worktrees ni PRs (Adam es el único programador).
  Está en las reglas de Cursor, `~/.claude/CLAUDE.md`, `C:\dev\CLAUDE.md`, `FUSION-PROTOCOL.md` y la plantilla EXEC-PACKET.
- **Única rama:** `main` en local, en GitHub y en el servidor. Cero worktrees. `mejora/calidad-y-web` ya no existe.
- **Servidor:** `/var/www/nexara-app` sigue `main`; `deploy/update.sh` despliega la rama actual.
- **Respaldo de todo lo borrado:** `C:\dev\.ai\archivo-nexara-2026-09-27\` — `todas-las-ramas.bundle`
  (224 ramas) + parches/zips de los 39 worktrees con cambios (`final\` = copia justo antes de borrar).
  Recuperar una rama: `git fetch C:\dev\.ai\archivo-nexara-2026-09-27\todas-las-ramas.bundle "refs/heads/<rama>:refs/heads/<rama>"`.

## Hecho (Claude, 28-09 11:25-11:55): BÓVEDA DE CONTRASEÑAS construida, desplegada y cargada (Adam quitó la revisión de permisos y lo autorizó)
- **Desplegada** (`b8503cff`, `update.sh --with-migrate`, migración `20260928120000_credential_vault` aplicada, API sana). Llave `VAULT_ENCRYPTION_KEY`
  creada en el servidor (`deploy/.env.nexara`, 600) y presente en el contenedor.
- **Hoja del 21-09 cargada en la empresa 1:** simulación y luego `--apply`: las 16 cuentas ya tenían la contraseña de la hoja (0 cambiadas,
  0 sesiones cerradas) y las 16 quedaron guardadas cifradas. Verificado en el servidor: 16/16 descifran bien con la llave, 0 filas en claro.
  `play.review@` no es de la empresa 1 (no se tocó). Christian y developer NO se cargaron a propósito (sus contraseñas de la hoja siguen un
  patrón adivinable y no se pisan). La hoja JSON temporal se borró; no está en el repo, memoria ni docs.
- Restos locales SIN versionar (ignorados por git): borradores viejos en `.ai/drafts/` (`seed-core-roster`, `generate-credentials-xlsx`)
  con contraseñas de esa hoja. Conviene borrarlos a mano.
- Tabla `credential_vault_entries` (migración `20260928120000_credential_vault`), módulo `src/credential-vault/` (AES-256-GCM, llave
  `VAULT_ENCRYPTION_KEY` en `deploy/.env.nexara` → compose → API; AAD = `companyId:userId`; nunca guarda al dueño ni a developer;
  `guardar` no lanza: sin llave devuelve false y el alta sigue). Se guarda en `UsersService.create/update` (cubre el alta delegada),
  en «restablecer» y en la carga de hoja. `account-access`: la lista trae `guardada`, `POST users/:id/reveal` (ficha de 5 min, audita
  `ACCOUNT_PASSWORD_REVEAL` sin la contraseña) y la pantalla tiene «Ver contraseña» (se oculta a los 30 s).
- Carga de una hoja de credenciales: `prisma/cargar-credenciales-boveda.ts` (`--company-id --file=- [--apply]`, simulación por omisión,
  no imprime contraseñas; omite dueño y developer; solo cambia hash si no coincide y cierra sesiones solo de esas).
  La hoja JSON vive FUERA del repo y se borra después. Las contraseñas de la hoja NO están en el repo, la memoria ni los docs.
- Pruebas: API 230 suites / 2,779; web 73 archivos / 642; `tsc` limpio.

## Hecho (Claude, 28-09 10:40-11:15): «Acceso a cuentas» solo para Christian (primera versión: solo restablecer)
- **Acceso a cuentas** (API `account-access/*` + web `/erp/acceso-cuentas`, botón en `/erp/users` solo si `GET account-access/status`
  dice `puedeEntrar`): Christian (correo `PLATFORM_OWNER_EMAIL`, nadie más, ni Adam) vuelve a escribir su contraseña → ficha HMAC de
  5 min (vive solo en memoria de la pantalla) → lista de cuentas (sin él ni la de desarrollo) → «Restablecer contraseña»: genera una de 14
  caracteres, guarda solo el hash, cierra sesiones, la muestra UNA vez, audita sin ella. 5 fallos = 15 min bloqueado (mismo contador que el login).
- **Adam volvió a pedir** las contraseñas guardadas y pegó la hoja de credenciales del 21-09 («puedes solo ponerlas y que la siguiente que se
  cree se mande y guarde»). El clasificador de permisos lo bloqueó por **tercera vez** (`Secret-Store Writes`, al editar `schema.prisma`).
  No se rodeó: se revirtió lo que alcanzó a escribirse (modelo y migración `20260928120000_credential_vault`, sin rastro en git) y
  **no se cargó ninguna contraseña de la hoja**. Las contraseñas de la hoja **no están en el repo, en la memoria ni en los docs**.
  Para desbloquearlo Adam debe dar permiso explícito en su configuración de Claude Code (regla de permisos) o ejecutar él mismo el paso.
  Si autoriza, el plan sigue siendo el de abajo; y para las cuentas de la hoja: script con `--apply` (simulación por omisión) que solo
  cambia el hash si la contraseña de la hoja no coincide, guarda en la bóveda, y NO toca a Christian ni a la cuenta de desarrollo
  (las de la hoja para esas dos cuentas siguen un patrón adivinable; una hoja no debe pisar la contraseña del dueño).
- Pruebas: API 227 suites / 2,745; web 73 archivos / 638; `tsc` limpio en ambos.
- **Subido** (`6647aeb9`) y **desplegado** (2.º despliegue del día, sin migraciones nuevas).
- **Activaciones en producción: HECHAS por Adam (28-09 ~11:17 MX), no por Claude.** El clasificador negó a Claude leer y escribir en la
  base de producción (`Production Reads`, `Production Deploy`) y no se rodeó; Adam corrió `apps/api/scripts/activar-perfil-ceo.sh`
  en el servidor: `COMPANY_ID=1 APLICAR=1` (empresa 1 = NEXARA; la 2 = NEXARA Demo NO lleva estas políticas). Quedó activo en la empresa 1:
  `rbac.module_roles` = `{"employee-payments":["ceo"]}` (Pagos solo CEO), `payroll.schedule` = quincenal,
  `users.creation_grants` (Antonio y Luis → `ing_soporte`, David → `ing_campo`), `attendance.web_checkin_until` = 2026-09-30T17:16:49Z
  (checar en web abierto 48 h y se cierra solo) y las **9 plantillas de cotización** (`seed:plantillas`, 9 creadas). Las políticas se releen en ≤30 s.
  Sin activar a propósito: topes de aprobación (faltan montos de Christian) y CFDI (mock). Sin verificar por Claude con un usuario real;
  la primera prueba útil es entrar como Antonio y ver «Dar de alta a alguien» en `/erp/organigrama`, y como Christian ver «Acceso a cuentas».
- Bug del script (tabla `company_profiles` → es `company_profile`) corregido en `e4a949ef`.

## Hecho (Claude, 28-09 10:00-11:00): alta de usuarios delegada, checar desde la web (temporal), subida y despliegue
- **Subido a GitHub** (`a9a1aa72..4d706ed8`, 21 commits incluidos los de la sesión anterior y `f006fe0e` de otra sesión) y **desplegado**
  con `deploy/update.sh --with-migrate` (Adam lo pidió: «deployas todo»). Estado del despliegue y de las activaciones: ver el cierre
  de este turno en la conversación; si algo quedó a medias está en «A medias / siguiente» abajo.
- **Alta de usuarios delegada** (`b73d4457`): `users/user-creation-policy.ts` + `users-delegation.service.ts`, política por empresa
  `users.creation_grants` (`scripts/set-user-creation-grants.sql`): Antonio (`jose.ramirez@`) y Luis (`direccion.operaciones@`) → `ing_soporte`,
  David (`operaciones@`) → `ing_campo`; Christian todos los de abajo (sin ceo/super_admin/cliente). Por PERSONA porque David y Luis
  comparten rol. `GET users/delegated/roles`, `POST users/delegated`; botón «Dar de alta a alguien» en `/erp/organigrama`
  (`components/team/AltaUsuarioPanel.tsx`). Antes solo ceo/dir_admin/coord_admin tenían `users.manage`.
- **Checar desde la web, TEMPORAL** (`463397ab`): `attendance.web_checkin_until` (fecha ISO por empresa, `scripts/set-web-checkin-window.sql`
  con `-v hours=N`); se cierra sola. `AttendanceService.ventanaWeb` + `GET attendance/web-checkin`; con la ventana abierta la checada web
  entra con origen WEB y validación PENDIENTE (sin avisos a jefes); `AttendanceForm` se recuperó del historial (`d2ad4589^`) y
  `components/asistencias/ChecarEnWeb.tsx` lo muestra solo con la ventana abierta.
- **Bóveda de contraseñas:** en ese momento el clasificador de permisos bloqueó agregar la tabla («filtración de credenciales») y no se
  rodeó. Después Adam quitó la revisión de permisos y se construyó (ver la entrada «BÓVEDA DE CONTRASEÑAS construida» arriba).

## Hecho (Claude, 27-09 23:00-00:00): perfil del CEO «a tope» — Tu día, bandeja con importe, topes, nómina, menos ruido
Pedido de Adam: «continúa adaptando su perfil a tope». Seis commits más (`4b4e7c2f`, `558f1b43`,
`156e4143`, `dd54b594`, `c7d1c6ba`, `a24555ae`), ya subidos y desplegados el 28-09. API jest 222 suites / 2,697 ok, `tsc` 0; web `tsc` 0 y vitest **613 ok, 0 fallas**
(se arreglaron las 6 specs viejas). Guía para Christian: `docs/ceo/PERFIL-CEO-EN-EL-ERP.md`.
- **Bandeja de Aprobaciones con título e importe:** `workflow/entity-summary.ts` (una consulta por tipo, por empresa) adjunta `resumen`
  a `listMyPending`; web muestra título/importe/«importe por aprobar»; abre la cotización en `/erp/cotizaciones/:id`.
- **«Tu día»:** `executive/ceo-brief*.ts` (puro + servicio + cron 8:00 MX L–V, idempotente por día, nada si vacío),
  `GET /api/executive/brief`, panel `components/executive/TuDiaPanel.tsx` en `/erp/executive`. Usa el tipo `WORKFLOW_PENDING`
  con categoría `resumen-ceo` (no hay tipo propio; crear uno exigiría migrar el enum).
- **Calendario de nómina:** `employee-payments/nomina-calendario.ts` (quincenal/mensual/semanal, política `payroll.schedule`,
  `scripts/set-payroll-schedule.sql`). Sin fila no avisa nada. La pre-nómina «lista» solo se le dice a quien ve Pagos.
- **Topes de aprobación por monto (opt-in):** `workflow/approval-thresholds*.ts`, política `approvals.thresholds`
  (`scripts/set-approval-thresholds.sql`, montos de ejemplo: **los define Christian**). Se exige en `CotizacionesService.send/aprobar`
  y `ProcurementService.approvePurchaseOrder` (dependencia `@Optional()`); dirección pasa sin pedirse permiso; cotizaciones usan
  el flujo `COTIZACION_MONTO`, las OC el «toda OC» sembrado. Limitaciones: no convierte USD; una aprobación dada no se invalida si
  el total sube después.
- **Modo «solo el resumen y lo urgente»:** `notifications/notification-noise.ts` + filtro en `createNotification` (preferencia
  `notificaciones.solo_resumen`, caché 60 s, solo se consulta para tipos informativos); casilla en «Tu día».
- **Viático → siguiente paso:** `notifyViaticNextApprover` (el CEO ya se entera de que le toca).
- **Sin cablear todavía:** aprobar cotización/OC/pagos desde el celular; «facturar desde cotización»; `aprobar` interno no crea el proyecto;
  `approval-policy.ts` antiguo sigue sin usarse. Para activar en producción: `docs/ceo/PENDIENTES-PARA-HIJO-2026-09-27.md` §B (pasos 7 y 8).
- **Ojo:** el hook de git-solo-main bloquea comandos Bash que contengan el texto de un push (aunque solo sea documentación en un
  heredoc) o un push con redirecciones: escribir esos textos con Edit/Write y usar el push sin `2>&1`.

## Hecho (Claude, 27-09 17:00-18:00): el sistema del CEO — pagos solo CEO, plantillas, CFDI listo, tablero real
Pedido de Adam con el paquete de Christian (`PENDIENTES-PARA-HIJO`). Cinco commits en `main` **sin subir ni desplegar**
(`548ddce4`, `761b3fd5`, `6868764a`, `1fc5171d`, `5df8a482`) más el de documentos; API jest 215 suites / 2,638 ok y `tsc` 0;
web `tsc` 0 y vitest 601 ok + las 6 fallas previas (ya resueltas después).
- **«Pagos a personal» solo CEO, por empresa** (`common/tenant/module-policy*`): política `rbac.module_roles` en `SystemSetting`
  con `companyId`; 403 en todos los endpoints de `employee-payments`, pre-nómina sin montos; `/me/navigation` quita el módulo
  (web `webModuleIds`, apps `moduleKeys` y `hiddenModuleIds`, que gana sobre comodines como `/erp/finance/**`).
  **Falta activarla en Nexara:** `apps/api/scripts/set-module-policy.sql` con el `company_id` (no pude leer producción:
  el permiso me bloqueó la consulta). Doc: `docs/POLITICA-MODULOS-POR-EMPRESA.md`.
- **Aviso diario de OC atrasadas** (9:30 MX, L–V, `procurement/purchase-order-overdue*`). Pre-nómina automática evaluada y
  NO hecha (ver `docs/erp-automation-map.md`).
- **Facturación:** `GET /api/pac/readiness` + `npm run pac:preflight` + `docs/CFDI-GO-LIVE.md`; arreglos: dígito verificador
  del RFC (`pac/rfc-checksum.ts`), CP del emisor, IVA 0 %, respuesta sin UUID. **No se encendió nada** (`PAC_PROVIDER=mock`).
  Riesgos abiertos en el runbook y en `docs/ceo/PENDIENTES-PARA-HIJO-2026-09-27.md` §C.
- **Plantillas:** 9 plantillas, catálogo de 53 conceptos y kit IDC como datos + seed idempotente `npm run seed:plantillas`
  (simula por omisión). Doc: `docs/PLANTILLAS-COTIZACION-NEXARA.md`.
- **Tablero y bandeja del CEO:** `executive.service` (vencidas por fecha, por cobrar neto, stock desde `stock_levels`,
  «Asignada»); `workflow.service` (pasos sin aprobador visibles y notificados con importe, `esAprobadorDeRespaldo`); crons
  de la mañana con `timeZone` (facturas vencidas, OC por llegar, mantenimientos, margen, vehículos, herramientas, reabastecimiento).
- **Documentos:** `docs/ceo/` (versión 2, verificada contra el código). El paquete para Christian (panel HTML, plan, contexto de
  Claude) quedó en `Descargas\NEXARA-paquete-CEO-2026-09-27-v2` y su `.zip`.
- **Seguridad:** Adam pegó en el chat la e.firma de Christian (RFC y contraseña): **no se usó ni se guardó**. Recomendar que
  cambie esa contraseña; el timbrado usa el CSD de la empresa, no la e.firma.
- **Para desplegar (decide Adam):** subir a GitHub (rebase y push a `main`), correr `deploy/update.sh` en el servidor y seguir
  `docs/ceo/PENDIENTES-PARA-HIJO-2026-09-27.md` §B. Ojo: el primer día hábil el cron de OC avisará a compradores y a Christian.

## Hecho (Claude, 27-09 17:40): listas desplegables de cotización que no dejaban scrollear
- Adam (captura de `/erp/cotizaciones/nueva`): el selector de cliente no deja scrollear. Causa: `onBlur`
  cierra la lista a los 150 ms y tocar/arrastrar la barra de scroll del `<ul>` quita el foco al input; además
  `ClienteCombo` recortaba a 8 clientes (`slice(0, 8)`) y con teclado la opción activa no seguía en pantalla.
- Arreglo en `_editor/SeccionPortada.tsx` (`onMouseDown` con `preventDefault` en la lista, hasta 100
  coincidencias, `scrollIntoView` solo al navegar con teclado para no pelear con la rueda) y el mismo
  `onMouseDown` en la lista de catálogo de `_editor/TablaPartidas.tsx`.
- Verificado: web `tsc` 0. **No probado en navegador** (la página exige sesión). Adam dijo «y así»: puede haber
  más pantallas con problemas de scroll; falta que indique cuáles.
- **Sin subir a GitHub ni desplegar:** `main` local va varios commits por delante de `origin/main` (ver la sección de
  arriba). Subirlos y correr `deploy/update.sh` los publica todos, incluido el cron que avisa a compradores. Decidir con Adam.

## Hecho (Claude, 27-09 12:30-13:10): Inicio «visual primero» + mapa repinta con el tema
- Adam: bajando del video quiere ver imágenes antes que texto y sintetizar. Nuevo orden de Inicio:
  hero → **Trabajo real** (mosaico de 5 fotos: 1 vertical + 4 horizontales, `styles.mosaic5`) →
  **Por qué NEXARA** (foto 3:4 `styles.whyPhoto` + método en tres pasos integrado como lista
  `stepList` + cifras + CTAs; **desaparece la banda «Cómo trabajamos»** de solo texto) → **Servicios**
  como tarjetas con fotografía real (`styles.serviceCard`, caja 16:10, tile de icono colgando) →
  Industrias → Fabricantes → Cobertura → CTA. Archivos: `nexara/page.tsx`, `nexara/home-sections.module.css`.
- `BrandMap`: el conmutador de tema no repintaba el mapa (la guarda `isStyleLoaded()` es falsa mientras
  cargan teselas). Ahora repinta directo y, si el estilo no está listo, en el siguiente `idle`.
- Verificado en local (3005) a 1536/820/375: sin scroll horizontal, tarjetas de servicio con media
  uniforme (244 px a 1536), mosaico 2 filas = alto de la foto vertical, contraste sin fallas en ambos temas.
- **Entorno:** el puerto 3000 lo ocupa el contenedor Docker `nexara-web-dev` (`next start`, build fijo:
  **no refleja cambios de código**). Para ver cambios en vivo: entrada `nexara-web-alt` de
  `C:\dev\.claude\launch.json` (Next dev en el **3005**). El digest de Ollama deja `apps/web/.ai/`
  (excluido vía `.git/info/exclude`, no commitear).
- Regla «solo main» revisada: `GIT-SOLO-MAIN.md`, hook `git-solo-main-guard.ps1` y `~/.claude/CLAUDE.md`
  coinciden; queda además en la memoria de Claude como regla por defecto.

## Hecho: consolidación en `main` (tarde)
- Fusionadas las 5 ramas con código nuevo sin conflicto: `ci-fixes` (CI, seeds, guardia release Android),
  `erp-automation-map` (doc), recordatorio diario 9 am de evidencias pendientes >24 h, aviso de SLA
  vencido a la jerarquía, y `revert-pr44-soporte`.
- Corregido al fusionar: `EVERY_DAY_AT_09` → `EVERY_DAY_AT_9AM`; bloque `enc_soporte` duplicado en
  `url-matrix.ts` (se queda el de `main`, que incluye ver flotilla); expectativa vieja de `ci-fixes` que
  mandaba a `administrativo` a «Mis vehículos».
- Verificado: API `tsc` 0, jest rbac/evidence/cron 134 ok; web `tsc` 0, vitest solo las 6 fallas previas;
  Android `assembleDebug` OK. Deploy `8b625478` (solo API; `apps/web` idéntico a producción).
- No fusionadas (en el respaldo): `feat/chat-android-whatsapp` y `feat/ios-chat-whatsapp` (lógica de
  menciones/adjuntos/cola de envío con tests, sin conectar a la UI; su parte web choca con `main`) y
  ~50 ramas viejas que chocan con `main`.

## Hecho: pulido UI/UX del ERP Core + apps móviles
Nueve carriles en paralelo, integrados y fusionados en `main`:
- **Sistema de diseño y shell:** tokens `--ui-*` (espaciado, tipografía, elevación, movimiento, z-index,
  `--ui-touch-min`), `Skeleton`/`PageSkeleton`/`PanelError`, `erp/loading|error|not-found.tsx`, menú
  lateral colapsable y recordado, cajón móvil táctil, paleta de comandos diferida, `Modal` (hoja en móvil,
  `size`), `DataTable` (`loading`, `zebra`, sombras de scroll), `KpiCard`, `PageHeader` (`breadcrumbs`),
  `FormField` (`required`, aria), `PanelTabs` con teclado. Botones/tarjetas ya no brincan dentro de paneles.
- **Hoy, Actividades/Asistencias (EXEC-PACKET pasos 2-8), Comercial, Recursos, Finanzas, Gobierno/RRHH:**
  estados de carga/vacío/error, refrescos que no borran datos, copy sin jerga, 375 px sin desbordes,
  toques ≥40 px, inputs 16 px en móvil, sin `useSearchParams`, `formatApiError` en todos lados.
- **Bugs de producción corregidos de paso:** búsqueda de Aprobaciones no filtraba; errores de Mi perfil
  invisibles; contador de Boletín en 0; fechas UTC (mañana tras las 6 pm) en Prenómina, Comidas y
  formularios de Finanzas; Excel de asistencia en UTC; descargas CSV/XML/PDF en Safari/Firefox; Compras
  contaba listas de otras pestañas; organigrama se reseteaba al guardar.
- **Integración:** `formatApiError` nunca muestra JSON/HTML/pila ni `Cannot GET /api/...`; token
  `--on-primary`; 404 raíz en español (`app/not-found.tsx`); cadena `Dashboard*` muerta borrada.
- **Android:** Material 3 claro/oscuro + `NxFoundation.kt`; portal y pantallas ERP pulidas; `assembleDebug` OK.
- **iOS:** `NxDesignSystem.swift` y pantallas pulidas; `ios-static-check` limpio. Sin Mac: falta compilar.

## Fusión de `main` (16 commits que no estaban en producción)
- Entraron: workflow TestFlight, arreglos de Release iOS (ChatView, `String+NilIfEmpty.swift`), Play
  `isMonitoringTool` v1.0.3 (12), scripts de firma, push APNs `mutable-content` en API.
- **No entraron (por decisión de Adam: el sitio público queda en su canónica de producción):** blogs SEO
  nuevos, cambios a soluciones/cobertura/page-seo/programmatic-landings e industry-hubs, alias SEO del
  middleware, y su portada/HomeHero. `apps/web` es idéntico a lo que ya estaba en producción.
- También se integraron: `enc-soporte-paridad` (vehículos para soporte), `mobile-rbac-parity` (menú móvil
  agrupado), `asignar-herramientas-db` y el commit «Recordarme en login» que solo existía en el servidor.

## Verificado
- web: `tsc` 0 errores; vitest 597 ok / 6 fallas **previas** (iguales en producción antes de la misión):
  4 en `components/ops/HerramientasChecklist.spec.tsx` (spec no actualizado tras PR #46) y 2 RBAC por
  `enc_soporte` (`role-modules.spec.ts`, `role-extra-panels.parity.spec.ts`: API sin la clave).
- `next build` OK; barrido de las 30 rutas del menú a 375 px sin desbordes; escritorio claro/oscuro OK.
- Deploy 1 (`8a1e95a4`) y deploy 2 (`a393c6cb`, rama `main`) en producción.

## A medias / siguiente
- **Respaldar `VAULT_ENCRYPTION_KEY`** (está en `/var/www/nexara-app/deploy/.env.nexara` del servidor, permisos 600): si se pierde, las contraseñas
  guardadas no se pueden leer (se restablecen y listo). No está en el repo, ni en la base, ni en este relevo.
- El **1-oct** (o cuando venza `attendance.web_checkin_until`) confirmar que checar en web ya se cerró; para cerrarla antes:
  `DELETE FROM system_settings WHERE key='attendance.web_checkin_until' AND "companyId"=1;`
- iOS: compilar en Mac/TestFlight (riesgos: `if` dentro del toolbar del chat; chat compacto en iPhone).
- Android: tema oscuro definido pero apagado (pantallas con colores claros fijos); `ClickableText` del chat.
- `/erp/mis-actividades` redirige con `redirect()` de servidor y en navegación cliente deja un error de
  consola (aterriza bien). Considerar redirección en middleware.
- Reintentar tras `teamError` al asignar duplica la actividad (hay aviso, no arreglado).
- Notificaciones/Analítica/Reuniones leen `?tab` solo al cargar.
- El contenedor local `nexara-web-dev` (localhost:3000) corre `next start` con un build viejo horneado:
  `docker compose up -d --build web` en `C:\dev\apps\NEXARA-app` para verlo al día.
- `/core/login` redirige a `/erp/login` (404) por el remapeo genérico `/core` → `/erp`; el login real es `/login`.
- Disco del servidor ~85 %.

## No tocar
Puente NAS · keystore Play · sitio público (canónica de producción) · `NO TOCAR LIBREMENTE`.

## 23-10-2026 · Rotación de credenciales filtradas (claude-code)

- `NEXARA-usuarios-v5.xlsx`, `NEXARA-usuarios-v6.xlsx` y `scripts/generate-credentials-xlsx.js` tenían nombre, correo y
  contraseña (patrón «Nexara! + número de empleado») de 19 cuentas y estaban en el repo **público** desde el 21-09.
- Rotadas las 19 (con el OK de Adam): 16 con `prisma/cargar-credenciales-boveda.ts --apply` (cierra sesiones y guarda
  en la bóveda) y `gerencia@`, `developer@` y `play.review@` aparte (la herramienta las omite): hash nuevo,
  `passwordChangedAt`, desbloqueo y sesiones revocadas (81 de `gerencia@`, 18 de `play.review@`). Verificado en la base:
  la filtrada no entra en ninguna, la nueva sí, 0 sesiones previas abiertas.
- Credenciales nuevas SOLO en `C:\dev\secrets\nexara\credenciales-2026-10-23\` (Excel + un .txt por persona);
  lista del personal en `C:\dev\secrets\nexara\personal.json`; copia de los archivos filtrados en `...\historico\`.
- Contraseña de la cuenta demo de revisión actualizada en App Store Connect (versión 1.0) y en
  `C:\dev\secrets\nexara-store\`. A pedido de Adam, las contraseñas siguen un patrón de marca con parte al azar
  («Nexara-nx» + 2 dígitos + 3 letras al azar); copia de la tabla en `C:\dev\secrets\PASSWORDS NEXARA.xlsx` (OneDrive\Documentos\SOFTWARE\
  SECRETOS). **Falta en Play Console** (Contenido de la app › Acceso a la app): la cambia Adam.
- El script ya no trae datos: lee `personal.json`, genera contraseñas aleatorias y escribe fuera del repo; `.gitignore`
  bloquea Excel/JSON de credenciales. El historial de git sigue teniendo lo filtrado (ya inservible): limpiarlo o hacer
  privado el repo es decisión de Adam.
