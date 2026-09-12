# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — UI Clientes + sidebar

### Hecho

- `/crm/clients` redirige a `/erp/clientes` bajo `CORE_SURFACE_ONLY` (el CRM vacío era el “sidebar desaparecido”).
- Clientes Core rediseñado: una pantalla con tabs de sector + lista densa + un solo CTA Nuevo.
- Nuevo / detalle más compactos (CSS module).
- Rutas `/proyecto|corporativo|comercial` → `?sector=`.

### Verificar

- Ir a Core → Clientes (no CRM). Sidebar: Chat, Actividades, Asistencias, Clientes.
- Tabs cambian lista sin páginas extra.
- Hard refresh.

## A medias

Nada.

## Siguiente

Smoke con Christian.

## No tocar

Puente NAS. Plan file.
