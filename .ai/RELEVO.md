# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/gate-proteccion-spec
- **HEAD:** test(accounting): gate proteccion.noBloqueado vacío + register payment en bloqueado

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

### Gate Jest — checklist `proteccion` alineado con closed-period writes

Worktree: `C:\dev\apps\_worktrees\nexara-gate-proteccion-spec`
(`feat/gate-proteccion-spec` desde `origin/mejora/calidad-y-web`).

- `period-close.spec.ts`: describe `proteccion del cierre` — exige
  `proteccion.noBloqueado === []` y que `bloqueado` incluya
  «Registrar el pago de una factura con fecha dentro del periodo»
  (más conciliación / SAT / import / borrador factura).
- Copy de servicio (`noBloqueado: []` + pago en `bloqueado`) ya venía
  en el tip de `origin/mejora/calidad-y-web`.
- Suite: `period-close.spec.ts` — 22/22 PASS

## A medias / pendiente real

- **Deploy bloqueado:** `hetzner-nexara` con `HostName REEMPLAZA_CON_IP_HETZNER`
- AuditLog sin estado anterior salvo cierre de periodo
- Smoke navegador con datos reales
- Merge de `feat/gate-proteccion-spec` → `mejora/calidad-y-web` (Adam)

## Siguiente

1. Adam: merge/PR del gate proteccion-spec si aplica
2. Adam: IP/llave Hetzner o `./deploy/update.sh --force-all`
3. Claude: regenerar EXEC-PACKET si hace falta

## No tocar

Puente NAS.
