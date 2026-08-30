# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Integra consola densa (no DashKit)
- Kit `_Console.tsx`: toolbar compacta, tablas sticky, split panes, badges, door matrix.
- Home = **ops workbench**: KPIs (puertas online/off), matriz doControl, feed eventos, bitácora `GET /integra/audit`, rail de módulos.
- Events / Access / Video / People reescritos con tablas densas + detalle lateral.
- Dashboard: `doorsOnline` / `doorsOffline`. HUD chips con `data-active`.

## A medias
- Alarms / ANPR / Visitors / Vehicles aún en DashKit (siguiente pase).
- EZUIKit player HCT.

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx credenciales
- Oficinas ACS

## Siguiente paso
1. Deploy + hard-refresh home Integra (debe verse matriz + tablas, no tiles grandes).
2. Migrar alarms/vehicles al kit Ig*.
3. (Opcional) EZUIKit.

## Estado
- Listo para cerrar / deploy.
