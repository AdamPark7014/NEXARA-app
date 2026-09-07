# Cuenta demo para revisores de tienda (Play + App Store)

Script: `apps/api/prisma/seed-play-reviewer.ts`  
Comando: `cd apps/api && npm run seed:play-reviewer`

## Qué crea

- Tenant **`nexara-demo`** (nunca la empresa primaria).
- Usuario por defecto: `play.review@nexara.com.mx`
- Rol CEO del tenant demo, **MFA apagado**, sin candado.
- Contraseña: fija con `PLAY_REVIEWER_PASSWORD=...` o aleatoria (solo se imprime una vez).

## Producción (ya corrido 2026-09-07)

Seeder ejecutado en el contenedor `nexara-api` del VPS Hetzner.
Credenciales locales (no van al git):

`C:\dev\secrets\nexara-store\reviewer-credentials.txt`

Login verificado contra `https://api.nexara.com.mx/api/auth/login` → 200.

## App Store Connect (Fase 5)

En la ficha de la app → App Review Information → Demo account:

- Username: el email del seeder
- Password: el de `reviewer-credentials.txt`
- Notas: «Consola B2B. Entrar con la cuenta demo. Tenant aislado nexara-demo; no hay datos de clientes reales.»

Misma cuenta sirve para Google Play → Acceso a la app.

## Re-seed

```bash
docker exec -e PLAY_REVIEWER_PASSWORD='...' nexara-api \
  sh -c 'cd /app/apps/api && npm run seed:play-reviewer'
```
