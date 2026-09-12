# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Asistencias: roster por jerarquía

### Hecho

- Causa: `getAccessibleUsers` filtraba por **departamento**. Encargados (David en Operaciones) no veían a campo (Ingeniería) → solo ellos mismos como «Ausente» sin checada.
- Ahora: activos del tenant + `scope=subtree` por `managerId` (igual espíritu que pizarra).
- CEO/company-wide: ~11 activos (sin Christian, sin cuentas apagadas).
- David: él + 3 instaladores.
- UI: etiqueta **Sin checada** (ya no «Ausente» engañoso).

### Verificar

1. Reiniciar/recargar API si hace falta.
2. Christian → Asistencias: lista completa del equipo, no solo David.
3. David → Asistencias: David + Israel + Joan + Juan José.

## A medias

Nada.

## Siguiente

Lo que Adam diga.

## No tocar

Puente NAS. Plan file.
