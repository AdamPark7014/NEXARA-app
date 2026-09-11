# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-10
- **Rama:** mejora/calidad-y-web
- **HEAD:** (ver git al cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — PDF mapa productos/módulos

### Hecho

1. Generado **`docs/NEXARA-MAPA-PRODUCTOS-Y-MODULOS.pdf`**: diagrama de productos + flujo Lead→Factura + detalle de los **103 módulos** del `access-matrix` (ERP/CRM/OPS/Studio/Integra/Lab) + Portal.
2. Generador: `scripts/gen-nexara-product-map-pdf.py` (fuente `.ai/modules-catalog.json`).
3. Contenido anclado a ARQUITECTURA_V2, AREAS-VS-SISTEMA, CONEXION-MODULOS, INTEGRA-OPS — no inventa endpoints.

### Verificar

- Abrir el PDF y validar si el nivel de detalle por módulo basta o si Adam quiere ampliar un producto concreto (p.ej. solo OPS o solo Integra).

## A medias / siguiente

- Nada de código de producto pendiente de esta ola.
- Opcional: regenerar PDF tras cambios de menú (`python scripts/gen-nexara-product-map-pdf.py`).

## No tocar

Puente NAS. Credenciales. No fingir EN VIVO. No `git reset --hard` sin pedirlo Adam.
