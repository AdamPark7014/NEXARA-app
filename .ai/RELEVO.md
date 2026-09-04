# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — ERP shell UX (amigable / denso)

Ownership: AppShell + chrome de páginas ERP (no motores PDF/hybrid).

### Entregado

1. **PageChrome** + `PageHeader density="ops"`: título denso, primaria,
   secundarias, filtros. FilterToolbar / EmptyState más ops.
2. **Rails**: `SettingsModuleRail`, `FinanceModuleRail`, `ErpModuleCards`
   + `erp-chrome.module.css`.
3. **Labels ES** en access-matrix (Analítica, Base de conocimiento,
   Registro de auditoría, Bancos, Documentos en Gobierno, etc.) y
   breadcrumbs AppShell.
4. **AppShell denso** ERP/OPS (sidebar 248px, menos glow, padding tight).
5. **Callejones**: approvals → mapa (fuera “Definir flujos” toast);
   settings EN→ES + rail; facilities → enlace Integra + estados ES;
   documentos eyebrow Gobierno; facturación/bancos/contabilidad con rail.

No toqué: hybrid asistencia, PDF OC/cotización, Integra siblings,
stock kardex (turno hermano).

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh`

### Verificar (hard refresh)

1. ERP sidebar: labels en español claros; densidad.
2. Configuración / Facturación CFDI / Bancos: rails de contexto.
3. Aprobaciones: sin botón muerto; Excel en filtros.
4. Accesos oficinas: banner hacia Integra.

## A medias

1. Portal empleado · NVR httpHost · ANPR · micros · TCPMSS.
2. FieldDetection; employeeNumber↔personId.
3. Más páginas ERP aún con PageHeader “default” (migración gradual).

## No tocar

Puente NAS, Traefik, credenciales.
No pelear siblings PTZ/Personas/Eventos/asistencia/OC PDF/ACS/stock kardex.
