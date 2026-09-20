# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** (UX Contadora clarity)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho

1. Hub Contadora shipped (`ddb0b023`).
2. **UX Contadora:** dashboard 3 cifras + «Requiere atención» (no pared de KPIs); nav agrupada por tarea; listas CxC/CxP/facturas con 4 columnas + modal detalle; estados en español; acción primaria clara; copy humano en cierres/movimientos/conciliación.

## A medias

- Deploy Hetzner (SSH key en este entorno).
- Worktrees hardening restantes.

## Siguiente

1. Deploy + smoke contadora.
2. Merge hardening.

## No tocar

Puente NAS.
