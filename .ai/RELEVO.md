# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/gate-a11y-dropzone
- **HEAD:** a11y FileDropzone (teclado + focus ring)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Puerta `feat/gate-a11y-dropzone`: `FileDropzone` usable con teclado.

- `role="button"`, `tabIndex={0}`, `aria-label` (con label o «Elegir archivo»)
- Enter / Space abren el file picker (`preventDefault` en Space)
- Anillo `:focus-visible` (misma receta que `Button`: `box-shadow` primary 30%)
- Comentario de por qué el `div`+`input` oculto no bastaba

Archivo: `apps/web/components/ui/FileDropzone.tsx`

Nota: el anillo llegó primero vía rescate WIP `d8f3dc81` (otro turno arrancó y salvó el working tree). Este cierre deja el trailer `Agente: cursor` y el RELEVO de la puerta.

## A medias

Nada en esta puerta.

## Siguiente

Integrar `feat/gate-a11y-dropzone` en `mejora/calidad-y-web` cuando Adam lo pida.

## No tocar

Puente NAS. Otras puertas `feat/gate-*` en worktrees hermanos.
