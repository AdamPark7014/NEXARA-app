# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — GPS live vs checadas

### Hecho

Separación de permisos:

| Quién | ATTENDANCE | GPS_VIEW (fichar) | GPS_MANAGE (vivo) |
|-------|------------|-------------------|-------------------|
| Christian (ceo) / dir | manage | sí | **sí** live team |
| David (coord_ops) | manage + checa | sí | **no** |
| Antonio (ing_soporte) | manage subtree + checa | sí | **no** |

- Encargados ven equipo: hora entrada/salida + mapa del **punto al fichar** (en sitio).
- Sin bloque «GPS del equipo» ni `gps/team` / trayectoria ajena.
- Christian sí ve GPS en vivo.
- Re-login obligatorio (JWT cachea permisos).

### Verificar

1. David/Antonio: Equipo del día OK; pestaña Trayectoria **sin** GPS del equipo; 403 en `gps/team`.
2. Christian: sí ve GPS del equipo en vivo.
3. Re-login en las 3 cuentas.

## A medias

Nada.

## Siguiente

Lo que Adam diga.

## No tocar

Puente NAS. Plan file.
