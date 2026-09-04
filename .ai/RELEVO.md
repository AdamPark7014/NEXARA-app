# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — ACS fan-out en vivo (sin Sync obligatorio)

Adam: cada cambio ACS en tiempo real. Sync = solo reconciliación.
Clave identidad: `employeeNumber` ↔ ACS `employeeNo`/`personId`.

### Qué dispara el push en vivo

1. Integra Personas: alta / editar / Face / baja → UserInfo + FaceDataRecord.
2. ERP Usuarios: create/update nombre·employeeNumber / isActive / bulk.
3. RightPlan/doorRight en PATCH persona.
4. Push ACS: personName al espejo sin sync full.

### Código

- `IntegraAcsFanoutService` + retry cola + `GET integra/acs-fanout/status`.
- Espejo upsert inmediato; UI «Reconciliar» + «Cambios en vivo a terminales».

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` → `./deploy/update.sh`

### Verificar

1. Personas mutación → OK por IP sin Reconciliar.
2. ERP employeeNumber → ACS.
3. Desactivar HR → Valid.enable=false.
4. Fallo IP visible + retry.

## A medias

1. Portal empleado · ANPR · micros · TCPMSS.
2. CaptureFaceData; httpHosts re-wire.

## No tocar

Puente NAS, Traefik, credenciales. No Face ID óptico inventado.
