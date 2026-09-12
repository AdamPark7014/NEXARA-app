# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Indicaciones del responsable (LEAD)

### Hecho

- En `/erp/pizarra/[userId]/asignar`: textarea **Indicaciones para {responsable}** siempre visible (sección 2), no solo para extras.
- Tras crear la actividad, si hay notas del LEAD se hace `POST …/team` con `rol: "LEAD"` + `indicaciones` (sin degradar a TECNICO).
- Extras siguen con sus textareas personales.

### Verificar

- Asignar a alguien → escribir indicaciones del responsable (sin sumar extras) → crear → en evidencia/historial deben verse esas notas en el assignee LEAD.
- Hard refresh del form de asignar.

## A medias

Nada.

## Siguiente

Lo que Adam diga (probar en UI local).

## No tocar

Puente NAS. Plan file bajo `.cursor/plans/`.
