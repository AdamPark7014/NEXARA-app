"use client";

import React from "react";
import { useTheme } from "./ThemeContext";

const helpContent: Record<string, Record<string, string>> = {
  attendance: {
    superadmin: `Aquí puedes supervisar la asistencia global de toda la organización, revisar entradas y salidas, detectar incidencias y validar cumplimiento de horarios por área.`,
    admin: `Aquí puedes dar seguimiento a la asistencia de tu equipo, revisar marcajes diarios y detectar retrasos o faltas para tomar acciones de control.`,
    ingeniero: `Aquí puedes registrar y consultar tu asistencia diaria, incluyendo entrada, salida y estatus de tu jornada. Revisa tus registros para evitar inconsistencias.`,
    vendedor: `Si tu perfil tiene acceso, aquí puedes registrar y consultar tu asistencia. Si no ves el módulo o tus marcajes, solicita revisión de permisos con tu administrador.`
  },
  "lunch-breaks": {
    superadmin: `Aquí puedes monitorear los breaks de comida de toda la organización. Revisa quién está en break, quién ya regresó y detecta registros fuera de horario para control operativo.`,
    admin: `Aquí puedes dar seguimiento a los breaks de tu equipo en tiempo real. Puedes validar entradas y regresos, revisar evidencias y detectar incidencias de tiempo.`,
    ingeniero: `Aquí registras tu entrada a comida y tu regreso al trabajo con evidencia. Usa este módulo para mantener tu historial correcto y evitar reportes fuera de horario.`,
    vendedor: `Si tu perfil tiene acceso, aquí puedes registrar y consultar tus breaks de comida. Si no ves el flujo de captura o historial, solicita apoyo de permisos a tu administrador.`
  },
  fines: {
    superadmin: `Aquí puedes gestionar y auditar todas las multas de la organización. Puedes crear registros, revisar estatus, filtrar por usuario o motivo y dar seguimiento global a incidencias disciplinarias.`,
    admin: `Aquí puedes registrar multas para tu equipo y consultar el historial de sanciones. Revisa importes, motivos y fechas para mantener control administrativo claro.`,
    ingeniero: `Aquí puedes consultar tus multas registradas, su motivo y estatus. Si detectas un registro incorrecto, repórtalo con tu administrador para revisión.`,
    vendedor: `Si tu perfil tiene acceso, aquí puedes consultar tus multas y su detalle. Si no ves información esperada o crees que hay un error, solicita validación con tu administrador.`
  },
  activities: {
    superadmin: `Como superadmin puedes ver, crear, editar y reasignar cualquier actividad de la organización. Tienes acceso total a todos los registros y puedes exportar información global.`,
    admin: `Como administrador puedes ver y gestionar las actividades de tu departamento. Puedes crear, editar y asignar actividades a los ingenieros bajo tu cargo. No puedes ver actividades de otros admins ni del superadmin.`,
    ingeniero: `Aquí puedes ver y reportar tus propias actividades. Solo puedes editar o eliminar actividades que tú creaste. Si necesitas ayuda, contacta a tu administrador.`,
    vendedor: `No tienes acceso a este módulo. Si crees que es un error, contacta a tu administrador.`
  },
  users: {
    superadmin: `Como superadmin puedes crear, editar y eliminar cualquier usuario. Puedes asignar cualquier rol y acceso.`,
    admin: `Como administrador puedes gestionar usuarios de tu departamento y asignarles roles compatibles. No puedes modificar otros admins ni el superadmin.`,
    ingeniero: `No tienes permisos para crear o editar usuarios. Solo puedes ver tu propio perfil.`,
    vendedor: `No tienes permisos para crear o editar usuarios. Solo puedes ver tu propio perfil.`
  },
  hr: {
    superadmin: `Aquí puedes supervisar el módulo de Recursos Humanos completo: permisos, evaluaciones y métricas globales. Sirve para control operativo y seguimiento de desempeño de toda la organización.`,
    admin: `Aquí puedes consultar y gestionar información de RRHH como solicitudes de permiso, evaluaciones y tableros de seguimiento según tus permisos.`,
    ingeniero: `Aquí puedes revisar información de RRHH disponible para tu perfil, como estatus de permisos o evaluaciones cuando corresponda.`,
    vendedor: `Si tienes acceso, aquí puedes consultar datos de RRHH como permisos y evaluaciones. Si falta alguna sección esperada, revisa permisos con administración.`
  },
  clients: {
    superadmin: `Aquí administras los clientes corporativos de la organización. Puedes revisar fichas comerciales, responsables, documentos, oportunidades y la relación entre cada cliente y la operación o ventas.` ,
    admin: `Aquí gestionas el padrón de clientes corporativos de tu alcance. Revisa datos fiscales, contactos, documentos y seguimiento comercial para mantener la cartera actualizada.`,
    ingeniero: `Aquí puedes consultar la información corporativa de los clientes que se relacionan con tu operación, como contactos, contexto comercial y referencias necesarias para coordinar el servicio.`,
    vendedor: `Aquí puedes dar seguimiento a tus clientes corporativos, revisar contactos, documentos y contexto comercial para atender oportunidades, cotizaciones y continuidad de la cuenta.`,
  },
  cotizaciones: {
    superadmin: `Aquí puedes diseñar, revisar, guardar, exportar y enviar cotizaciones de toda la organización. El módulo concentra datos del cliente, partidas, impuestos, condiciones comerciales y vista previa del documento final.`,
    admin: `Aquí puedes gestionar cotizaciones del equipo, validar importes, descuentos, IVA, condiciones de pago y salida en PDF antes de compartir la propuesta con el cliente.`,
    ingeniero: `Si tu perfil tiene acceso, aquí puedes consultar cotizaciones relacionadas con proyectos o clientes para revisar alcance, partidas y condiciones comprometidas en la propuesta comercial.`,
    vendedor: `Aquí preparas y das seguimiento a cotizaciones comerciales: capturas datos del cliente, agregas conceptos, ajustas importes y generas el PDF o envío final al cliente.`,
  },
  "contact-messages": {
    superadmin: `Aquí puedes revisar todos los mensajes de contacto que llegan desde formularios públicos o canales comerciales. El módulo sirve para clasificar solicitudes, priorizar seguimiento y asegurar respuesta oportuna a prospectos y clientes.`,
    admin: `Aquí puedes gestionar los mensajes de contacto del equipo, revisar remitente, categoría, origen y estatus para dar seguimiento comercial o canalizarlos al área correcta.`,
    ingeniero: `Si tu perfil tiene acceso, aquí puedes consultar mensajes de contacto asignados o relevantes para entender requerimientos previos del cliente y coordinar seguimiento técnico.`,
    vendedor: `Aquí puedes revisar mensajes entrantes de prospectos o clientes, identificar oportunidades comerciales y dar seguimiento a solicitudes recibidas desde web o formularios de contacto.`,
  },
  "sales-management": {
    superadmin: `Aquí supervisas la gestión comercial completa: pipeline, ingresos, desempeño por vendedor, puntualidad operativa, prioridades de coaching y carga de proyectos por cliente. Úsalo para tomar decisiones ejecutivas y detectar riesgos temprano.`,
    admin: `Aquí das seguimiento al rendimiento del equipo comercial: comparas ingresos, productividad, puntualidad, focos rojos y proyectos operacionales por vendedor para coordinar acciones de mejora.`,
    ingeniero: `Si tu perfil tiene acceso, aquí puedes consultar indicadores comerciales y operativos del equipo para entender prioridades, carga de trabajo y relación entre ventas y ejecución.`,
    vendedor: `Aquí puedes revisar el tablero comercial del equipo, desempeño, prioridades de coaching y proyectos ligados a clientes corporativos para dar seguimiento a tus metas.`,
  },
  projects: {
    superadmin: `Aquí puedes crear y supervisar proyectos operacionales, asignar vendedor responsable, vincular cliente corporativo, distribuir ingenieros y controlar estados con trazabilidad completa de avance y carga operativa.`,
    admin: `Aquí gestionas proyectos de operación por cliente: creas proyectos, asignas ingenieros, revisas actividades relacionadas y controlas el ciclo de vida del proyecto según su avance.`,
    ingeniero: `Aquí consultas los proyectos donde estás asignado, el cliente relacionado y el estado operativo para coordinar tus actividades y entender el contexto del servicio.`,
    vendedor: `Aquí revisas tus proyectos por cliente corporativo, su estado y la actividad operativa asociada para mantener seguimiento comercial y coordinación con ingeniería.`
  },
  evidences: {
    superadmin: `Aquí puedes revisar todas las evidencias registradas en la organización. Usa los filtros por estatus, actividad y responsable para encontrar registros, abrir archivos, validar comentarios y aprobar o rechazar evidencias pendientes. También puedes exportar la información para seguimiento administrativo.`,
    admin: `Aquí puedes revisar las evidencias de tu equipo. Filtra por actividad o responsable para validar entregas, revisar archivos adjuntos, dejar observaciones y dar seguimiento a evidencias pendientes de aprobación.`,
    ingeniero: `En este módulo registras tus evidencias de servicio siguiendo el flujo de pasos de tu actividad. Completa cada etapa, adjunta archivos claros y verifica que tu historial muestre el estatus correcto para saber si la evidencia fue aprobada o requiere correcciones.`,
    vendedor: `No tienes acceso operativo a la revisión de evidencias. Si necesitas consultar un registro o tu acceso debería ser distinto, revísalo con tu administrador.`
  },
  viatics: {
    superadmin: `Aquí puedes revisar y administrar todos los viáticos registrados en la organización. Usa los filtros por estatus, usuario y razón para localizar solicitudes, validar tickets, aprobar o rechazar pagos y exportar el concentrado para control administrativo.`,
    admin: `Aquí puedes gestionar los viáticos de tu equipo. Filtra por usuario o motivo, revisa tickets adjuntos, valida montos y da seguimiento al estatus de cada solicitud antes de aprobarla o rechazarla.`,
    ingeniero: `Aquí puedes solicitar viáticos para tus actividades. Captura el monto, explica la razón, adjunta tu ticket o comprobante y revisa el estatus para saber si tu solicitud fue aprobada, rechazada o sigue pendiente.`,
    vendedor: `Si tu perfil tiene acceso, aquí puedes consultar el estado de tus viáticos y sus comprobantes. Si deberías poder registrar solicitudes y no ves el flujo correcto, revísalo con tu administrador.`
  },
  vehicles: {
    superadmin: `Aquí puedes administrar todo el control vehicular de la organización. Puedes revisar inventario, estado de unidades, solicitudes y asignaciones para mantener la operación ordenada y con trazabilidad completa.`,
    admin: `Aquí gestionas el control vehicular de tu área. Puedes consultar unidades disponibles, revisar solicitudes del equipo y dar seguimiento al uso y estatus de cada vehículo.`,
    ingeniero: `Aquí puedes consultar los vehículos asignados y registrar solicitudes cuando necesites una unidad para tus actividades. Verifica siempre el estatus de tu solicitud y la disponibilidad antes de programar salidas.`,
    vendedor: `Si tu perfil tiene acceso, aquí puedes consultar vehículos disponibles y tus solicitudes. Si no ves opciones de registro o seguimiento, solicita ajuste de permisos a tu administrador.`
  },
  "service-sheets": {
    superadmin: `Aquí puedes ver todas las hojas de servicio de las actividades. En cada registro encontrarás quién atendió, qué se hizo y en qué estado está. También puedes buscar rápidamente y descargar el PDF de cada hoja cuando lo necesites.`,
    admin: `Aquí revisas las hojas de servicio de tu equipo en un solo lugar. Puedes filtrar por cliente, técnico o actividad, verificar el estado y descargar el PDF para seguimiento o respaldo.`,
    ingeniero: `Este apartado te permite consultar la hoja de servicio de cada actividad y descargar su PDF. Ahí queda el resumen del trabajo realizado, observaciones y datos capturados durante el servicio.`,
    vendedor: `Si tu perfil tiene acceso, aquí puedes consultar hojas de servicio y descargar su PDF. Si no ves la información que esperas, solicita apoyo a tu administrador.`
  },
  gps: {
    superadmin: `Aquí puedes monitorear la ubicación y actividad en campo de todo el equipo. Úsalo para supervisión operativa, seguimiento de rutas y validación de cobertura por zona.`,
    admin: `Aquí puedes dar seguimiento en mapa al personal de tu área. Te ayuda a validar desplazamientos, tiempos de respuesta y operación en campo en tiempo real.`,
    ingeniero: `Aquí puedes consultar la ubicación y puntos de seguimiento de las actividades operativas. Te sirve para ubicar rutas, zonas atendidas y referencia del trabajo en campo.`,
    vendedor: `Si tu perfil tiene acceso, aquí puedes ver el monitoreo GPS en mapa para seguimiento comercial u operativo. Si no ves datos esperados, revisa permisos con tu administrador.`
  },
  cvs: {
    superadmin: `Aquí puedes supervisar todo el pipeline de CVs de la empresa. Puedes ver cada etapa, aprobar o descartar candidatos y convertir aprobados en usuarios del sistema con trazabilidad completa.`,
    admin: `Aquí puedes revisar CVs en etapas administrativas, mover candidatos entre columnas y registrar decisiones para mantener el proceso de selección ordenado.`,
    ingeniero: `Si tu perfil participa en reclutamiento, aquí puedes subir CVs, revisar candidatos y dar seguimiento por etapas hasta su resolución.`,
    vendedor: `Si tienes acceso, aquí puedes consultar el estado de candidatos y sus documentos CV en el flujo de selección. Si no ves acciones esperadas, revisa permisos con administración.`
  },
  manufacturing: {
    superadmin: `En una empresa de servicios, este módulo se usa para estandarizar la ejecución técnica por tipo de servicio/proyecto. Flujo recomendado: 1) define centros de trabajo (cuadrillas, taller, laboratorio o áreas operativas), 2) arma la plantilla técnica (BOM) con insumos y cantidades base, 3) valida que quede activo para que el equipo pueda planear y ejecutar sin improvisación.`,
    admin: `Aquí preparas el estándar operativo del servicio. Registra centros de trabajo y después la plantilla BOM de cada línea de servicio. Esto evita variaciones entre equipos y mejora tiempos de ejecución.`,
    ingeniero: `Aquí consultas la plantilla técnica del servicio antes de salir a ejecutar: insumos requeridos, cantidades base y centro responsable. Úsalo como checklist previo para reducir retrabajos.`,
    vendedor: `Si tienes acceso, aquí puedes consultar la estructura técnica base del servicio para alinear expectativas de alcance y tiempos con operación.`
  },
  production: {
    superadmin: `Este módulo controla la ejecución operativa por orden de trabajo interna. Flujo: Crear orden -> Iniciar -> Completar. Cada orden representa una ejecución planificada de servicio, instalación o preparación técnica; al cierre se registra el resultado real para medir cumplimiento.`,
    admin: `Aquí gestionas órdenes de ejecución del equipo. Crea la orden con plantilla BOM, prioridad y fechas; luego inicia cuando entra a operación y completa al terminar. Esto te da trazabilidad real de tiempos y avance.`,
    ingeniero: `Aquí ves tus órdenes activas, su avance y fechas compromiso. Úsalo para priorizar trabajo diario y reportar desviaciones cuando el avance real no coincide con lo planeado.`,
    vendedor: `Aquí puedes consultar el estado operativo de las órdenes para dar seguimiento comercial: planificada, en progreso o completada.`
  },
  "production-schedule": {
    superadmin: `Aquí balanceas capacidad operativa por periodo. Filtra por fechas para detectar sobrecarga de centros/cuadrillas y ajustar la agenda antes de afectar compromisos de servicio.`,
    admin: `Aquí haces planeación semanal/diaria de órdenes. Usa Desde/Hasta para ver carga por centro de trabajo y redistribuir cuando una línea está saturada.`,
    ingeniero: `Aquí consultas la secuencia programada de trabajo para organizar ruta y prioridades operativas del día.`,
    vendedor: `Aquí validas ventanas reales de ejecución para coordinar fechas con clientes sin comprometer capacidad operativa.`
  },
  quality: {
    superadmin: `Aquí controlas la calidad del servicio ejecutado. Flujo: 1) registra inspección, 2) evalúa checklist, 3) si hay desviación levanta NCR, 4) da seguimiento a acción correctiva/preventiva hasta cierre.`,
    admin: `Aquí documentas hallazgos de calidad y su resolución. Cuando algo no cumple, crea NCR con causa raíz y acción correctiva para evitar repetición en futuros servicios.`,
    ingeniero: `Aquí registras evidencia de calidad de la ejecución. Si detectas desviación, repórtala con detalle para que se atienda y cierre formalmente.`,
    vendedor: `Aquí puedes consultar incidencias de calidad abiertas que puedan impactar tiempos de entrega, garantías o satisfacción del cliente.`
  },
  accounting: {
    superadmin: `Este módulo es la base financiera. Aquí validas plan de cuentas, pólizas y períodos fiscales; toda captura en gastos, nómina, proyectos, facturación y banca termina reflejándose en este libro contable. Flujo recomendado: 1) define cuentas, 2) valida período abierto, 3) revisa pólizas generadas por operación.`,
    admin: `Aquí revisas la estructura contable oficial: catálogo de cuentas, pólizas y períodos. Antes de registrar operaciones en otros módulos, confirma que el período esté abierto y que la cuenta correcta exista para evitar reclasificaciones.`,
    ingeniero: `Si tienes acceso, aquí puedes consultar la contabilidad consolidada para entender cómo impactan en números las operaciones diarias del servicio.`,
    vendedor: `Si tienes acceso, aquí puedes consultar el resumen contable para alinear compromisos comerciales con la capacidad financiera real.`
  },
  "employee-payments": {
    superadmin: `Aquí se registra y audita la nómina/pagos operativos. Cada pago debe llevar periodo, monto, referencia y evidencia; su impacto se refleja en contabilidad y reportes.`,
    admin: `Aquí capturas pagos al personal con periodo y soporte. Usa criterios consistentes de concepto y referencia para que contabilidad y conciliación bancaria cuadren sin ajustes manuales.`,
    ingeniero: `Si tu perfil lo permite, aquí consultas pagos registrados por periodo y su evidencia.`,
    vendedor: `Si tienes acceso, aquí puedes consultar pagos vinculados a la operación comercial o de servicio.`
  },
  expenses: {
    superadmin: `Aquí controlas egresos operativos. Cada gasto aprobado alimenta contabilidad y reportes; relaciona categoría y concepto de forma estandarizada para trazabilidad completa.`,
    admin: `Registra gastos con categoría, monto y fecha real de impacto. Esto permite que proyectos, pólizas y estado de resultados se mantengan alineados.`,
    ingeniero: `Si tienes permisos, aquí puedes consultar gastos y su estatus para seguimiento operativo.`,
    vendedor: `Si tienes acceso, aquí puedes consultar gastos relacionados a atención de clientes y ejecución comercial.`
  },
  "work-projects": {
    superadmin: `Este módulo concentra presupuesto vs costo real por proyecto. Los movimientos aquí deben corresponder con gastos y pagos para evitar diferencias financieras.`,
    admin: `Aquí das seguimiento a costo, avance y presupuesto del proyecto. Mantén sincronía entre lo ejecutado, lo pagado y lo registrado como gasto.`,
    ingeniero: `Aquí puedes consultar estado y costos del proyecto para priorizar ejecución dentro del presupuesto.`,
    vendedor: `Aquí puedes revisar consumo presupuestal por proyecto para ajustar expectativas y alcance con el cliente.`
  },
  invoicing: {
    superadmin: `Aquí gestionas facturación y cobranza/pago (CxC/CxP). Lo facturado y cobrado impacta contabilidad, banca y reportes; controla estatus y vencimientos diariamente.`,
    admin: `Registra y monitorea facturas con folio fiscal, receptor, total, pagos y vencimiento. Esto conecta ingresos/egresos con conciliación bancaria y reportes.`,
    ingeniero: `Si tienes acceso, aquí consultas facturas y estatus para validar compromisos operativos y administrativos.`,
    vendedor: `Aquí das seguimiento a facturas del cliente, estatus de cobro y vencimientos para mantener salud de cartera.`
  },
  banking: {
    superadmin: `Aquí se concilian movimientos bancarios reales con pagos y facturas. La clave es validar SPEI, contraparte y conciliación para cerrar cifras con contabilidad.`,
    admin: `Usa este módulo para revisar cuentas, movimientos y conciliación. Todo movimiento sin conciliar es un riesgo de diferencia en reportes financieros.`,
    ingeniero: `Si tienes acceso, aquí consultas movimientos bancarios relacionados a operación y su conciliación.`,
    vendedor: `Si tienes acceso, aquí puedes validar pagos recibidos para confirmar continuidad comercial con clientes.`
  },
  "accounting-reports": {
    superadmin: `Aquí cierras el ciclo financiero: balanza, estado de resultados y balance general. Si hay diferencias, revisa primero captura en pagos, gastos, proyectos, facturación y banca.`,
    admin: `Este módulo consolida la salud financiera. Úsalo para validar que lo capturado en los demás módulos esté correctamente reflejado antes de cierre.`,
    ingeniero: `Si tienes acceso, aquí puedes consultar reportes financieros consolidados para contexto de operación.`,
    vendedor: `Si tienes acceso, aquí puedes revisar indicadores financieros para planear metas y compromisos comerciales realistas.`
  },
  "quality-dashboard": {
    superadmin: `Aquí visualizas KPIs de calidad: inspecciones totales, tasa de aprobación, NCR abiertas y críticas. Úsalo para decisiones ejecutivas y priorización de acciones correctivas.`,
    admin: `Aquí monitoreas el desempeño de calidad del equipo mediante indicadores y NCR recientes. Sirve para detectar focos rojos y dar seguimiento oportuno.`,
    ingeniero: `Aquí puedes revisar indicadores de calidad y tendencias de no conformidades para prevenir recurrencias en la operación.`,
    vendedor: `Si tienes acceso, este tablero te ayuda a entender el estado de calidad general y posibles riesgos para clientes.`
  },
  procurement: {
    superadmin: `Aquí puedes supervisar todo el proceso de compras de la organización. Revisa requisiciones, órdenes de compra, proveedores registrados y estados de aprobación. Controla el flujo desde la solicitud hasta la entrega y valida cumplimiento de proveedores.`,
    admin: `Aquí gestionas las compras de tu área. Puedes crear requisiciones, generar órdenes de compra, registrar proveedores, revisar pendientes de aprobación y dar seguimiento al estado de cada compra. Filtra por almacén destino para mejor control.`,
    ingeniero: `Aquí solicitas compras para materiales o insumos necesarios en tus actividades. Completa la requisición con descripción, cantidad y almacén destino, luego sigue el estado de tu solicitud hasta que sea aprobada o convertida en orden de compra.`,
    vendedor: `Si tu perfil tiene acceso, aquí puedes solicitar y consultar el estado de compras. Completa tus requisiciones y revisa si fueron aprobadas. Si no ves opciones de registro o tienes dudas, contacta a tu administrador.`
  },
  stock: {
    superadmin: `Aquí puedes supervisar el inventario completo de la organización por almacén. Revisa niveles de stock, movimientos de entrada y salida, alertas de reabastecimiento y controla el inventario consumible para proyectos, ventas e insumos operacionales.`,
    admin: `Aquí gestionas el inventario de tu área. Consulta niveles por almacén, registra movimientos de entrada y salida, revisa productos con stock bajo y valida la información para mantener un inventario actualizado y confiable.`,
    ingeniero: `Aquí puedes consultar los niveles de stock disponibles por almacén. Si necesitas registrar un movimiento o ajuste de inventario, coordina con tu administrador o usa los permisos que tengas configurados.`,
    vendedor: `Si tu perfil tiene acceso, aquí puedes consultar disponibilidad de stock por almacén para propósitos comerciales. Si necesitas información específica o no ves datos esperados, revisa con tu administrador.`
  },
  warehouse: {
    superadmin: `Aquí puedes supervisar y administrar todos los almacenes de la organización. Crea almacenes nuevos, registra ubicaciones, códigos y direcciones, y controla la asignación de inventario por almacén. Visualiza la estructura logística completa.`,
    admin: `Aquí gestionas los almacenes de tu área. Puedes crear nuevos almacenes, actualizar ubicaciones y códigos, y revisar qué inventario está asignado a cada almacén para coordinar operaciones logísticas.`,
    ingeniero: `Aquí consultas los almacenes disponibles en la organización, su ubicación y la información de contacto cuando sea relevante para tu operación en campo o logística interna.`,
    vendedor: `Si tienes acceso, aquí puedes consultar la lista de almacenes para referencia comercial o logística. Si necesitas crear o editar almacenes, coordina con tu administrador.`
  },
  tools: {
    superadmin: `Aquí gestionas el inventario de herramientas internas de la organización: cámaras, monitores, laptops, equipos de medición y otros activos para uso operativo. Controla disponibilidad, asignaciones, mantenimiento y registro de devoluciones.`,
    admin: `Aquí puedes revisar las herramientas disponibles para tu equipo, registrar asignaciones, solicitar herramientas necesarias y dar seguimiento a devoluciones. Mantén actualizado el estado de cada herramienta en tu área.`,
    ingeniero: `Aquí consultas las herramientas disponibles en tu organización y puedes solicitar el equipo que necesitas para tus actividades en campo. Revisa el estado de tus solicitudes y coordina devoluciones con tu administrador.`,
    vendedor: `Si tu perfil tiene acceso, aquí puedes consultar herramientas disponibles y solicitar el equipo que requieras. Si no ves opciones o tienes dudas, coordina con tu administrador.`
  },
  news: {
    superadmin: `Aquí publicas noticias y comunicados internos para toda la organización. Crea anuncios, novedades operativas, cambios de política o información importante que todos deben conocer. Controla la visibilidad y fecha de publicación de cada comunicado.`,
    admin: `Aquí puedes revisar los comunicados publicados en tu área y crear nuevas noticias relevantes para el equipo. Asegúrate de mantener la información actualizada y clara para que el equipo esté informado de cambios importantes.`,
    ingeniero: `Aquí consultas las noticias y comunicados de la organización para estar al tanto de cambios, nuevas políticas, oportunidades o información que afecte tu trabajo. Revisa regularmente para no perder actualizaciones importantes.`,
    vendedor: `Aquí puedes leer los últimos comunicados y noticias de la organización, incluyendo cambios comerciales, nuevas iniciativas o información relevante para tu operación. Mantente informado de las novedades.`
  },
  newsletter: {
    superadmin: `Esta sección muestra el listado de personas suscritas al newsletter de la organización. Verás tres contadores: total de suscriptores registrados, cuántos están activos (recibirán correos) y cuántos están inactivos (dados de baja). Usa el buscador para filtrar por email o nombre. Actualmente solo gestiona la lista; para enviar boletines deberás usar la herramienta de correo externa configurada en tu proveedor de email.`,
    admin: `Aquí consultas la lista de suscriptores al newsletter. Puedes buscar por email o nombre para verificar si alguien está registrado, ver si su estado es Activo o Inactivo, y revisar cuándo se registró. Si necesitas agregar o eliminar suscriptores, solicítalo al superadmin.`,
    ingeniero: `Esta sección muestra quiénes están suscritos a los comunicados de la organización. Solo lectura para tu perfil; si quieres suscribirte o darte de baja, comunícate con tu administrador.`,
    vendedor: `Aquí puedes ver el listado de suscriptores al newsletter de la empresa. Si tienes acceso, podrás buscar contactos registrados. Para cambiar tu suscripción habla con tu administrador.`
  },
  settings: {
    superadmin: `Aquí controlas los datos y comportamiento de toda la plataforma. Está dividido en secciones (pestañas del lado izquierdo):\n\n• Empresa: nombre de tu organización, dirección, teléfono y logotipo que aparecen en documentos y reportes.\n• Fiscal: RFC, régimen fiscal y datos que se imprimen en facturas o cotizaciones.\n• Notificaciones: a qué correos llegan las alertas del sistema y cuándo se disparan.\n• Seguridad: cuántos intentos fallidos de login se permiten antes de bloquear una cuenta.\n• General: otros ajustes de comportamiento de la app.\n\nCómo cambiar un dato: haz clic en la categoría → edita el campo → presiona Guardar. El cambio se aplica de inmediato en todo el sistema.\n\nSi necesitas agregar un ajuste nuevo que no existe, usa el formulario al final del panel: escribe el nombre interno (sin espacios), el valor y una etiqueta legible.`,
    admin: `Aquí puedes revisar los parámetros que controlan cómo funciona la plataforma para toda la organización: nombre de la empresa, datos fiscales, alertas y seguridad. Solo el superadmin puede hacer cambios. Si ves algo incorrecto (por ejemplo el nombre de la empresa en los reportes o una dirección desactualizada), avísale al superadmin indicando exactamente qué dato está mal y cuál debería ser.`,
    ingeniero: `Esta sección muestra la configuración general de la plataforma. No puedes modificarla desde tu perfil. Si algo afecta tu trabajo — por ejemplo un horario organizacional mal configurado o una notificación que no llega — comunícaselo a tu administrador para que lo corrija.`,
    vendedor: `Aquí se configuran los datos de la empresa que aparecen en tus cotizaciones y documentos comerciales. No puedes editarlos directamente. Si notas que el nombre de empresa, dirección o RFC aparecen incorrectos en algún documento, notifícalo a tu administrador.`
  },
};

function getProfile(user: any): string {
  if (user?.superadmin || user?.isSuperAdmin) return "superadmin";
  if (user?.admin) return "admin";
  if (user?.ingeniero) return "ingeniero";
  if (user?.vendedor) return "vendedor";
  return "ingeniero";
}

const moduleNames: Record<string, string> = {
  procurement: "Compras y Requisiciones",
  stock: "Inventario / Stock",
  warehouse: "Almacenes",
  attendance: "Asistencia",
  "lunch-breaks": "Breaks de Comida",
  fines: "Multas",
  activities: "Actividades",
  users: "Usuarios",
  hr: "Recursos Humanos",
  clients: "Clientes",
  cotizaciones: "Cotizaciones",
  "contact-messages": "Mensajes de Contacto",
  "sales-management": "Gestión Comercial",
  projects: "Proyectos",
  evidences: "Evidencias",
  viatics: "Viáticos",
  vehicles: "Vehículos",
  "service-sheets": "Hojas de Servicio",
  gps: "GPS en Vivo",
  cvs: "CVs / Candidatos",
  workflow: "Flujo de Trabajo",
  "work-projects": "Proyectos de Trabajo",
  accounting: "Contabilidad General",
  "employee-payments": "Nómina y Pagos",
  expenses: "Gastos Operativos",
  invoicing: "Facturación",
  banking: "Banca y Conciliaciones",
  "accounting-reports": "Reportes Financieros",
  maintenance: "Mantenimiento",
  audit: "Auditoría",
  newsletter: "Boletín",
  "client-tickets": "Tickets de Clientes",
  manufacturing: "Manufactura / BOM",
  production: "Producción",
  "production-schedule": "Planificación de Producción",
  quality: "Control de Calidad",
  "quality-dashboard": "Dashboard de Calidad",
  news: "Noticias y Comunicados",
  tools: "Herramientas Internas",
  settings: "Configuración del Sistema",
};

export default function HelpTab({ module, user }: { module: string; user?: any }) {
  const { darkMode } = useTheme();
  if (module === "login") return null;

  const profile = getProfile(user);
  const content = helpContent[module]?.[profile] || "No hay ayuda disponible para este módulo.";
  const [open, setOpen] = React.useState(false);
  const moduleLabel = moduleNames[module] || module.replace(/-/g, " ");

  const buttonStyle: React.CSSProperties = {
    width: 54,
    height: 54,
    borderRadius: 18,
    background: darkMode
      ? 'linear-gradient(145deg, rgba(12, 96, 214, 0.98), rgba(18, 183, 154, 0.88))'
      : 'linear-gradient(145deg, #0f7bff, #18b79a)',
    color: '#fff',
    border: 'none',
    fontWeight: 700,
    boxShadow: darkMode
      ? '0 18px 34px rgba(2, 12, 28, 0.46)'
      : '0 16px 30px rgba(15, 123, 255, 0.22)',
    transition: 'background 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    fontSize: 22,
  };

  const panelStyle: React.CSSProperties = {
    marginTop: 8,
    background: darkMode ? 'linear-gradient(175deg, rgba(10, 18, 30, 0.98), rgba(7, 24, 35, 0.96))' : 'linear-gradient(175deg, rgba(255, 255, 255, 0.99), rgba(242, 249, 255, 0.98))',
    border: darkMode ? '1px solid rgba(65, 145, 255, 0.22)' : '1px solid rgba(18, 58, 108, 0.1)',
    borderRadius: 20,
    padding: 18,
    minWidth: 340,
    maxWidth: 430,
    color: darkMode ? '#e9f3ff' : '#12324e',
    boxShadow: darkMode
      ? '0 24px 48px rgba(2, 10, 22, 0.54)'
      : '0 22px 42px rgba(15, 45, 85, 0.16)',
    transition: 'background 0.25s ease, border-color 0.25s ease, color 0.25s ease, box-shadow 0.25s ease',
  };

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}>
      <button onClick={() => setOpen((v) => !v)} style={buttonStyle}>
        {open ? '×' : '?'}
      </button>
      {open && (
        <div style={panelStyle}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: darkMode ? '#7eb2df' : '#5f7f9a', marginBottom: 4 }}>
                  Guía rápida
                </div>
                <h4 style={{ margin: 0, color: darkMode ? '#f5fbff' : '#14304d' }}>{moduleLabel}</h4>
              </div>
              <span style={{ padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: darkMode ? 'rgba(52, 141, 255, 0.16)' : 'rgba(15, 123, 255, 0.1)', color: darkMode ? '#9fd0ff' : '#1560ad' }}>
                {profile}
              </span>
            </div>
            <div style={{ whiteSpace: 'pre-line', fontSize: 14, lineHeight: 1.6, color: darkMode ? '#bfd5ee' : '#4b647f' }}>{content}</div>
          </div>
        </div>
      )}
    </div>
  );
}
