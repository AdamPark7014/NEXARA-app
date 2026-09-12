# EXEC-PACKET — NEXARA-app

- **Escrito por:** Cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **Estado:** CERRADO

## Objetivo

Módulo Clientes Core: 3 sectores, fiscal, matriz encargados, proyectos por cliente, pickers en actividades.

## Criterios de éxito

- [x] Prisma ClientSector + SalesClientSector + migración/backfill
- [x] API list/create/sectors + fiscal + filtro matriz
- [x] Sidebar erp-clients ola1 + RBAC + canSeeClientesModule
- [x] Hub + 3 listas + nuevo + detalle (+ proyectos)
- [x] OpsActivityForm pickers servicio/comercial + filtro proyectos

## Pasos

Hechos en este turno.

## Handoff

Reiniciar API (`prisma generate` EPERM si nest tiene el DLL). Hard refresh Core → Clientes.
