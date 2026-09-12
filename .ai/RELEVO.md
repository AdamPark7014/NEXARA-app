# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Despacho Proyecto multi-equipo

### Hecho

Al asignar a David (u otro encargado) con **Proyecto + Despacho**:

1. **Pool ampliado:** instaladores **y** soporte (ya no solo el subtree del encargado).
2. **Coordinadores automáticos:** si eliges gente de instaladores **y** de soporte, se suma como LEAD al otro encargado (p. ej. Antonio) además de David (responsable).
3. **Subordinados** elegidos quedan como TECNICO (o LEAD si son el peer coordinador).
4. Banner verde en UI cuando hay peers auto.

Helpers: `teamPoolEmailsForAssignment`, `peerCoordinatorEmails`, `coordinatorEmailForMember` en `activity-kinds.ts`.
UI: `pizarra/[userId]/asignar/page.tsx`.

### Verificar

1. Hard refresh → `/erp/pizarra/<id-david>/asignar`
2. Tipo Proyecto · Despacho → deben aparecer Israel/Joan/Juan **y** Carolina/Alejandro/(Antonio).
3. Elige Israel + Carolina → banner «Coordinadores automáticos: Antonio…»
4. Crear → equipo: David LEAD, Antonio LEAD, Israel+Carolina TECNICO.

## A medias

Nada.

## Siguiente

Lo que Adam diga.

## No tocar

Puente NAS. Plan files.
