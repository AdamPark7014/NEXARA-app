# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Personas force-delete + deploy

### Causa

1. Espejo solo se borraba si **todos** los ACS OK → UI «no borra».
2. Sync 15 min reimportaba desde terminales restantes.
3. Retry `userDelete` hacía upsert del espejo (bug).
4. Ariadna Sierra `2632768193` solo en **.163** (Acceso General). `.155` muerto.

### Fix (fa7bd33 + este)

- `DELETE …/people/:id?force=1` + tombstone + UI checkbox.
- Import `people/page` → `../_personIdentity` (rompía build web).

### Ariadna

Ya eliminada de ACS `.163` + espejo en turno anterior. Confirmar post-deploy.

SSH deploy: `./deploy/update.sh --force-all --with-migrate`

## A medias

Portal empleado · ANPR · sibling Espacios/Horarios.

## No tocar

Puente NAS, Traefik, credenciales.
