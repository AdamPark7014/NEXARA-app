# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/hard-tools-ui
- **HEAD:** tip `feat/hard-tools-ui` — `fix(tools-ui): David pide; Ivan/Christian aprueban por email`
- **Worktree:** `C:\dev\apps\_worktrees\nexara-hard-tools-ui`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

1. **tools UI gate por email** (no OPS_MANAGERS):
   - `apps/web/lib/tools-access.ts` espejo API: Christian/Iván = manage; David/José = create loan.
   - `getOpsTeamSectionConfig('tools')`: manage / manage_execute / execute+create / execute read-only.
   - Señal secundaria: `permissions` incluye `TOOLS_MANAGE` o `isSuperAdmin`.
2. **`/ops/tools` + `/erp/almacen` tab herramientas**: form para loan-creators; cola/inventario para managers; tabs duales si ambos.
3. **Tests:** `apps/web/lib/tools-access.spec.ts` — 7 verdes (David execute+create; Iván manage aunque ing_campo).

## Coordinación

- Sibling **feat/hard-rbac** posee API `CONSOLE_ADMIN` removal — no tocado aquí.
- Prisma: no cambiado.

## Siguiente

- Merge/QA: login David → ToolRequestForm; Iván/Christian → cola aprobación.
- Deploy web tras merge a `mejora/calidad-y-web`.

## No tocar

Puente NAS · Prisma · API CONSOLE_ADMIN (hard-rbac).
