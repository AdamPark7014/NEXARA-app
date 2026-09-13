# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-13
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Solo despacho + cupo a Luis/David/Antonio

### Hecho

Al asignar a **Luis / David / Antonio / Josué** ya no hay elección Ejecución vs Despacho:

1. **UI asignar** (`forcesDespachoOnly`): solo «Despacho a equipo» + **Personas que se ocupan** + indicaciones opcionales. Sin chips de equipo.
2. Cupo se guarda en indicaciones LEAD como `Cupo: N personas.` (`formatDispatchHeadcountNote` / `parseDispatchHeadcount`).
3. **Luis** al despachar solo ve a **Antonio** (pool) y lo suma como **LEAD**; Antonio elige soporte.
4. **David** → instaladores; **Antonio** → Carolina/Alejandro (igual que antes).
5. API team-board expone `indicaciones` en actividades abiertas; panel pendiente muestra el cupo.
6. Rebuild Docker `web` (+ api) porque `next start` sirve `.next` bakeado (mounts de fuente no bastan).

### Verificar

1. Hard refresh → asignar a Luis: **solo** Despacho + campo «Personas que se ocupan» (sin Ejecución directa ni chips AG/CJ/JA).
2. Tras crear, Luis en su ficha ve «Pendiente de despacho» con cupo → solo Antonio → Asignar.
3. Antonio ve el despacho y elige Carolina/Alejandro.
4. Mismo patrón David (instaladores) y Antonio directo.

### A medias

Nada.

### Siguiente

Lo que Adam diga.

### No tocar

Puente NAS.
