# RELEVO

- **Último turno:** claude-code — ola de diseño (tras cursor)
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** `744278ae` — Contabilidad unificada; **deployed** a Hetzner

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

### Deploy Hetzner (desbloqueado)
- SSH: `root@5.78.215.109` puerto **2222**, clave `id_ed25519_nexara_hetzner`
- `~/.ssh/config` host `hetzner-nexara`: HostName + Port actualizados
- Push `mejora/calidad-y-web` → origin (`5cef19f0..744278ae`)
- Servidor: `DEPLOY_BRANCH=mejora/calidad-y-web ./deploy/update.sh --force-all`
- Prod HEAD: `744278ae` · api healthy · web up · traefik sync ok
- Sin `--with-migrate` (gate: no migraciones en esta wave)

### Contabilidad (ya en ese HEAD)
Una Contabilidad en Core; pólizas en `/erp/contabilidad/polizas`; remap `/erp/accounting`.

## Ola de diseño — sidebar y sistema visual (claude-code)

Queja de origen: «el sidebar se ve horrible, plano, sucio, con textos de más, y
los iconos todos iguales». Cinco frentes en paralelo, todos integrados.

**Las tres causas medibles de «plano» y «sucio»:**

1. **30 tokens huérfanos** — usados en CSS, declarados en ninguna parte. Un
   `var()` inválido sin respaldo no se ignora: anula la propiedad entera.
   `border-color` caía a `currentColor`, así que decenas de contenedores
   dibujaban su borde del color del texto que tenían dentro.
   `--muted-foreground` tenía 23 usos rotos; `--bg`, 12.
2. **No había escala de profundidad**: `--ui-surface-2` valía exactamente lo
   mismo que `--ui-bg`. Dos valores disfrazados de tres.
3. **105 de 118 módulos compartían el mismo icono genérico.**

**Bugs reales encontrados, no cosmética:**

- Estado activo del sidebar = **el mismo gris que el hover**. Idéntico.
- Colapsado: enlaces con `display:none` → **sin nombre accesible**; y
  desaparecía el botón de cuenta, dejando **cerrar sesión inalcanzable**.
- `aria-controls` apuntaba a un id inexistente.
- Punto verde de presencia **quemado**: «conectado» siempre, para todos.
- Colapsar en escritorio y bajar a móvil dejaba el cajón **sin etiquetas**.
- **Anillo de foco invisible** en primario, peligro y acento: estaba en
  `box-shadow` y esos botones traen su sombra en línea, que gana.
- **Contraste bajo mínimo**: acento 3.64:1 en claro; en oscuro los sólidos con
  texto blanco caían a 2.54:1 porque `--primary` aclara en oscuro.
- **`MetricStrip` perdía el «sin borde»** al mezclar el atajo `border` con
  `borderRight`: clave repetida conserva posición pero valor último, así que el
  atajo se aplicaba después. Corregido en la raíz; `FilterScale` igual.

**Sistema:** `.ai/DISENO-TOKENS.md` documenta el vocabulario. Añadidos
`--ui-fg-label` y `--ui-icon` porque `--ui-fg-3` da 2.8:1 sobre blanco y tres
agentes lo parchearon por separado.

**Medido, NO tocado:** 2,333 colores a mano y 1,033 `rgba()` fuera de las hojas
de tokens, con los 15 archivos que concentran la mayoría listados en el doc.

Verificación: web **977/977** en 82 archivos · API **2068/2068** en 188 suites ·
`tsc` limpio · `next build` directo **363/363 páginas**, sin el envoltorio.

**Aviso que sigue vigente:** `scripts/next-build-resilient.js` reintenta con
`NEXT_IGNORE_TYPE_ERRORS=1` y devuelve el código del segundo intento, así que
`npm run build:server` NO puede fallar por tipos. Para verificar de verdad:
`cd apps/web && npx next build`.

## A medias

- Facturación/Bancos siguen como entradas Core aparte (FinanceModuleRail). Recorte opcional: solo ContabilidadSidebar.
- Verificar en browser prod: hub Contabilidad + herramientas MetricStrip.

## Siguiente

1. Smoke en prod: `/erp/contabilidad`, `/erp/contabilidad/polizas`, `/erp/almacen/herramientas`
2. Si Adam quiere: ocultar invoicing/banking del menú Core

## No tocar

Puente NAS.
