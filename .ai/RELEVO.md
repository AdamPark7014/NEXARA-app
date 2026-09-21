# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-21
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar con relevo) login app vs web + seeder homologado

## Hecho

### Login app vs web — no hay dos bases ni usuarios distintos
- Misma API (`https://api.nexara.com.mx/api`) y misma Postgres de producción.
- Las 7 cuentas del Excel que probé (gerencia, developer, finanzas, jose.ramirez, juan.gonzalez, roberto, play.review) dan **200** por HTTP con las contraseñas del Excel.
- Emulador release `v1.0.2 / vc11`: login `gerencia@` + `Nexara!NX001` → DB `lastLoginDevice = NEXARA App · Android` a las 21:28:31 UTC y onboarding «Tus actividades».
- Los 401 de las 21:00 / 21:05 / 21:26 fueron contraseña/correo mal enviados (en automatización el teclado tapaba el campo contraseña y el texto se iba al correo). No es R8 ni cabeceras de dispositivo.

### Seeder homologado con el Excel
- `apps/api/prisma/seed-demo-users.ts`: roster = lista del Excel (16 cuentas reales; sin `ventas@`; con finanzas / jose / juan / roberto y sus claves).
- `scripts/generate-credentials-xlsx.js`: misma lista.
- Eliminado `apps/api/prisma/fix-passwords.ts` (duplicado del turno anterior).
- **No corrí el seed en producción** (escrituras remotas bloqueadas; además las claves ya coinciden en DB).

## A medias
- Play Console: Adam sube AAB + capturas + declaración FGS/location + vídeo YouTube.
- Documentos nativos (worktree viejo) — no fusionar.
- Cotizaciones `take` tope 20; préstamo de herramienta sin `tools.manage`.

## Siguiente
1. Adam: probar login en el teléfono/emulador con Excel (si falla, mirar que el correo no lleve la contraseña pegada).
2. Subir Play: `play-releases/NEXARA-v1.0.2-vc11.aab`.
3. Si hace falta re-sembrar en un entorno: `cd apps/api && npx ts-node -P ./prisma/tsconfig.seed.json ./prisma/seed-demo-users.ts` (solo donde haya DATABASE_URL de ese entorno).

## No tocar
Puente NAS Synology · keystore Play · `NO TOCAR LIBREMENTE` / `SOFTWARE PERSONAL`.
