## Git: SOLO `main` (regla dura, va antes que todo lo demás)

Adam es el único programador. En este repo existe **una sola rama: `main`**.

- Trabaja directo en `main`: `git pull --rebase origin main` → cambios → tests/typecheck → `git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>"` → `git pull --rebase origin main` → `git push origin main`.
- **Nunca**: crear ramas (`git branch X`, `git checkout -b`, `git switch -c`), worktrees (`git worktree add`), PRs (`gh pr create`) ni `git push --force`.
- Varios agentes a la vez: mismo checkout, archivos distintos, commits pequeños, `git pull --rebase` antes de cada push.
- Si aparece otra rama (Cloud Agent, Bugbot, Dependabot, otro agente): si sirve, fusiónala a `main`; en el mismo turno bórrala local y remota. Nunca trabajes sobre ella.
- Deploy solo desde `main`, con tests en verde.
- Única excepción: Adam pide una rama por su nombre.

Un hook bloquea esos comandos en Cursor y Claude Code. Regla completa: `C:\dev\scripts\ai-os\GIT-SOLO-MAIN.md`.
<!-- RELEVO:INICIO -->
# Antes de nada: protocolo de relevo

Este repo se trabaja con **Claude Code y Cursor sobre la misma rama**, en turnos
alternos. El agente que entra tiene prohibido reescribir archivos desde su
memoria: el disco y `git log` son la verdad.

**Arranque obligatorio, antes de leer codigo y antes de escribir:**

```
pwsh -File C:\dev\scripts\relevo\relevo.ps1 estado
```

Si hay archivos sin commitear son del turno anterior: `relevo.ps1 salvar` antes
de tocar nada.

**Cierre obligatorio:** actualiza `.ai/RELEVO.md` y ejecuta
`relevo.ps1 cerrar -Mensaje "..."`.

Reglas completas: `C:\dev\scripts\relevo\PROTOCOLO-RELEVO.md`
Estado vivo del proyecto: `.ai/RELEVO.md`
<!-- RELEVO:FIN -->
