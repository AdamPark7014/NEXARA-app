# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Pizarra: encargados ven sus actividades

### Hecho

- Causa: `TeamBoardService.resolveScope` excluía al propio viewer → David solo veía reportes.
- Subtree (encargados): ahora **incluye al viewer** (tarjeta propia + actividades asignadas).
- Company-wide (CEO/developer): sigue sin auto-tarjeta; Christian sigue oculto en todas las pizarras.
- UI: tarjeta «Tú» destacada primero; en detalle propio no se muestra «Asignar actividad».

### Verificar

1. Reiniciar API (cambio en Nest).
2. Login como David → Actividades: debe aparecer su tarjeta + las de su equipo.
3. Actividades que Christian le asignó deben verse al tocar su tarjeta.

## A medias

Nada.

## Siguiente

Lo que Adam diga.

## No tocar

Puente NAS. Plan file.
