# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/hard-rbac
- **Worktree:** `C:\dev\apps\_worktrees\nexara-hard-rbac`
- **HEAD:** (este commit)

## Hecho este turno

- **sec(tools):** approve/reject/deliver + renovaciones exigen `assertCanManageTools(email)` (solo Christian `gerencia@` / Iván `administracion.ventas@`).
- Quitado bypass `CONSOLE_ADMIN` en gates de manage/approve (David `operaciones@` no aprueba aunque tenga consola).
- Auth `applyToolsManageByEmail` verificado (strip + add por email).
- Specs: `tools-access`, `tools-manage-rbac`, `tools-approve-rbac`, `solicitud-con-ot` verdes.

## Nota seguridad

- `RbacGuard` puede seguir dejando pasar `isSuperAdmin` (p.ej. `developer@`) a endpoints con `@RBAC`; el **service** bloquea approve/reject/deliver/renewals por email.
- No se rompió superadmin global del guard; solo tool approve paths.

## Siguiente

- Merge `feat/hard-rbac` cuando Adam diga.
- QA: Iván aprueba préstamo + renovación; David no.

## No tocar

- Puente NAS Synology.
- `C:\dev\apps\NEXARA-app` (main) — trabajo solo en este worktree.
