# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** gate/labels-rep
- **HEAD:** (este commit) etiquetas español en reportes contables

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Worktree `C:\dev\apps\_worktrees\nexara-gate-labels-rep` + etiquetas humanas en español
para enums crudos en `/erp/contabilidad/reportes`:

- `ETIQUETA_TIPO_CUENTA` (ASSET→Activo, LIABILITY→Pasivo, …) en `etiquetas.ts`
- Balanza: columna «Naturaleza» ya no muestra `ASSET`/`LIABILITY`
- Gastos: categoría/estatus de detalle y filtro del catálogo usan mapas de
  `ETIQUETA_CATEGORIA_VIATICO` / `ETIQUETA_ESTATUS_VIATICO` / `ETIQUETA_PAGO`
  (texto libre en español pasa igual)
- Spec: `la balanza muestra naturaleza en español…` — suite 25/25 PASS

## A medias / pendiente real

- EXEC-PACKET en disco sigue stale (Actividades 13-09); no ejecutado
- Deploy Hetzner bloqueado (IP placeholder)
- Ollama saturado por flota paralela de gates; ticket emitido a mano tras
  timeouts de `implement`

## Siguiente

1. Merge `gate/labels-rep` hacia `mejora/calidad-y-web` cuando toque
2. Adam: IP/llave Hetzner o deploy
3. Claude: regenerar EXEC-PACKET si hace falta

## No tocar

Puente NAS.
