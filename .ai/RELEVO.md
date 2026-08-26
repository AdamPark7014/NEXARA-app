# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-26
- **Rama:** main

## Hecho en este turno
- **Nosotros:** foto panorámica en slot retrato → marco `framed_wide` (sin
  letterbox oscuro); carga eager en la imagen de historia.
- **Home hero video:** bootstrap SSR + preload de poster y video; capa poster
  instantánea hasta `canplay`; `preload=auto`; cache stream 24h.

## A medias — CUIDADO
- nada

## Siguiente paso
1. Verificar home y /nosotros en prod tras deploy.

## No tocar
- `apps/web/app/(subdomains)/tickets/layout.tsx`
- `NEXARA-credenciales-usuarios-v4.xlsx`
