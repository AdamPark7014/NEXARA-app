# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-13
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Pizarra Luis ve a Antonio

### Hecho

**Causa:** la pizarra filtra por árbol `managerId`. En el seed, Antonio (`jose.ramirez@…`) reporta a Christian, no a Luis → Luis solo se veía a sí mismo y no podía asignarle.

**Fix:** `TeamBoardService.boardExtraEmails` — Luis además ve a Antonio + Carolina + Alejandro (peers operativos). Antonio ve a Carolina/Alejandro aunque falle managerId.

Archivo: `apps/api/src/me/team-board.service.ts`.

Flujo esperado: Luis → toca Antonio → Despacho → suma Carolina/Alejandro (o Servicio con puente a Antonio).

### Verificar

1. Reiniciar / hot-reload API.
2. Login Luis (`direccion.operaciones@nexara.com.mx`) → `/erp/pizarra`.
3. Deben verse Antonio (+ soporte).
4. Tocar Antonio → Asignar → Despacho o Servicio.

### A medias

Nada.

### Siguiente

Lo que Adam diga.

### No tocar

Puente NAS. Plan files.
