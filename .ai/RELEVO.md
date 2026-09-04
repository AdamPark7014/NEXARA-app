# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Personas: delete real + alta auto-código + UI prod

### Delete (bug «no borra / reaparece»)

- Idempotente: si ya no está en el ACS → OK.
- Face → `UserInfoDetail/Delete` → `DeleteProcess` → **reintento** si sigue.
- Verificación autoritativa con `listAllUserInfo` (si no se puede listar →
  **falla**, no se limpia espejo; antes un falso OK reimportaba en sync 15 min).
- Espejo solo si **todos** los ACS OK. UI: danger + confirm + fan-out por IP +
  quita de la lista al instante si success.

### Alta con código auto

- `autoCode` (default): siguiente numérico libre del espejo, o `9`+timestamp.
- UI: «+ Nueva persona» abre panel Alta (ya no enterrado bajo editar).
  Nombre obligatorio; código opcional (override manual).

### UX

- Título «Control de personal»; secciones 1 Datos / 2 Editar / 3 Face ID /
  4 Eliminar; estados de carga; copy Face ID terminal ≠ video oficina.
- Nav Acceso: Personas «Alta · Face ID · baja».

### Sibling (ya en rama, no pisar)

PTZ pad arriba + continuous; overlay sticky Meeting Room — ver commits
recientes de video/PTZ.

SSH: `-p 2222 root@5.78.215.109` → `/var/www/nexara-app`

Verificar: Personas → + Nueva (solo nombre) → aparece con código auto;
Eliminar a alguien de prueba → fan-out OK → desaparece y no vuelve tras sync.

## A medias

1. Portal empleado (User↔employeeNo).
2. httpHost NVR `.34`.
3. Cámara ANPR ITC.
4. Micros / Hik-Connect — decisión Adam.
5. TCPMSS / biblioteca init / empresas 1-2.
6. Re-aplicar FieldDetection tras sync (sibling overlay).

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
Face ID óptico inventado sobre AcuSense. Playback/PTZ de siblings.
