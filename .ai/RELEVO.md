# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-10
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — guías detalladas por módulo (no-prod)

### Hecho

1. **`apps/web/lib/module-guides.ts`** — 103 guías (summary, audience, how, steps, connects).
2. **`ModuleGuideBanner`** en AppShell: banner colapsable en cada pantalla de módulo, **solo si `NODE_ENV !== 'production'`**.
3. **`/erp/architecture`** — cada módulo tiene `<details>Cómo funciona (detalle)</details>`.
4. Generador: `.ai/gen-module-guides.py` + `.ai/module-guides.json`.
5. `tsc` web OK. Localhost seguía arriba.

### Verificar

- http://localhost:3000/ops/dashboard → banner «Guía · no producción».
- http://localhost:3000/erp/architecture → expandir «Cómo funciona» en tarjetas.
- En build production el banner no debe aparecer.

## A medias / siguiente

- Ampliar guías cortas si Adam pide más profundidad en un producto concreto.
- Opcional: regenerar PDF con el mismo JSON.

## No tocar

Puente NAS. Credenciales. No fingir EN VIVO.
