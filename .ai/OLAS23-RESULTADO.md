# Proyectos: olas 2 y 3 — Codex, 17-11-2026

## Contrato y alcance

OperationalProject es el maestro; SalesProject conserva su cara comercial 1:1. Project es contenido público. WorkProject queda histórico y solo lectura. Se conservan los contratos de completitud y salud de la ola 1. No se ejecuta el migrador contra ninguna base, no se aplica migración y no se toca producción; no commit, push ni despliegue.

Las pantallas amplían el sistema Core existente. Dirección/contabilidad ven costos globales y detalle de mano de obra. El responsable/vendedor consulta sus proyectos; coordinación conserva su alcance operativo. Los resúmenes no exponen salarios ni datos globales a quien solo puede ver proyectos propios. Todos los cálculos y permisos viven en API, con empresa explícita.

## Criterios del encargo

| Punto | Resultado implementado |
| --- | --- |
| Ola 2.1 | Migrador en simulación por defecto, clientes reales normalizados por empresa, creador administrador, estados mapeados, archivo histórico de gastos/nómina/logs, reporte de no coincidencias; módulo viejo sin escrituras y rutas retiradas. |
| Ola 2.2 | Altas/consultas comerciales garantizan enlace operativo, sin sobrescribir el maestro; CRM dirige a su id operativo. |
| Ola 2.3 | Cron recorre maestros vigentes y utiliza el mismo costeo que la ficha; responsable/creador y Supervisor General de la empresa en sobrecostos. |
| Ola 2.4 | Listado canónico /erp/proyectos; rutas duplicadas redirigidas y reportes conservan funciones que no son otro listado de proyectos. |
| Ola 3.1 | Material a costo de salida, por actividad o directo al maestro; sesiones reales por tarifa y otros costos del libro; salidas sin destino visibles como Sin ligar. |
| Ola 3.2 | Cotizado/real/diferencia/consumo y origen por rubro; venta, costo, márgenes y proyección únicamente con avance calculable y ficha completa. |
| Ola 3.3 | Margen real con semáforo respecto del cotizado y KPI Con sobrecosto. |
| Ola 3.4 | Umbral estricto >90 % antes de 70 %; rubro una vez por umbral, sobrecosto diario; resumen por persona/empresa/día mediante NotificationsService. |
| Ola 3.5 | La consulta no cambia cotizaciones, stock ni movimientos del libro. |

## Verificaciones

- API regresión: ventas + work-projects + projects, 21 suites / 259 pruebas PASS; incluye íntegra la ola 1 y el migrador en memoria.
- API costos: 4 suites / 92 pruebas PASS (lectura a fecha, cerrado, tarifas históricas, prioridad manual única, contexto por empresa, permisos y costo al terminar).
- API avisos: 14/14 PASS (90/70 exactos, centavos, sobrecosto total, dedupe diario/umbral, destinatarios activos de la empresa).
- API almacén: 7/7 nuevas PASS; otras 39 pruebas de regresión de almacén/SLA PASS. Total Jest verificado en los focos anteriores: 411 pruebas distintas.
- Web UI costos: 22/22 PASS. Web compatibilidad: 41/41 pruebas distintas PASS, incluidas rutas, middleware, handoff, navegación y CRM. Total Vitest verificado: 63 pruebas.
- Typecheck web: exit 0. Typecheck API: únicamente errores ajenos de contabilidad; se conserva salida final abajo.
- Prisma generate: PASS, sin aplicar migración. AppModule preview: PASS, sin instanciar proveedores ni conectar BD.
- QA visual aislada SeccionCostos: 390 y 1536 px, sin desbordamientos; DOM, JSON y capturas revisadas en C:\Users\adpoz\AppData\Local\Temp\nexara-olas23-qa. No certifica una sesión autenticada ni integración con datos reales.
- git diff --check de nuestras rutas: PASS.

Comandos: node node_modules/typescript/bin/tsc --noEmit -p apps/{api,web}/tsconfig.json; Jest directo con --config jest.config.js --runInBand; Vitest directo. No se alteran tests ajenos para esconder fallos.

Errores ajenos identificados:
- apps/api/src/accounting/accounting.service.ts(561,63), TS2353: isSuperAdmin no existe en UserSelect.
- apps/api/src/accounting/banco/estado-cuenta-import.service.ts(72,75), TS2345: falta skip en PaginationQueryDto.

La suite amplia de costos detectó además una aserción anterior de costos/vehiculos/lectura-ia.spec.ts sobre campos nuevos de tickets (null); no se modificó ese módulo ni su prueba. El foco que cubre nuestras rutas quedó íntegramente verde.

## Límites de verificación

Sin ejecución de migración, datos reales ni notificaciones reales. No se certifica producción. Pull --rebase rechazado por Git por cambios ajenos sin commitear; se preservan sin stash ni commit. Las pruebas se ejecutan directamente con Node porque los lanzadores npm/npx del PATH apuntan a un módulo ausente.
