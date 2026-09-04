# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — AcuSense al límite + unblock deploy

`enableMaxSmartDetection` (Field/Line/Face/Motion, sensitivityLevel=100,
httpHosts binary, triggers center). wireDevices site 1 lo aplica.
Fix build: spaces.service Prisma JSON cast (sibling WIP).

SSH deploy: `./deploy/update.sh --force-all` luego wire detection.

## No tocar

Puente NAS, Traefik, Face ID inventado. CRM/stock/asistencia siblings.
