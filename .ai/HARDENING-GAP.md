# NEXARA HARDENING — Phase 0 Architect Board

**Repo:** `C:\dev\apps\NEXARA-app` · **Branch:** `mejora/calidad-y-web` · **HEAD base:** `74f0f821`  
**Mode:** Autonomous productization · Zero-regression · Parallel swarm  
**Rule:** Audit before write · One writer per worktree · No CFDI invention · No NAS bridge change

## Swarm (Phase 0 — AUDIT only)

| Agent | ID | Scope |
|-------|-----|--------|
| Tools/RBAC/Kits | 22dee028… | loans, labels, kits, approve/request |
| Warehouse/Scanner | 4e63b3bc… | HID, movements, stock audit |
| Activities/Evidence | 63939b5f… | photos, ZIP, peer, PDF |
| Org/KPI/Payroll | 6bb60415… | orgchart, KPIs, prenomina |

## Already shipped (do NOT rebuild)

- Tools RBAC: Christian+Iván manage; JA+David loan create (email lists + API)
- Labels PDF/ZPL + barcode fields + Core scanner tab
- Orgchart: Christian DG root; Claudia tester excluded; puestos script
- ActivityPeerRequest + rejectionReason path
- Prenomina OT×2 + HR/finance pages (no CFDI)
- UI density shell/almacen/org/section-views (4 opt worktrees merged `7322717c`)

## Architect findings (pre-audit deep dive)

| Finding | Severity | Action |
|---------|----------|--------|
| `CONSOLE_ADMIN \|\| TOOLS_MANAGE` in tool-requests.service (~6 sites) | CRITICAL | Agent hard-rbac: email-only manage |
| PDFViewer `dpr * 0.85` | HIGH | Agent hard-pdf: full DPR + zoom |
| Kits = ToolKitAssignment (item↔user), not separate Kit aggregate | PARTIAL | Defer new Kit entity; enhance assignment UX later |
| Evidence ZIP + peer requests + prenomina + scanner | DONE/PARTIAL | Audit agents confirm gaps |
| Org zoom/search | MISSING | Agent hard-org-ux |
| Activity photo size | PARTIAL | Agent hard-act-photos |

## Audit: Warehouse/Scanner ([Audit warehouse](4e63b3bc-a3d1-4683-89ee-e0a55cf7f663))

| Req | Status | Notes |
|-----|--------|-------|
| HID debounce+Enter | PARTIAL | Enter OK; falta debounce/buffer |
| scan→ops→movement | PARTIAL | Solo RECEIPT |
| Movement types | PARTIAL | API 8; UI create 5; sin RETURN/CONSUME en create |
| Auditable stock | DONE | Solo vía StockMovement |
| Core density | PARTIAL | Escáner flojo; page.spec stale |

**Priorities → worktree `feat/hard-warehouse`:** debounce S · multi-op scanner M · RETURN en create S · fix page.spec S  
**Implementer:** [Warehouse scanner multi-op](047cdf2a-1ed4-444d-ba9d-0fb3621b0e69)

## Phase 1 implementers (parallel worktrees)

| Branch | Worktree | Focus |
|--------|----------|--------|
| feat/hard-rbac | nexara-hard-rbac | Tools approve email gate |
| feat/hard-pdf | nexara-hard-pdf | PDF sharpness |
| feat/hard-act-photos | nexara-hard-act-photos | Evidence gallery |
| feat/hard-org-ux | nexara-hard-org-ux | Org search/zoom |
| feat/hard-warehouse | nexara-hard-warehouse | Scanner multi-op + debounce |

## Audit: Tools/RBAC/Kits ([Audit tools/RBAC](22dee028-c6de-4c3b-ba42-8cb48ffbb2da))

| Req | Status | Notes |
|-----|--------|-------|
| Approve Christian+Iván API | PARTIAL | TOOLS_MANAGE by email OK; superadmin bypass; renewals Iván broken |
| Request JA+David API | DONE | assert on create |
| David request UI | **BROKEN** | OPS_MANAGERS → manage sin form |
| Iván approve UI | **BROKEN** | ing_campo → execute sin cola |
| Loan lifecycle 11 steps | PARTIAL | 5 estados reales |
| Catalog fields | PARTIAL | falta category/cost/warranty/history; codigoInterno no unique |
| Labels QR | PARTIAL | PDF/ZPL Code128; sin QR |
| Kit entity | MISSING | solo ToolKitAssignment item↔user |
| Transition audit | MISSING | |

**Agents:** hard-rbac (API email gate) · **feat/hard-tools-ui** (section-views + ops/tools by email)


| Item | Status | Notes |
|------|--------|-------|
| Unified cards | PARTIAL | Mis actividades layout distinto (aceptado por diseño) |
| Gallery+lightbox | PARTIAL | Review OK; capture click=delete |
| Fields antes/durante/después | PARTIAL | API+ZIP OK; **web sin POST foto por campo** |
| Structured ZIP | DONE | |
| Peer rejectionReason | DONE API / PARTIAL UX | Botón Rechazar no deshabilitado |
| Asignadas filters/SLA | PARTIAL | Datos sí; chips filtro no |
| PDF quality | PARTIAL | canvas pdf.js + 0.85 → hard-pdf |

**Priorities →** hard-pdf (en curso) · hard-act-photos (en curso) · **feat/hard-act-flow** (captura campos + reject UX + filtros asignadas)


| Agent | Scope |
|-------|--------|
| [Audit tools/RBAC](22dee028-c6de-4c3b-ba42-8cb48ffbb2da) | loans/kits |
| [Audit warehouse](4e63b3bc-a3d1-4683-89ee-e0a55cf7f663) | scanner/stock |
| [Audit activities](63939b5f-b053-46e4-bdf9-36b1d6edc585) | photos/ZIP/PDF |
| [Audit org/KPI/payroll](6bb60415-0e1f-44a3-aaa0-8f7d3514c627) | org/KPI/prenomina |

## Audit: Org/KPI/Payroll ([Audit org/KPI/payroll](6bb60415-0e1f-44a3-aaa0-8f7d3514c627))

| Area | Status | Notes |
|------|--------|-------|
| Christian root / Claudia out / Josué→Christian | DONE | code+script |
| JA/David/Luis/Daniela managerId→Christian | PARTIAL | script solo puestos |
| Org zoom/pan/search | MISSING | → hard-org-ux (en curso) |
| Workflow KPIs | DONE | reales (`me/kpis/flujo`) |
| Prenomina OT×2 + drafts | DONE | sin CFDI |
| HR vs Finance prenomina parity | PARTIAL | HR más delgada |
| Draft approval gate | PARTIAL | Borrador→Pagado sin firma RH |

**Worktrees:** `feat/hard-org-mgrs` (script managers) · `feat/hard-prenomina` (HR parity + optional draft gate)

---

# OLA CONTADORA — workspace financiero `/erp/contabilidad`

**Base:** `07016b6c` · **Fecha:** 2026-09-20 · **Cabeza:** claude-code

## Auditoría previa (qué NO hay que reconstruir)

El backend contable ya es profundo — `accounting.service.ts` (3,764 líneas) tiene:
CFDI real (stampInvoice, PAC, complementos de pago, notas de crédito, cancelación),
DIOT, catálogo XML/balanza SAT, periodos fiscales con cierre/reapertura,
pólizas con posteo y reversa, three-way match, banca (importar/conciliar),
presupuestos, centros de costo, estado de resultados / balance / balanza.

Cursor ya dejó el hub funcionando: sidebar por tarea, dashboard con datos reales
(`getWorkspaceDashboard`: aging CxC/CxP, alertas accionables, flujo del periodo),
y 13 páginas conectadas a API real. **No es maqueta.**

## Huecos reales detectados

| Vista | Estado previo | Hueco |
|-------|---------------|-------|
| Movimientos | Solo facturas | No es libro: faltan Payment, Expense, BankTransaction, EmployeePayment |
| CxC / CxP | Componente genérico compartido | Sin aging, días vencido, detalle, registrar pago, calendario CxP |
| Conciliación | Manual | Sin motor de sugerencias ni pantalla dividida |
| Cierres | Cierra sin verificar | Sin lista de verificación ni garantía de bloqueo |
| Auditoría | Tabla plana | Sin antes/después |
| Proveedores | Derivado de facturas | Ignora el modelo `Supplier` que ya existe |
| Proyectos | Derivado de facturas | Sin desglose de costos ni drill-down |
| Reportes | Rejilla de enlaces | No es módulo de reportes |
| Presupuestos | Lista | Sin comparativo contra real |
| Pre-nómina | `router.replace` | Sin resumen propio en el hub |
| RBAC contadora | Rutas abiertas por rol | Sin tests de 403 por backend |

## Swarm ola contadora (7 worktrees paralelos)

| Rama | Worktree | Alcance |
|------|----------|---------|
| feat/cont-ledger | nexara-cont-ledger | Libro de movimientos unificado + CSV |
| feat/cont-cxc | nexara-cont-cxc | Aging CxC/CxP, detalle, pagos, calendario |
| feat/cont-concilia | nexara-cont-concilia | Motor de matching + pantalla dividida |
| feat/cont-cierre | nexara-cont-cierre | Checklist de cierre, bloqueo real, auditoría antes/después |
| feat/cont-vendors | nexara-cont-vendors | Proveedor 360° + P&L por proyecto |
| feat/cont-reportes | nexara-cont-reportes | Catálogo de reportes + presupuesto vs real |
| feat/cont-rbac | nexara-cont-rbac | 403 por backend, gating de sidebar, pre-nómina en hub |

**Regla anti-conflicto:** cada agente crea archivos NUEVOS en `apps/api/src/accounting/`.
El único archivo compartido es `accounting.module.ts` (una línea por provider/controller).

## Ramas backlog-* — superadas, NO mergear

`feat/backlog-{actividades,tools,orgchart,prenomina}` quedan 1 commit "adelante"
pero su contenido ya está en `mejora/calidad-y-web` (verificado archivo por archivo).
Mergearlas revertiría correcciones posteriores (p. ej. la nitidez de `PDFViewer`).
Se dejan intactas, sin borrar.

## Bloqueo de despliegue

`~/.ssh/config` tiene `hetzner-nexara` con `HostName REEMPLAZA_CON_IP_HETZNER`.
Sin la dirección real ni la llave, el deploy no sale de esta máquina.
Requiere a Adam.

## Resultado de la ola contadora

7/7 ramas integradas en `mejora/calidad-y-web`. 17 commits, 50 archivos,
+17,618 / −690.

**Verificación:** `tsc --noEmit` limpio en API y web. Web 965/965 en 79 archivos.

**Lo que ninguna de las siete misiones pedía y salió de auditar:** seis fallos
de producción (pólizas automáticas que nunca se contabilizaban, fuga entre
empresas por `reference`, fuga entre usuarios en la caché offline, XML/PDF de
factura siempre 404, Proyectos agrupando por un campo inexistente, y la prueba
del panel contable que nunca corrió). Detalle en `.ai/RELEVO.md`.

**Lo que sigue abierto y no se disimuló:** el periodo cerrado no está blindado
en 7 rutas de escritura (`registerPayment` es la peor: mueve saldo bancario),
`AuditLog` no guarda estado anterior fuera del cierre, y 3 suites de API siguen
rojas desde la ola anterior.
