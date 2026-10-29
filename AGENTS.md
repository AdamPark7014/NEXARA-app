## Git: SOLO `main` (regla dura, va antes que todo lo demás)

Adam es el único programador. Este repo tiene **una sola rama: `main`**, para Claude, Cursor (editor, CLI y
Cloud/Background Agents), Grok y cualquier otro agente.

- Flujo: `git pull --rebase origin main` → cambios pequeños → **verificaciones en verde** (`npm run typecheck && npm run test`) → commit con la
  línea `Agente: <quién>` → `git pull --rebase origin main` → `git push origin main`.
- **Nunca**: ramas (`git branch X`, `git checkout -b`, `git switch -c`), worktrees, PRs (`gh pr create` o el PR
  automático de los Cloud Agents), push a otra rama ni `--force`.
- **Cloud/Background Agents de Cursor:** si la plataforma te pone en una rama `cursor/…`, no abras PR. Al terminar:
  `git fetch origin main && git rebase origin/main`, verificaciones, `git push origin HEAD:main` y borra tu rama remota.
  Si no puedes llegar a `main`, detente y deja un resumen; no dejes la rama ni el PR vivos.
- Si aparece otra rama: si sirve y pasa las verificaciones, fusiónala a `main` y bórrala (local y remota) en el mismo turno.
- Cambios visuales notables: mockup y visto bueno de Adam primero. Un cambio de texto no cambia lógica ni esconde
  errores del servidor. Nada de datos personales ni secretos en el repo.
- Deploy solo desde `main`, con verificaciones en verde. Única excepción: Adam pide una rama por su nombre.

Regla completa: `.cursor/rules/git-solo-main.mdc` y `C:\dev\scripts\ai-os\GIT-SOLO-MAIN.md`.

## Varias sesiones en el mismo checkout (estándar del 29-10-2026)

Aquí suelen trabajar varias sesiones a la vez sobre `C:\dev\apps\NEXARA-app`. El índice de git es **uno solo para
todas**: lo que una prepara, otra lo puede commitear sin querer. Para que ningún trabajo se traspapele:

1. **Al empezar**, `git status --short`. Lo que ya está sucio o preparado es de otra sesión: no lo toques, no lo
   prepares, no lo descartes ni lo «restaures».
2. **Commit solo de tus rutas:** `git commit --only -m "…" -- <ruta> <ruta>`. Un archivo nuevo se agrega con
   `git add -- <ruta>` justo antes. Nada de `git add -A`, `git add .`, `git commit -a`, ni
   `relevo.ps1 salvar` / `cerrar` (hacen `add -A`) mientras haya otras sesiones abiertas.
3. **Revisa antes de subir:** `git show --stat HEAD`. Si se coló un archivo ajeno, avísale a su sesión. No lo
   reviertas tú.
4. **Un commit es para publicar:** solo con verificaciones en verde, y se sube enseguida (`git fetch origin main`,
   `git merge --no-edit origin/main` si hay cambios ajenos sin commitear, `git push origin main`). No se commitea
   trabajo a medias.
5. **Prohibido sobre lo ajeno:** `git stash`, `git reset`, `git restore --staged`, `git checkout --`, `git clean`.
6. **Migraciones de Prisma** con la hora exacta en el nombre (`AAAAMMDDHHMMSS_…`), para que dos sesiones no choquen.
7. **Deploy uno a la vez:** en el Hetzner, `/root/desplegar-cuando-libre.sh`. Espera a que no corra otro build.
8. **`.ai/RELEVO.md`:** agrega tu sección con fecha y hora, sin reescribir las de otros, y commitéala con `--only`
   junto con tu trabajo.
9. **Al cerrar**, reporta los hashes y confirma que ya están arriba: `git branch -r --contains <hash>` debe mostrar
   `origin/main`.

# Antes de nada: protocolo de relevo

Este repo se trabaja con **Claude Code y Cursor sobre la misma rama**, en turnos
alternos. El agente que entra tiene prohibido reescribir archivos desde su
memoria: el disco y `git log` son la verdad.

**Arranque obligatorio, antes de leer codigo y antes de escribir:**

```
pwsh -File C:\dev\scripts\relevo\relevo.ps1 estado
```

Si hay archivos sin commitear son del turno anterior: `relevo.ps1 salvar` antes
de tocar nada. **Excepción:** si hay otras sesiones trabajando ahora mismo, no son
del turno anterior; sigue la sección «Varias sesiones en el mismo checkout».

**Cierre obligatorio:** actualiza `.ai/RELEVO.md` y ejecuta
`relevo.ps1 cerrar -Mensaje "..."` (con otras sesiones abiertas, commit con `--only`).

Reglas completas: `C:\dev\scripts\relevo\PROTOCOLO-RELEVO.md`
Estado vivo del proyecto: `.ai/RELEVO.md`
<!-- RELEVO:FIN -->
