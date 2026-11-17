# Revisión del estándar de proyecto — Codex

2026-11-16, main, base ac5afdbf4. Pulido sobre el trabajo sin commit de Cursor. Sin commit, push, stash, reset, migraciones aplicadas ni despliegue. No se editó schema.prisma ni los módulos ajenos.

## Encargo, secciones 1 a 8

| Sección | Hecho | Falta / límite de verificación |
|---|---|---|
| 1 Ficha | Revisadas reglas puras, cliente de relleno, nombre, responsable, fechas, alcance, hitos, actividades y acta. Sugerencia de mantenimiento corregida para cumplir su propia regla. | No se modificaron datos existentes. |
| 2 API | Altas manuales exigen ficha; errores de campos requeridos en español. Alta manual operativa queda Planeada. Altas automáticas conservan vía incompleta; tarjeta IA muestra nombre, responsable e inicio/fin editables. Transiciones ACTIVE/COMPLETED validan niveles y fechas reales. createdById conservado; ventas registra al actor. | Integraciones verificadas con dobles de Prisma, sin levantar API contra una base real. |
| 3 Avance | Sin ficha no hay porcentaje; máximo 99 abierto, hitos mandan. Fecha real aislada no termina un proyecto y un hito abierto no dice Listo para cerrar. | Sin cambios de datos de producción. |
| 4 Actividades | Selector por cliente y proyecto único preseleccionado en web/IA y formularios nativos. Opción explícita sin proyecto para servicios permitidos. API bloquea instalación sin proyecto vigente y comprueba empresa/cliente. Ficha permite ligar una o varias en ventana de México, transacción contra reasignaciones concurrentes; aviso fuera de fechas. | Android/iOS sin compilar ni probar en dispositivo. |
| 5 Avisos | Cron existente conservado. Día local México; un aviso por persona/día, agrupación de altas, responsable distinto, fallback a vendedor. Historial de avisos por proyecto para escalar tras 3 días hábiles consecutivos, supervisor por rol y membresía de empresa; copia agrupada. Cableado en ventas, contratos, alta rápida y alta automática profesional/cotización. Cola local evita carreras entre altas. Fallo de aviso inicial se registra y cron reintenta sin bloquear alta. | No se enviaron avisos reales ni se esperó un cron de producción. |
| 6 Pantallas | KPI/chip/filtro incluyen ficha incompleta y ACTIVE sin PLAN; faltantes, editor inline de nombre/tipo/responsable/fechas, sugerencia editable, foco completar=1, pasos FICHA→PLAN→LISTO, botones de estado deshabilitados y explicación. Alta exige ficha desde paso 1. | No hay capturas ni recorrido de navegador a 390/1536. Cliente inválido remite al padrón; el banner no cambia su identidad. No se declara QA visual terminada. |
| 7 Datos | Migración de Cursor solo agrega columna, índice y FK. No se tocó ni aplicó. | Ninguna intervención en producción. |
| 8 Cierre | Pruebas focalizadas API 138/138 y web 80/80; typecheck web en verde. Diff check sin errores de espacios. | Global no está en verde por cambios ajenos; detalles abajo. |

## Verificaciones

- npm run typecheck: código 1. Solo errores ajenos: accounting/banco/estado-cuenta-import.service.ts:66 (PaginationQueryDto sin skip); accounting/buzon-sat/e2-e4.service.ts:45 (cfdiUuid); accounting/buzon-sat/ingest-cfdi.ts:72 y :73 (null/usoCfdi).
- npm run typecheck:web: código 0.
- npm run test (API): 478 suites, 466 pasaron / 12 fallaron; 6,028 pruebas pasaron / 46 fallaron. El script raíz no sigue a web si API falla, por eso se ejecutó test:web aparte.
- Suites API ajenas fallidas: cotizaciones/cotizacion-formato-nexara; attendance/attendance-duplicados, checada-rechazos, checada-web-temporal, checada-no-manipulable, asistencia-ubicacion-consentimiento; costos/vehiculos/lectura-ia; accounting/banco/estado-cuenta-parsers, reglas-conciliacion; accounting/buzon-sat/cruces-sat, mi-cierre; accounting/periodo/bloqueo-periodo. Incluyen fechas festivas del reloj real y trabajo concurrente de contabilidad. No se editaron.
- npm run test:web: 272 archivos, 270 pasaron / 2 fallaron; 2,256 pruebas pasaron / 2 fallaron. Fallos ajenos en clientes/page.spec.tsx (pestaña Comercial) y cotizaciones/[id]/page.spec.tsx (opción Planos al guardar). No se editaron.
- Última verificación focalizada tras ajustes: API proyectos + activities.service, 16 suites / 138 pruebas verdes; web proyectos/IA/helpers, 10 archivos / 80 pruebas verdes.
- Nuevos tests cubren aislamiento por empresa, rechazo de instalación sin proyecto, vinculación, escalado sin usar edad del proyecto, agrupación al nacer, foco y POST de ficha. No se eliminaron ni relajaron pruebas.
- No se verificaron visualmente navegador o dispositivos nativos. No se probaron notificaciones reales.

Logs: proyectos-typecheck-final.log, proyectos-typecheck-web.log, proyectos-test-final.log, proyectos-test-web-final.log, proyectos-test-api-foco.log, proyectos-test-web-foco.log en .ai/.

## Archivos tocados por Codex (41 de código/pruebas)

- apps/api/src/activities/activities.service.ts
- apps/api/src/activities/activities.service.proyecto.spec.ts
- apps/api/src/projects/dto/create-operational-project.dto.ts
- apps/api/src/projects/dto/proyecto-profesional.dto.ts
- apps/api/src/projects/operational-projects.service.ts
- apps/api/src/projects/operational-projects-alta.spec.ts
- apps/api/src/projects/projects.module.ts
- apps/api/src/projects/proyecto-completitud.ts
- apps/api/src/projects/proyecto-completitud.spec.ts
- apps/api/src/projects/proyecto-salud.ts
- apps/api/src/projects/proyecto-salud.spec.ts
- apps/api/src/projects/proyectos-incompletos.service.ts
- apps/api/src/projects/proyectos-avisos.module.ts
- apps/api/src/projects/proyectos-estandar-integracion.spec.ts
- apps/api/src/projects/proyectos-profesional.service.ts
- apps/api/src/projects/proyectos-profesional.controller.ts
- apps/api/src/ventas/ventas.service.ts
- apps/api/src/ventas/ventas.module.ts
- apps/api/src/maintenance-contracts/maintenance-contracts.service.ts
- apps/api/src/maintenance-contracts/maintenance-contracts.module.ts
- apps/web/app/(panels)/erp/proyectos/page.tsx
- apps/web/app/(panels)/erp/proyectos/[id]/page.tsx
- apps/web/app/(panels)/erp/proyectos/nuevo/page.tsx
- apps/web/app/(panels)/erp/proyectos/nuevo/page.spec.tsx
- apps/web/app/(panels)/erp/proyectos/_componentes/CompletarFicha.tsx
- apps/web/app/(panels)/erp/proyectos/_componentes/CompletarFicha.spec.tsx
- apps/web/app/(panels)/erp/proyectos/_componentes/SeccionActividades.tsx
- apps/web/app/(panels)/erp/proyectos/_componentes/tipos.ts
- apps/web/components/ops/OpsActivityForm.tsx
- apps/web/components/pizarra/AsistenteIA.tsx
- apps/web/components/pizarra/AsistenteIA.spec.tsx
- apps/web/lib/proyectos-api.ts
- apps/web/lib/ops-operational-api.ts
- apps/web/lib/proyecto-alta.ts
- apps/web/lib/proyecto-alta.spec.ts
- apps/web/lib/proyecto-nombre.ts
- apps/web/lib/proyecto-nombre.spec.ts
- apps/web/lib/asistente-ia-api.ts
- apps/mobile-native/android/app/src/main/java/mx/nexara/mobile/nativeapp/ui/console/activities/CoreActivityFormScreen.kt
- apps/mobile-native/ios/NexaraApp/UI/Core/CoreActivityFormView.swift
- apps/mobile-native/ios/NexaraApp/Data/CoreActivityFormRepository.swift

Documentación: .ai/REVISION-PROYECTOS-CODEX.md y sección agregada en .ai/RELEVO.md. El borrador local de Ollama quedó truncado y se descartó; no se aplicó.
