# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/opt-opt-almacen
- **HEAD:** (este commit)
- **Worktree:** `C:\dev\apps\_worktrees\nexara-opt-almacen`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

1. **VistaAlmacen `embedded`:** sin barra de acciones duplicada bajo PageHeader; acciones en la misma fila que sub-pestañas (Inventario). En Movimientos solo, Actualizar/Registrar en el Section.
2. **Herramientas:** gap 10; Recolección densificada; copy acortado.
3. **ToolInventoryPanel:** wrapper/form gap 8, fotos galería 140px, form denser en desktop (campos + Agregar en una fila), hints cortos.

## A medias

- Nada.

## Siguiente

- QA visual `/erp/almacen` Inventario / Movimientos / Herramientas (claro/oscuro, 375px).
- Merge del worktree a la rama principal cuando Adam lo pida.

## No tocar

Puente NAS. API / RBAC.
