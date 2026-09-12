# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Módulo Clientes Core

### Hecho

- Sectores `PROYECTO|CORPORATIVO|COMERCIAL` en `SalesClientSector` + migración aplicada.
- Sidebar **Clientes** (`erp-clients`) en Core ola1; visible solo CEO + encargados (matriz email).
- Hub `/erp/clientes` + listas + alta fiscal + ficha (añadir sector, proyectos N).
- API `?sector=` / POST sectors; permisos ACTIVITIES_* en ventas/clientes.
- Asignar: picker cliente en servicio/comercial; proyectos filtrados por sector PROYECTO.

### Matriz

- Christian/Antonio: 3 · Luis: CORPORATIVO · David/Josué/Mónica: PROYECTO+COMERCIAL · Daniela: COMERCIAL

### Verificar

- Login Christian → sidebar Clientes → 3 cards → crear con fiscal → proyectos en cliente de proyecto.
- Luis solo ve corporativo; Joan no ve el módulo.
- Reiniciar API si `prisma generate` falló por EPERM.

### A medias

Nada crítico. `prisma generate` puede requerir parar nest y regenerar.

## Siguiente

Smoke UI + reinicio API si hace falta.

## No tocar

Puente NAS. Plan file bajo `.cursor/plans/`.
