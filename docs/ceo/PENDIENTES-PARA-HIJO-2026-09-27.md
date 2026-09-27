# Pendientes para el desarrollador (hijo de Christian)
**De:** Christian (CEO) · **Versión 2 · 27-sep-2026** — de lista de deseos a **estado real con comandos**
**Repo:** `NEXARA-app`, siempre en `main` (sin ramas ni PRs). El código es **multi-empresa**: todo lo nuevo se acota por empresa.

> **Qué cambió respecto a la v1:** varios pendientes ya están **hechos y probados en local** (commits abajo, por subir y desplegar). Los que quedan tienen ahora el detalle de qué falta y quién lo hace. Se añadieron los hallazgos que aparecieron al leer el código con la operación del CEO en mente.

---

## A. Hecho y probado (commits locales en `main`, sin subir ni desplegar)
| Commit | Qué |
|---|---|
| `548ddce4` | **«Pagos a personal» solo CEO, por empresa.** Política `rbac.module_roles` (SystemSetting con `companyId`): API 403 en todos sus endpoints; la pre-nómina conserva las horas y oculta los montos capturados; `/me/navigation` lo quita del menú web y móvil (`hiddenModuleIds`); web: menú, paleta, riel de Finanzas, atajo y pantalla. Facturación intacta. Doc: `docs/POLITICA-MODULOS-POR-EMPRESA.md` |
| `761b3fd5` | **Aviso diario de OC atrasadas** (9:30 MX, L–V; un resumen por persona; idempotente; sin mezclar empresas) + mapa de automatizaciones actualizado |
| `6868764a` | **Preparación de facturación:** `GET /api/pac/readiness` y `npm run pac:preflight`; arreglos: dígito verificador del RFC (rechazaba RFC válidos), CP fiscal del emisor (la validación nunca bloqueaba), IVA 0 % (se facturaba al 16 %), respuesta del PAC sin UUID (ya no se guarda como enviada). Runbook: `docs/CFDI-GO-LIVE.md` |
| `1fc5171d` | **9 plantillas de cotización + catálogo maestro (53 conceptos) + kit IDC**, seed idempotente `npm run seed:plantillas`. Doc: `docs/PLANTILLAS-COTIZACION-NEXARA.md` |
| `5df8a482` | **Tablero y bandeja del CEO con datos reales:** vencidas por fecha, por cobrar/pagar restando lo cobrado, stock bajo desde `stock_levels`, «Asignada»; pasos sin aprobador visibles y notificados con importe; crons de la mañana en hora de México |

Verificación: API `tsc` 0 errores, jest **215 suites / 2,638 pruebas** en verde; web `tsc` 0 errores, vitest 601 ok / 6 fallas **previas** (4 en `HerramientasChecklist.spec.tsx`, 2 de `enc_soporte` en RBAC).

## B. Desplegar (en este orden; cada paso es reversible salvo el último)
```bash
# 1. Subir
git pull --rebase origin main && git push origin main

# 2. En el servidor (ssh nexara  ó  ssh -p 2222 root@5.78.215.109)
cd /var/www/nexara-app && git pull --ff-only origin main && ./deploy/update.sh

# 3. Empresa de Nexara: ver su id
docker exec nexara-api sh -c 'cd /app/apps/api && npm run seed:plantillas -- --list-companies'

# 4. Activar «Pagos solo CEO» en esa empresa (el API relee la política cada 30 s)
docker exec -i nexara-db psql -U <usuario> -d <base> -v company_id=<ID> -f - < apps/api/scripts/set-module-policy.sql

# 5. Cargar plantillas: primero simula, luego aplica
docker exec nexara-api sh -c 'cd /app/apps/api && npm run seed:plantillas -- --company-id=<ID>'
docker exec nexara-api sh -c 'cd /app/apps/api && npm run seed:plantillas -- --company-id=<ID> --apply'

# 6. Revisión de facturación (solo lee)
docker exec nexara-api node /app/apps/api/dist/pac/pac-preflight.cli.js --db
```
Comprobar después: con la contadora, `GET /api/employee-payments` → 403 y el módulo ya no sale en su menú; con Christian, todo igual; la contadora sigue timbrando/consultando Facturación.
**Ojo:** el disco del servidor está al ~75 %; el build deja imágenes nuevas. Limpiar caché de build después.

## C. Encender la facturación CFDI real — por etapas, con Christian presente
Se enciende con el **CSD de la empresa** (no la e.firma) y la cuenta del proveedor (Facturama). Runbook completo en `docs/CFDI-GO-LIVE.md`. **Antes de producción** conviene resolver o validar en sandbox:

| Riesgo | Dónde | Estado |
|---|---|---|
| Facturama probablemente no devuelve XML/PDF en la creación; el código lo espera | `pac/adapters/facturama.adapter.ts:165-175` | Validar en sandbox |
| Cancelación usa el UUID; Facturama usa su `Id` interno (no se guarda) y `accepted` va fijo | `facturama.adapter.ts:177-193` | Validar/arreglar |
| Sin timeout hacia el PAC; un corte tras timbrar devuelve a borrador y un reintento puede **duplicar** el CFDI | `accounting.service.ts:2015-2047` | Arreglar |
| `cancelInvoice` ignora `accepted`, no revierte la póliza `INV-STAMP-<id>` ni valida el UUID sustituto | `accounting.service.ts:2870-2887` | Arreglar |
| Sin validación forma/método de pago (PUE con 99, PPD sin 99); default FP99+PUE | schema `:3845` | Arreglar |
| Rellenos silenciosos: régimen 601, uso G03, clave 80101500 | `accounting.service.ts:1853,1866,160` | Quitar |
| `getInvoiceIssuerProfile()` se llama sin empresa | `:1955` | Pasar la empresa |
| Complemento de pago con Facturama sin impuestos por documento | `facturama.adapter.ts:102-147` | Validar en sandbox |
| **SW/Finkok:** la cadena original omite impuestos y fija 16 % | `pac/cfdi-xml.builder.ts` | **No usarlos** sin corregir |
| **No hay botón «facturar desde cotización/proyecto»** | `web/lib/sales-api.ts:1207` sin uso en la UI | Construir |
| `./deploy/nexara.sh restart` **no relee** `.env.nexara` | deploy | Recrear el contenedor: `docker compose … up -d --no-build api` |
| Con `NODE_ENV=production` y `PAC_PROVIDER=facturama` sin credenciales la API **no arranca** | `pac.service.ts` | Saberlo antes de cambiar variables |

Puesta en marcha (persona = Christian o el dueño de las credenciales): cuenta y folios de Facturama → CSD cargado en la cuenta del proveedor → variables en `deploy/.env.nexara` (fuera de git) → sandbox → **una** factura desde una cotización → validar XML/PDF/UUID y póliza → producción. **Ningún agente teclea credenciales ni timbra.**

## D. Nómina quincenal (lo que Christian hace cada 15 días)
Hoy: `EmployeePayment` con fechas libres; pre-nómina neta en pantalla; borradores por lote con **otro cálculo** (horas brutas con comida + extras aprobados); base = `UserProfile.sueldoSemanal` (minuto = semanal / (5 × 480); extra aprobado × 2); «marcar pagado» genera la póliza sin paso del CEO.
Propuesta (ya escrita en `docs/erp-automation-map.md`):
1. Config de empresa `nominaFrecuencia` (`quincenal`) y `nominaDiaCorte` (15 y fin de mes).
2. Función pura `periodoCerrado(hoy, frecuencia, diaCorte)` con pruebas.
3. Cron (lunes o al día siguiente del corte, 8:00 MX) por empresa con cadencia: avisar **solo a quien ve Pagos** (respetando la política) «La pre-nómina del periodo X está lista para revisar», con enlace a la pantalla. Una vez por empresa y periodo.
4. **No** crear `EmployeePayment` solos hasta unificar los dos cálculos (los borradores bloquean el cierre contable).
5. Datos que faltan: CLABE/banco por empleado, layout de dispersión del banco, retenciones ISR/IMSS, CFDI de nómina (hoy se declara «no CFDI nómina»).
6. Que «marcar pagado» sea del CEO (o requiera su firma).

## E. Aprobaciones para que el CEO solo apruebe
1. **Christian define los montos** (propuesta en `MODELO-AUTOMATIZACION-PARAMETRIZADO`) y se conectan `getRequiredApprovers`/`buildApprovalChain` (`common/rbac/approval-policy.ts`) a cotizaciones y compras: hoy **ningún servicio las consume** y la tabla `ApprovalThreshold` que citan no existe.
2. **Asignar aprobadores** en las definiciones sembradas (`workflow-seed.service.ts`) y una **UI** para hacerlo (`RequestApproval.tsx` no la usa ninguna página).
3. **Importe en la bandeja web** (`erp/approvals/page.tsx:70` dice «folio N») y en `WfInstanciaDto` de Android.
4. **Móvil:** Android aprueba workflow, viáticos y gastos; falta cotización, OC, requisición, pago a personal y horas extra. iOS solo viáticos (Aprobaciones, Ejecutivo, Cotizaciones, Gastos y Pagos son marcadores). Android no tiene pantalla ejecutiva.
5. Avisar al CEO cuando un **viático** llega a su paso (hoy solo se notifica al solicitante al final).
6. **Cotización aprobada por dentro** (`aprobar`, `cotizaciones.service.ts:1678-1704`) no marca la oportunidad ganada ni crea proyecto; solo lo hace la firma del cliente (`applyQuoteSignedSideEffects`). Y solo si la cotización está ligada a una oportunidad.
7. `checkMargin` (regla global de 20 % mínimo) **no se llama** al crear, editar ni enviar.
8. El proyecto > $500 k pasa a «en curso» al instante: la aprobación no lo frena.
9. **Identidad del CEO por correo, no por rol:** `CEO_EQUIVALENT_EMAILS` (`common/platform-accounts.ts:29`). Un usuario con rol `ceo` sin ese correo recibiría 403 en `/api/viatics`, `/api/expenses` y `/api/accounting`. Revisar antes de crear otro CEO en otra empresa.

## F. Cobranza y facturación recurrente
- Resumen diario **al CEO** de facturas vencidas (hoy: correo al creador, incluye CxP, sin dedupe; nada en app).
- Marcar `OVERDUE` (nadie lo escribe) o mantener el cálculo por fecha en todos los lugares.
- «Trabajo cerrado sin facturar»: usar `Invoice.activityId`.
- Facturación recurrente de pólizas desde `MaintenanceContract.monthlyFee`.

## G. Cotizaciones (detalle en `ESQUEMA-COTIZACIONES`)
1. Precios escalonados por cantidad y centro de entrega (anexo de licitación, MXN/USD).
2. Partidas agrupadas por sede/planta/área con subtotal.
3. Referencias del cliente (RITM, SP, OC, región) en portada.
4. Endpoint de solo lectura del catálogo de kits para el checklist de una OT.
5. Mostrar proveedor/costo por partida en la vista interna; «ahorro a 2 años» en licencias.
6. Dos avisos de cotización vencida al autor (`entityType` `Cotizacion` vs `COTIZACION`): unificar.

## H. Importaciones (necesitan archivos de Christian)
- **Nómina histórica:** Excel «1QNA/2QNA» → `EmployeePayment`: mapear empleado, periodo, minutos/monto, estado. Requiere que Christian entregue los Excel.
- **84 cotizaciones históricas:** empezar por las recientes; se necesita un importador (no existe uno para cotizaciones).

## I. Higiene técnica y seguridad
- Servidor: quitar `PasswordAuthentication`, rotar logs de Docker, `fail2ban` o limitar SSH, **respaldo diario de las bases** (no existe).
- `prisma/seed-demo-users.ts:360` tiene una cadena sin cerrar: `tsc -p prisma/tsconfig.seed.json` falla en el repo completo (con o sin estos cambios).
- 6 pruebas web previas: `HerramientasChecklist.spec.tsx` (4) y `enc_soporte` (2).
- Crons todavía en UTC que no importan por horario (cada N minutos/horas); `smart-quote` a las 06/14/22 h está en UTC.
- `overdueInvoices` y demás KPI: mantener `kpiFallback` para que un cero no esconda una falla.

## J. Decisiones que necesita de Christian
1. Montos de aprobación (cotizaciones, compras, viáticos, gastos, proyectos).
2. Calendario de nómina (¿15 y último día?) y quién más ve Pagos.
3. Contratar folios de Facturama y fecha de puesta en marcha.
4. Entregar Excel de nómina y las 84 cotizaciones.
5. Activar respaldo diario.
6. **Proteger su e.firma** (cifrar o gestor de contraseñas; cambiar la contraseña si se compartió por chat).
