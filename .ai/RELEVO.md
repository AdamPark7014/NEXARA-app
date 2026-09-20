# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/hard-prenomina
- **Worktree:** `C:\dev\apps\_worktrees\nexara-hard-prenomina`

## Hecho este turno

1. **Paridad HR/Finance prenomina:** panel compartido `PrenominaPanel` (OT approve/reject + selección candidatos + batch). HR y Finance son wrappers con rail y permisos `HR_MANAGE` / `CONTABILIDAD_MANAGE`.
2. **Gate borrador ligero:** sin nuevo status Prisma (solo Borrador|Pagado|Anulado). En pagos a empleados: confirm «Aprobar borrador» + stamp en `note` vía `prenomina-draft-gate.ts`. Sin CFDI.
3. **OT×2** intacto en `prenomina-amount.ts`.

## Siguiente

- Merge a `mejora/calidad-y-web` cuando el swarm de hardening esté listo.
- QA: RH aprueba OT desde `/erp/hr/prenomina`; Finance igual; marcar pagado pide confirm + nota.

## No tocar

- Fórmula OT en `prenomina-amount.ts`
- Puente NAS Synology
- CFDI / timbrado
