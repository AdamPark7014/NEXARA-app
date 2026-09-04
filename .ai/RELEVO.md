# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — ACS fan-out en vivo (sin Sync obligatorio)

Adam: cada cambio debe empujar ISAPI en tiempo real a todos los ACS.
Sync queda como reconciliación / recuperación.

### Qué dispara el push en vivo

1. **Integra Personas** — alta / editar ficha / Face upload-delete / baja →
   `UserInfo` + `FaceDataRecord` a todos los ACS del sitio (await DeleteProcess).
2. **ERP Usuarios** — create / update nombre·employeeNumber / HR isActive /
   bulk deactivate → si hay sitio ISAPI, `employeeNumber` = `employeeNo` ACS.
3. **RightPlan / doorRight** — van en UserInfo/Modify cuando llegan en el PATCH.
4. **Push ACS** — evento con personId+personName actualiza espejo sin sync full.

### Código

- `IntegraAcsFanoutService`: fan-out + reintento en línea + cola
  `integra.acs.fanout.retry` + `GET integra/acs-fanout/status`.
- Espejo upsert inmediato (no esperar sync completo).
- UI: «Reconciliar» + copy «Cambios en vivo a terminales».

Clave identidad (sibling): `employeeNumber` ↔ `personId`/`employeeNo`.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109`
→ `/var/www/nexara-app` → `./deploy/update.sh`

### Verificar

1. Personas: alta/editar/foto → detalle por IP OK sin pulsar Reconciliar.
2. ERP: crear usuario con employeeNumber → aparece en ACS (o status por IP).
3. Desactivar en HR → Valid.enable=false en terminales.
4. Fallo de un IP → no success total; reintento en cola / status.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. CaptureFaceData en sensor si firmware lo expone.
3. Re-wire httpHosts tras cambios de PUBLIC_API_URL.

## No tocar

Puente NAS, Traefik, credenciales.
No Face ID óptico inventado. No pisar stock/CRM/PTZ siblings.
