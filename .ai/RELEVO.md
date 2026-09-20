# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** `2a2529a6` (Hetzner healthy; script org corrido)
- **Migraciones:** ya aplicadas `2026092001*`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

1. **Organigrama:** Christian (`gerencia@`) vuelve a salir como DG raíz; Claudia (`claudia.bernal@`) excluida del chart (tester).
2. Seed demo: puesto Claudia → «Tester de plataforma».
3. Script `fix-org-puestos-jefes.js` actualizado y corrido en prod (1 cambio: puesto Claudia).

## Siguiente

- QA: recargar `/erp/organigrama` — raíz = Christian; sin bloque huérfanos por Christian excluido.
- Rotar Maps key / contraseñas: lado Adam.

## No tocar

Puente NAS.
