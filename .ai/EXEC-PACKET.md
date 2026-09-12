# EXEC-PACKET — NEXARA-app

- **Escrito por:** Cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **Estado:** CERRADO

## Objetivo

Flujo evidencia multi-persona Core: indicaciones, N fotos, form por tipo, PDF solo servicio, barras, historial.

## Criterios de éxito

- [x] Evidence por (activityId, userId); cierre cuando todos COMPLETED
- [x] Asignar: generales, notas por persona, stepper 2–8, coreKind
- [x] PDF solo servicio; helpers + UI
- [x] Barras % en Actividades; finalizadas de días previos ocultas
- [x] Historial embebido en perfil
- [x] tests: evidence-flow.helpers.spec.ts
- [x] verificación: migrate deploy OK

## Pasos

1–6 hechos en este turno.

## Handoff

Completado. Siguiente agente: smoke manual en UI si API reiniciada (prisma generate EPERM si nest tiene el DLL).
