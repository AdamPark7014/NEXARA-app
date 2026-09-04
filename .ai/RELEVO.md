# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Personas force-delete (Ariadna)

### Causa raíz

1. `deletePerson` solo borraba el espejo si **todos** los ACS OK.
2. Sync cada 15 min reimportaba desde cualquier terminal que aún la tuviera.
3. Bug: retry de `userDelete` hacía **upsert** del espejo (deshacía la baja).
4. Ariadna Sierra `2632768193` vivía solo en Acceso General **192.168.9.163**
   (no .155 — .155 ECONNREFUSED; lista ACS real `.160–.163`).

### Fix

- `DELETE integra/people/:id?force=1` — espejo fuera aunque falle un ACS;
  tombstone `integra_person_delete_pending` + cola retry; sync no reimporta.
- UI checkbox «Eliminar de NEXARA aunque un terminal falle» + errores por IP.
- Retry `userDelete` ya no recrea espejo.

### Ariadna (prod)

ISAPI Delete OK en `.163`; espejo `integra_people` borrado. Verificar lista Personas.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `./deploy/update.sh --force-all --with-migrate`

### Verificar

1. Personas: Ariadna no aparece.
2. Danger zone: checkbox force + detalle por IP si falla.
3. Migración `20260904230000_integra_person_delete_pending`.

## A medias

1. Portal empleado · ANPR · micros · TCPMSS.
2. Features sibling Espacios/Horarios — no pelear.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado.
