# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** `007c91ff` (en Hetzner; web+api healthy)
- **Migraciones:** ya aplicadas `2026092001*`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno (UX pantallas)

1. **Movimientos:** filtros en toolbar del cuerpo (ya no aplastan el subtítulo); CTA «Registrar movimiento» en header.
2. **Section:** header wrap + subtítulo con `maxWidth`.
3. **Herramientas:** `resolveAssetUrl` en fotos; estado en español con badge; botones en grid uniforme; inventario montado en Core `/erp/almacen?tab=herramientas`.
4. **Organigrama:** KPI «Sin manager» por `managerId == null` (no `roots.length`); nodos sin ellipsis agresivo; bloque «Sin línea de reporte válida» para huérfanos.

## Siguiente

- QA visual en prod: Movimientos, Herramientas (fotos Martillo), Organigrama KPIs.
- Reasignar jefes inválidos desde ✎ si aparecen en el bloque huérfanos.
- Rotar Maps key / contraseñas: lado Adam.

## No tocar

Puente NAS.
