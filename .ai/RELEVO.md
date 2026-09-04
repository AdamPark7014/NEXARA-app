# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — ERP / Ops / Stock shell UI polish

Chrome denso ES profesional en shells de operación, RRHH y almacén.
No toqué Integra Personas/biometrics, asistencia híbrida ni motor PDF OC.

### Qué hay

1. **`PanelTabs` + `ContextRail`** — pestañas/píldoras con tokens `--nx-panel-*`
   (sustituyen botones primary/secondary y tabs ad-hoc).
2. **`TabBar` (detalle OT/cliente)** — mismos tokens + acento de panel.
3. **AppShell ERP/OPS** — nav densa (inset accent, menos glow), padding main
   más compacto.
4. **Ops actividades** — header con acciones, KPIs sin emoji, barra de avance
   densa, `PanelTabs` Bandeja/Evidencias; board con copy ES limpio.
5. **DashKit** — gap/eyebrow más densos (dashboard OPS).
6. **ERP RRHH** — `HrModuleRail` en plantilla/asistencia/org/KPIs/multas/comidas;
   tabs densas; sin pelear `HybridAttendancePanel`.
7. **Almacén** — header/list chrome + `ContextRail` catálogo; tabs densas;
   KPIs inventario sin emoji. **No** reescribí timeline de movimientos.
8. **Compras** — `PanelTabs` (PDF OC intacto).

### Concurrente (siblings — no pisar)

Face ACS JPEG / Personas biometrics · CRM OC PDF · stock movements detail ·
PTZ · hybrid attendance internals.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `deploy/update.sh --force-all` (rebuild api+web)

### Verificar (hard refresh)

1. `/ops/activities` · `/ops/dashboard` — chrome denso, tabs underline.
2. `/erp/hr` y subrutas — rail RRHH + tabs; asistencia híbrida intacta.
3. `/erp/warehouse` — rail catálogo + Inventario; pestaña Movimientos intacta.
4. `/erp/procurement` — tabs densas; PDF OC sigue funcionando.
5. Sidebar ERP/OPS — ítem activo con inset, sin barra flotante.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Alinear códigos employeeNumber↔personId en plantilla real Oficinas.
3. go2rtc.yaml en disco corruptible — streams viven en RAM.
4. FieldDetection re-apply tras sync/push install.

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
Face ID óptico inventado. No pelear PTZ pad / Personas CRUD / hybrid
attendance / stock detail / OC PDF renderer del sibling.
