# EXEC-PACKET — NEXARA-app

- **Escrito por:** Cursor (ejecutor; plan Adam aprobado)
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **Estado:** EN EJECUCION

## Objetivo

Flujo de evidencia **por persona** en Core: indicaciones generales + por miembro, N fotos (2–8), form por `coreKind`, PDF hoja solo en servicio, barras en Actividades, historial embebido. Fuera: móvil nativo.

## Criterios de éxito

- [ ] Cada assignee tiene su `ActivityEvidence`; cierre cuando todos COMPLETED
- [ ] Asignar: generales, notas por persona, stepper 2–8, `coreKind`
- [ ] PDF solo servicio; no-PDF rechazado
- [ ] Barras % bajo avatar; finalizadas de días previos ocultas del card
- [ ] Historial con fotos/PDF embebidos
- [ ] tests: smoke API evidence + board types
- [ ] verificación manual: asignar multi → avanzar pasos → ver barras

## Contexto mínimo a cargar (≤7 archivos)

- `apps/api/prisma/schema.prisma` (Activity, ActivityEvidence, ActivityAssignee)
- `apps/api/src/activities/evidence/activity-evidence.service.ts`
- `apps/api/src/activities/activity-team.service.ts`
- `apps/api/src/me/team-board.service.ts`
- `apps/web/components/ActivityEvidenceFlow.tsx`
- `apps/web/app/(panels)/erp/pizarra/[userId]/asignar/page.tsx`
- `apps/web/app/(panels)/erp/pizarra/page.tsx`

## Archivos a tocar (máx 12 + migraciones)

| Archivo | Acción | Notas |
|---------|--------|-------|
| schema.prisma | editar | coreKind, evidencePhotoRequired, userId evidence |
| migration SQL | crear | backfill userId |
| create-activity.dto + activities.service | editar | campos nuevos + seed evidence LEAD |
| activity-team.* | editar | indicaciones + ensure evidence |
| activity-evidence.service | editar | por userId, N fotos, skip PDF |
| team-board.service + api | editar | openActivities + % |
| asignar/page + ops form | editar | UX generador |
| ActivityEvidenceFlow | editar | pasos/templates |
| pizarra pages | editar | barras + historial |

## Pasos numerados

1. Schema + migración + prisma generate
2. API create/team/evidence por userId
3. UI asignar
4. UI evidencia
5. Board bars
6. Historial
7. packet close + relevo

## Tests / verificación

```powershell
cd C:\dev\apps\NEXARA-app\apps\api
npx prisma migrate deploy
npx prisma generate
```

## Workers

- **NO_LLM:** rg, prisma migrate, git
- **LOCAL:** ollama_implement tickets; no reescritura ciega de archivos grandes
- **MCP:** ollama-worker

## No hacer / riesgos

- No tocar plan file del usuario
- No `findUnique({ activityId })` tras migración
- Verificar tamaño tras ollama apply

## Handoff a Cursor

Implementa el plan Flujo evidencia multi-persona aprobado; cierra con relevo.
