# EXEC-PACKET — NEXARA-app

- **Escrito por:** Claude (cabeza)
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **Estado:** BORRADOR
<!-- Estados: BORRADOR → LISTO PARA CURSOR → EN EJECUCION → CERRADO -->

## Objetivo
(1–3 frases: qué se entrega y qué queda explícitamente fuera de alcance.)

## Criterios de éxito
- [ ]
- [ ] tests:
- [ ] verificación manual:

## Contexto mínimo a cargar (≤7 archivos)
(Rutas exactas. Cursor NO debe leer el monorepo entero.)
-

## Archivos a tocar (máx 12)
| Archivo | Acción | Notas |
|---------|--------|-------|
|         |        |       |

## Pasos numerados (hiperdetallados)
1.

## Tests / verificación
```powershell
# comandos exactos, p. ej.: pnpm -C apps/api test
```

## Workers (Cursor los dirige; un writer por worktree)
- **NO_LLM** (rg / git / tests / lint / playwright):
- **LOCAL** — comando exacto, no una intención. Ej.:
  `pwsh -File C:\Users\adpoz\Projects\ai-oss-2026\scripts\ollama-worker.ps1 -Action digest -Repo "." -Max 120`
  `... -Action find -Repo "." -Query "..."` · `... -Action map -ItemsInline "..." -Prompt "... {{item}}"`
- **MCP / Firecrawl / n8n / Temporal**:

## Worktrees
(Si hay paralelismo: `pwsh -File C:\Users\adpoz\Projects\ai-oss-2026\scripts\worktree-new.ps1 -RepoPath . -Name <slice>`)
-

## No hacer / riesgos
-

## Handoff a Cursor
(Una sola frase de arranque. `packet.ps1 handoff` la copia al portapapeles junto con el boot.)
Implementa `.ai/EXEC-PACKET.md` de NEXARA-app paso a paso sin cambiar la arquitectura; cierra con relevo.

