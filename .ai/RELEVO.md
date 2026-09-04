# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — ERP shell UX (amigable / denso)

Ownership: AppShell + chrome de páginas ERP (no motores PDF / hybrid /
identidad ACS).

### Entregado (shell UX)

1. **PageChrome** + `PageHeader density="ops"`; FilterToolbar / EmptyState densos.
2. **Rails**: SettingsModuleRail, FinanceModuleRail, ErpModuleCards + erp-chrome.css.
3. **Labels ES** access-matrix + breadcrumbs (Analítica, Base de conocimiento,
   Registro de auditoría, Bancos, Documentos→Gobierno…).
4. **AppShell** ERP/OPS más denso (248px, menos glow).
5. **Callejones**: approvals→mapa; settings ES+rail; facilities→Integra;
   documentos/finanzas chrome.

### Concurrente en disco (siblings — no pisar)

- Identidad unificada ERP↔ACS (`IdentityLinkService`, Personas link, my-profile).
- Stock kardex hiper-detallado; PTZ/Eventos/Personas ACS; OC PDF CRM.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh`

### Verificar shell UX (hard refresh)

1. Sidebar ERP: labels claros + densidad.
2. Configuración / CFDI / Bancos: rails.
3. Aprobaciones: sin botón muerto.
4. Accesos oficinas → banner Integra.

## A medias

1. Portal empleado · NVR httpHost · ANPR · micros · TCPMSS.
2. FieldDetection; más páginas ERP aún en PageHeader default.
3. Identity link: wire completo + push fan-out (sibling).

## No tocar

Puente NAS, Traefik, credenciales.
No pelear siblings identidad/PTZ/Personas/Eventos/asistencia/OC PDF/stock.
