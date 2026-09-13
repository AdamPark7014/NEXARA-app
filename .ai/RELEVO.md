# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-13
- **Rama:** mejora/calidad-y-web
- **HEAD:** 9fe0cb49

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Luis: despacho solo en servicio

### Hecho

Reglas **solo para Luis** (David/Antonio/Josué vuelven a elegir Ejecución vs Despacho):

1. **Servicio** → solo Despacho + cupo (manda luego a Antonio).
2. **Tarea / Proyecto / Comercial** → Ejecución directa (actividad personal), sin despacho ni chips de equipo.
3. Luis puede recibir **proyecto** (además de tarea/servicio/comercial).
4. `forcesDespachoOnly(email, kind)` / `forcesEjecucionOnly(email, kind)`.

### Verificar

1. Asignar a Luis → Servicio: solo despacho + personas.
2. Asignar a Luis → Tarea o Proyecto: «Ejecución directa», sin despacho.
3. Asignar a David/Antonio: siguen las dos tarjetas Ejecución / Despacho.

### A medias

Nada.

### Siguiente

Lo que Adam diga.

### No tocar

Puente NAS.
