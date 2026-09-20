# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** merge 6 hardening (pdf, rbac, tools-ui, act-photos, act-flow, prenomina)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho

1. Hub Contadora + UX clarity (`e5a3035f`).
2. Merged into `mejora/calidad-y-web`:
   - `feat/hard-pdf` — nitidez pdf.js + zoom
   - `feat/hard-rbac` — tools approve solo Christian/Iván
   - `feat/hard-tools-ui` — David pide; Iván/Christian aprueban
   - `feat/hard-act-photos` — fotos grandes + lightbox
   - `feat/hard-act-flow` — captura por campo + reject UX + filtros asignadas
   - `feat/hard-prenomina` — paridad HR/Finance + gate borrador
3. Smoke: web tools-access+contabilidad 11 ok; api tools-* 17 ok.

## A medias

- Deploy Hetzner (SSH Permission denied desde este entorno).

## Siguiente

1. `./deploy/update.sh --force-all` en servidor.
2. Smoke contadora + tools David/Iván + evidencias fotos.

## No tocar

Puente NAS.
