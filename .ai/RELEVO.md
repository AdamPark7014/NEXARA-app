# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Homologación visual Integra ↔ NEXARA
- Tokens `--ig-*` alias a `--surface` / `--background` / `--text-*` / `--panel-accent` / hairline.
- Radios 6–8px en chips, botones, paneles, inputs, badges pill.
- HUD: logo NEXARA + marca Integra, CompanySwitcher, Paneles ▾, chips suaves.
- Empty Ops/Sitios: `EmptyState` + `Button` del design system + pasos numerados.
- Gradiente primary en CTAs (estilo Button NEXARA, acento Integra).

## A medias
- Deploy `--force-all` tras este cierre.

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS
- SSE/WS, mapas GIS, skin HikCentral

## Siguiente paso
1. Deploy + hard-refresh.
2. Crear sitio y verificar workbench con inventario.

## Estado
- Homologación lista para cerrar + deploy.
