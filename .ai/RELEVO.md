# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/hard-org-mgrs
- **Worktree:** `C:\dev\apps\_worktrees\nexara-hard-org-mgrs`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

1. **fix-org-puestos-jefes.js**: JA/David/Luis/Daniela ahora llevan `managerEmail: CHRISTIAN` (`gerencia@nexara.com.mx`), igual que Josué.
2. Header del script documenta que esos cuatro (+ Josué) reportan a Christian.
3. Lógica idempotente + Claudia tester sin cambios. **getOrgchart API no tocada.**

## A medias

- Script aún no corrido en prod/DB (solo código).

## Siguiente

- Correr en API: `node scripts/fix-org-puestos-jefes.js` (o docker exec) y verificar organigrama.
- Resto del hardening hard-org-mgrs según packet/auditoría.

## No tocar

Puente NAS · getOrgchart API en este fix.
