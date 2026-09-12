# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Encargo: Ejecución directa vs Despacho

### Hecho

Al asignar a David / Antonio / Luis / Josué (encargados), Christian elige:

1. **Ejecución directa** — la hace él personalmente.
2. **Despacho a equipo** — él coordina y la asigna a subordinados.

- Campo `Activity.assignmentCharge` (`ejecucion` | `despacho`) + migración.
- Paso «2 · Encargo» en `/erp/pizarra/[id]/asignar`.
- Badge en historial / tarjetas de pizarra.

### Verificar

1. **Reiniciar API** (`prisma generate` falló EPERM mientras nest tiene el DLL).
2. Como Christian → asignar a David → elegir Ejecución o Despacho → crear.
3. Ver badge en perfil / pizarra.

## A medias

Nada (salvo reinicio API para Prisma client).

## Siguiente

Lo que Adam diga.

## No tocar

Puente NAS. Plan file.
