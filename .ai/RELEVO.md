# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-13
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Despacho pendiente → asignar al equipo

### Hecho

**Causa:** a Luis le dejaron una actividad en **Despacho**, pero en su propia ficha no había UI para elegir a quién (solo «Asignar actividad» en fichas ajenas).

**Fix:**
1. `DespachoPendingPanel` en `/erp/pizarra/[userId]` cuando es **tu** perfil: lista despachos abiertos → «Despachar al equipo» → checkboxes del pool (`dispatchPoolEmails`) → POST team TECNICO.
2. Misma UI sirve para **Antonio** y **David** cuando tengan despacho pendiente.
3. `boardExtraEmails` también fuerza instaladores de **David** (Joan/Israel/Juan).

### Verificar

1. Hard refresh → Luis toca **TÚ**.
2. Bloque naranja «Pendiente de despacho» → Despachar al equipo → Antonio/Carolina/Alejandro → Asignar.
3. Login David → debe ver instaladores; si tiene despacho, mismo panel.
4. Login Antonio → Carolina/Alejandro + panel si hay despacho.

### A medias

Nada.

### Siguiente

Lo que Adam diga.

### No tocar

Puente NAS.
