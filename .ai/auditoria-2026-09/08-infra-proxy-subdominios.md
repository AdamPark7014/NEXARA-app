# 08 · Infraestructura, proxy, subdominios y despliegue

Auditoría READ-ONLY · 2026-09-06 · HEAD `bd6143ce` · árbol de trabajo limpio.

Alcance: capa de red y despliegue. El código de sesión y el 502 desde el lado de
la aplicación los cubren otros informes.

---

## 1. Topología

### Lo que hay en el repositorio

```
                        Internet
                           │
                           ▼
        ┌──────────────────────────────────────────────┐
        │  traefik-main  (contenedor GLOBAL, FUERA     │
        │  de este repo — ver NOTE en                  │
        │  deploy/docker-compose.nexara.yml:3)         │
        │  entrypoints: web :80 · websecure :443       │
        │  certResolver: letsencrypt                   │
        │  provider file: deploy/traefik/*.yml         │
        │     ├── nexara.yml    (este proyecto)        │
        │     ├── acrobat.yml   (otro proyecto)        │
        │     └── zynoratek.yml (otro proyecto)        │
        └───────┬──────────────┬───────────┬───────────┘
                │              │           │
      red docker `proxy` (external: true)  │
                │              │           │
                ▼              ▼           ▼
        nexara-web:3000   nexara-api:3001  nexara-go2rtc:1984
        (Next.js standby) (NestJS)         (RTSP→HLS)
                │              │                │
                └──── red docker `internal` ────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
              nexara-db:5432        nexara-redis:6379
              (postgres:16)         (redis:7-alpine)

        [perfil opcional `worker`] nexara-worker → solo red `internal`
```

### Contenedores, puertos y publicación

| Servicio | Contenedor | Puerto interno | Publicado al host | Redes | Fuente |
|---|---|---|---|---|---|
| Traefik | `traefik-main` | 80 / 443 | 80, 443 | `proxy` | **no versionado** |
| Web (Next.js) | `nexara-web` | 3000 | no | internal + proxy | `deploy/docker-compose.nexara.yml` |
| API (NestJS) | `nexara-api` | 3001 | no | internal + proxy | ídem |
| go2rtc | `nexara-go2rtc` | 1984 (api), 8554 (rtsp), 8555 (webrtc) | no | internal + proxy | ídem |
| PostgreSQL | `nexara-db` | 5432 | no | internal | ídem |
| Redis | `nexara-redis` | 6379 | no | internal | ídem |
| Worker BullMQ | `nexara-worker` | — | no | internal | perfil `worker`, apagado por defecto |

### Enrutado (`deploy/traefik/nexara.yml`)

| Router | Prioridad | Entrypoint | Regla | Destino |
|---|---|---|---|---|
| `uploads` | 102 | websecure | `PathPrefix(/uploads)` **sin Host** | `nexara-api` |
| `socket-io` | 101 | websecure | 11 hosts + `/socket.io` | `nexara-api` |
| `api` | 100 | websecure | 11 hosts + `/api` | `nexara-api` |
| `integra-hik-push-http` | 200 | **web (:80)** | `integra` + `/api/integra/hik` | `nexara-api` |
| `integra-go2rtc` | 30 | websecure | `integra` + `/go2rtc` → stripPrefix | `nexara-go2rtc` |
| `public-www` | 25 | websecure | `www` → 301 al apex | `dummy` |
| `*-frontend` (×11) | 20 | websecure | un host cada uno | `nexara-web` |
| `erp-frontends` | 10 | websecure | 17 hosts | `nexara-web` |
| `public` | 10 | websecure | `nexara.com.mx` (SAN con www) | `nexara-web` |
| `api-direct` | — | websecure | `api.nexara.com.mx` | `nexara-api` |
| `erp-http` | — | web (:80) | 27 hosts → 301 HTTPS | `dummy` |

**El proxy real no está en el repositorio.** `infra/proxy/docker-compose.yml`
levanta un Traefik que **solo define `--entrypoints.web.address=:80`**: no hay
`websecure`, no hay `--certificatesresolvers.letsencrypt.*`, no hay puerto 443
en `command` (aunque sí en `ports`). Si alguien levantara esa pila, **los 20
routers de `nexara.yml` que declaran `entryPoints: websecure` y
`certResolver: letsencrypt` no se registrarían y todo el HTTPS caería**. Ese
archivo es residuo obsoleto y contradice el `NOTE` de la línea 3 de
`deploy/docker-compose.nexara.yml`. Además expone el dashboard
(`--api.dashboard=true`) en `:80` sin middleware de autenticación.

**Consecuencia de auditoría:** la configuración de emisión de certificados, los
`respondingTimeouts`, el `forwardingTimeouts` y el `serversTransport` de
producción **no son auditables desde este repositorio**. Todo lo que sigue sobre
timeouts de Traefik asume los valores por defecto de Traefik v3.

---

## 2. Certificados y comodín

**No existe certificado comodín `*.nexara.com.mx` en ninguna parte del
repositorio.** Búsqueda exhaustiva de `dnsChallenge`, `wildcard`, `*.nexara`,
`acme`: cero resultados de configuración. Cada router declara
`tls: { certResolver: letsencrypt }` **por host**, lo que en Traefik significa un
certificado (o una entrada SAN) independiente por cada `Host()` del router. Solo
`public` declara SANs explícitos (apex + www).

Dos agravantes que convierten un fallo de emisión en una caída dura:

1. **`sniStrict: true`** en `tls.options.default` (`deploy/traefik/nexara.yml`
   línea final y `deploy/traefik/tls-options.yml`). Con SNI estricto, un host sin
   certificado **no recibe un certificado por defecto: Traefik rechaza el
   handshake TLS**. El navegador no muestra un 404 ni un 502 — muestra un error
   de conexión antes de hablar HTTP.
2. **HSTS con `includeSubDomains; preload`** emitido tanto por la API
   (`apps/api/src/main.ts`, cabecera `Strict-Transport-Security:
   max-age=31536000; includeSubDomains; preload`) como por la web
   (`apps/web/next.config.js` y `apps/web/middleware.ts`). Una vez que un
   navegador ha visto esa cabecera en cualquier host de `nexara.com.mx`,
   **todos** los subdominios quedan forzados a HTTPS durante un año, sin
   posibilidad de click-through. Un alias sin certificado queda inaccesible de
   forma permanente para ese navegador. Es exactamente el síntoma de "no entra
   en el móvil": el navegador móvil que ya tiene el pin HSTS nunca intenta HTTP.

### Tabla obligatoria · subdominio → proxy → SUBDOMAIN_MAP → certificado

`SUBDOMAIN_MAP` está en `apps/web/middleware.ts:29-63` (28 claves).
"Ruta /api" = existe router `api`/`socket-io` para ese host.

| Subdominio | Router HTTPS | Ruta `/api` + `/socket.io` | En `SUBDOMAIN_MAP` | ¿Certificado? | Veredicto |
|---|---|---|---|---|---|
| `core` | sí (dedicado + erp-frontends) | **sí** | sí → `/erp` | sí | OK |
| `sales` | sí | **sí** | sí → `/crm` | sí | OK |
| `ops` | sí | **sí** | sí → `/ops` | sí | OK |
| `finance` | sí | **sí** | sí → `/erp` | sí | OK |
| `studio` | sí | **sí** | sí → `/studio` | sí | OK |
| `portal` | sí | **sí** | sí → `/tickets` | sí | OK |
| `support` | sí | **sí** | sí → `/ops/support` | sí | OK |
| `noc` | sí | **sí** | sí → `/ops/noc` | sí | OK |
| `people` | sí | **sí** | sí → `/erp/hr` | sí | OK |
| `lab` | sí | **sí** | sí → `/lab` | sí | OK |
| `integra` | sí | **sí** (+ `/go2rtc`) | sí → `/integra` | sí | OK |
| `console` | sí (solo erp-frontends) | **NO** | sí → `/erp` | sí | 🟠 **HUECO** |
| `app` | sí (solo erp-frontends) | **NO** | sí → `/erp` | sí | 🟠 **HUECO** |
| `ventas` | sí (solo erp-frontends) | **NO** | sí → `/crm` | sí | 🟠 **HUECO** |
| `contabilidad` | sí (solo erp-frontends) | **NO** | sí → `/erp` | sí | 🟠 **HUECO** |
| `web` | sí (solo erp-frontends) | **NO** | sí → `/studio` | sí | 🟠 **HUECO** |
| `tickets` | sí (solo erp-frontends) | **NO** | sí → `/tickets` | sí | 🟠 **HUECO** |
| `consola` | **NO** (solo 301 en :80) | no | sí → `/erp` | **NO** | 🔴 **ROTO** |
| `crm` | **NO** (solo 301 en :80) | no | sí → `/crm` | **NO** | 🔴 **ROTO** |
| `admin` | **NO** (solo 301 en :80) | no | sí → `/erp` | **NO** | 🔴 **ROTO** |
| `media` | **NO** (solo 301 en :80) | no | sí → `/studio` | **NO** | 🔴 **ROTO** |
| `help` | **NO** (solo 301 en :80) | no | sí → `/ops/support` | **NO** | 🔴 **ROTO** |
| `monitor` | **NO** (solo 301 en :80) | no | sí → `/ops/noc` | **NO** | 🔴 **ROTO** |
| `rh` | **NO** (solo 301 en :80) | no | sí → `/erp/hr` | **NO** | 🔴 **ROTO** |
| `hr` | **NO** (solo 301 en :80) | no | sí → `/erp/hr` | **NO** | 🔴 **ROTO** |
| `dev` | **NO** (solo 301 en :80) | no | sí → `/lab` | **NO** | 🔴 **ROTO** |
| `erp` | **NO** (ni :80 ni :443) | no | **sí → `/erp`** | **NO** | 🔴 **AGUJERO NEGRO** |
| `api` | sí (`api-direct`) | es la API | no (correcto) | sí | OK |
| `nexara.com.mx` (apex) | sí | vía rewrite de Next | n/a | sí (+ SAN www) | OK |
| `www` | sí → 301 apex | n/a | n/a | sí (SAN) | OK |

**Los nueve 🔴 con 301 en :80.** `erp-http` (líneas 30-60 de `nexara.yml`)
incluye `consola`, `crm`, `admin`, `media`, `help`, `monitor`, `rh`, `hr`, `dev`
y los redirige 301 a HTTPS. En HTTPS **ningún router los acepta**. El resultado
en el mejor caso es un `404 page not found` de Traefik; en el caso real, con
`sniStrict: true` y sin certificado emitido para esos hosts, es un **fallo de
handshake TLS**. Y como el 301 es `permanent: true`, el navegador lo cachea: el
usuario no puede volver a HTTP ni aunque quiera.

**`erp` es el peor caso.** Está en `SUBDOMAIN_MAP`, está en la lista
`CORS_ORIGIN` de `deploy/.env.nexara`, y el comentario de cabecera de
`middleware.ts` lo documenta como panel (`erp.nexara.com.mx → /erp`). Pero
**no aparece en ningún router de Traefik**, ni en `erp-http` ni en
`erp-frontends`. Nadie lo enruta. Además `erp` **tampoco está** en
`DEFAULT_ALLOWED_SUBDOMAINS` de `apps/api/src/common/security/security.utils.ts`
(líneas 19-63), así que aunque se enrutara, la API rechazaría su Origin con 403.
Tres fuentes de verdad, tres respuestas distintas.

**Los seis 🟠 sin ruta `/api`.** `console`, `app`, `ventas`, `contabilidad`,
`web` y `tickets` sí llegan a `nexara-web`, pero los routers `api` y `socket-io`
**no incluyen esos Hosts**. Y el cliente construye la URL de API como
*same-origin*: `apps/web/lib/api-base.ts:41-45` devuelve `${currentOrigin}/api`
para cualquier host que termine en `.nexara.com.mx`. Es decir, una página
servida en `https://tickets.nexara.com.mx` llamará a
`https://tickets.nexara.com.mx/api/...` → **ningún router casa** (`erp-frontends`
excluye explícitamente `/api`) → **404 de Traefik**.

El redirect canónico 308 de `middleware.ts:415-429` tapa este agujero **solo
parcialmente**, porque está condicionado a `request.method === 'GET' ||
'HEAD'` (línea 413). Por tanto:

- Navegación HTML a un alias → 308 al canónico → funciona.
- **`POST`/`PUT`/`PATCH`/`DELETE` a `https://ventas.nexara.com.mx/api/...` → 404
  de Traefik, sin redirección posible.** Un `POST` no se puede redirigir con
  seguridad y el middleware ni lo intenta.
- Un Service Worker cacheado, un deep link, o una WebView del móvil que quedó
  anclada en el alias → mismo 404.

Un caso concreto y verificable:
`apps/mobile-native/.../ui/console/screens/ConsoleEvidencesScreen.kt:786`
abre **`https://consola.nexara.com.mx/my-evidences`** hardcodeado. `consola` es
uno de los nueve 🔴: sin router HTTPS y sin certificado. **Ese botón de la app
Android está roto por construcción.**

---

## 3. Timeouts y límites

Traefik en producción **no está versionado**, así que no hay ningún
`respondingTimeouts`, `forwardingTimeouts` ni `serversTransport` que auditar.
Las filas de Traefik son sus valores por defecto.

| Límite | Valor | Dónde |
|---|---|---|
| Traefik `entryPoint.respondingTimeouts.readTimeout` | **0 (sin límite)** — por defecto | no configurado |
| Traefik `entryPoint.respondingTimeouts.idleTimeout` | **180 s** — por defecto | no configurado |
| Traefik `serversTransport.forwardingTimeouts.dialTimeout` | **30 s** — por defecto | no configurado |
| Traefik `serversTransport` idle conn timeout (pool keep-alive) | **90 s** — por defecto | no configurado |
| Traefik límite de tamaño de cuerpo | **ninguno** (Traefik no tiene `client_max_body_size`) | n/a |
| `server.setTimeout()` (socket Node) | `HTTP_REQUEST_TIMEOUT_MS` → **30 000 ms** | `apps/api/src/main.ts` (`readPositiveIntEnv('HTTP_REQUEST_TIMEOUT_MS', 30_000)`) |
| `server.keepAliveTimeout` | `HTTP_KEEPALIVE_TIMEOUT_MS` → **65 000 ms** | `apps/api/src/main.ts` |
| `server.headersTimeout` | `HTTP_HEADERS_TIMEOUT_MS` → **66 000 ms** | `apps/api/src/main.ts` |
| Timeout de aplicación (responde 408) | `APP_REQUEST_TIMEOUT_MS` → **120 000 ms** | `apps/api/src/main.ts` |
| Peticiones concurrentes máx. (responde 503) | `MAX_CONCURRENT_REQUESTS` → **5 000** | `apps/api/src/main.ts` |
| Gracia de apagado | `SHUTDOWN_GRACE_MS` → **15 000 ms** | `apps/api/src/main.ts` |
| Cuerpo JSON | **10 MB** (`express.json({ limit: '10mb' })`) | `apps/api/src/main.ts` |
| Cuerpo urlencoded | **10 MB** | `apps/api/src/main.ts` |
| Cuerpo crudo en `/api/integra/hik` | **20 MB** (`express.raw`) | `apps/api/src/main.ts` |
| Subida genérica (multer) | `MAX_FILE_SIZE` → **5 242 880 B = 5 MB** | `users/upload-user-photo.middleware.ts:42`, `hero-slides`, `news`, `page-content`, `projects` |
| Subida chat | **20 MB** fijo | `apps/api/src/chat/chat.controller.ts:232` |
| Subida portal cliente | **5 MB** fijo | `apps/api/src/client-portal/client-portal.controller.ts:246` |
| Rate limit global | `GLOBAL_RATE_LIMIT_MAX` **1 200** / `GLOBAL_RATE_LIMIT_WINDOW_MS` **60 000 ms**, por IP | `apps/api/src/main.ts` + compose |
| Rate limit auth | `AUTH_RATE_LIMIT_MAX` **25** / **900 000 ms** (15 min), por IP+path | `apps/api/src/main.ts` |
| Baneo de IP | `IP_BAN_MAX_STRIKES` **6** / ventana **3 600 000 ms** | `apps/api/src/main.ts` |
| Heap Node (runtime) | `NODE_OPTIONS=--max-old-space-size=2048` | `deploy/docker/Dockerfile.api`, compose |
| Umbral heap del healthcheck | `HEALTH_HEAP_LIMIT_MB` **1 536** | `apps/api/src/health/health.controller.ts` |
| Límite de memoria del contenedor | **NINGUNO** (`mem_limit` ausente en todos los servicios) | `deploy/docker-compose.nexara.yml` |
| Redis maxmemory | **256 MB**, `allkeys-lru` | compose, servicio `redis` |
| OkHttp Android connect / read / write | **18 s / 22 s / 22 s** | `apps/mobile-native/.../data/api/ApiClient.kt:26-28` |
| Health check go2rtc (fetch) | **2 500 ms** | `apps/api/src/health/infra.health.ts` |
| Health check Redis (TCP) | **2 000 ms** | `apps/api/src/health/infra.health.ts` |

**Contradicción interna:** el timeout de aplicación (120 s, responde 408 limpio)
**nunca se alcanza**, porque `server.setTimeout(30_000)` destruye el socket a los
30 s. Cualquier consulta de dashboard que pase de 30 segundos no devuelve 408:
devuelve una conexión cortada, y Traefik la traduce a **502 Bad Gateway**.

**Sobre el 413 en subida de fotos:** Traefik no impone límite de cuerpo, así que
el rechazo viene siempre de la aplicación. El techo efectivo para una foto de
perfil o una evidencia es **5 MB** (`MAX_FILE_SIZE`), y las cámaras de móvil
actuales producen JPEG de 3-9 MB sin redimensionar. Peor: `MAX_FILE_SIZE`
**no se inyecta al contenedor** (ver §7), así que el 5 MB es el valor por defecto
del código y `deploy/.env.nexara` no lo puede cambiar.

---

## 4. Cookies a nivel de infraestructura

- **Traefik no reescribe `Set-Cookie` en ninguna parte.** No hay middleware
  `headers`, ni `customResponseHeaders`, ni ningún manejo de cookies en
  `deploy/traefik/nexara.yml`. No hay sticky sessions (`loadBalancer.sticky`
  ausente), lo cual es correcto con una sola réplica.
- **No hay `Domain` forzado en la capa de red.** El `Domain` lo pone únicamente
  la aplicación: `apps/api/src/common/security/session-cookie.ts:38-42`
  → `SESSION_COOKIE_DOMAIN` si existe, si no `'.nexara.com.mx'` cuando
  `NODE_ENV === 'production'`.
  **`SESSION_COOKIE_DOMAIN` no está en `deploy/.env.nexara` ni se pasa en el
  compose**, así que en producción se usa el valor por defecto `.nexara.com.mx`.
  Correcto para compartir sesión, pero depende enteramente de que
  `NODE_ENV=production` llegue al contenedor (lo hace: el compose lo fija
  literal).
- Atributos de la cookie `nexara_token`: `httpOnly: true`, `secure: true` (en
  producción), `sameSite: 'lax'`, `path: '/'`, `domain: '.nexara.com.mx'`.
  `api.nexara.com.mx` y `core.nexara.com.mx` comparten sitio registrable, así
  que `SameSite=Lax` **no** bloquea el envío entre paneles. La cookie viaja bien
  en el diseño previsto.
- **HSTS**: `max-age=31536000; includeSubDomains; preload` emitido por la API y
  por la web. Ver §2: es lo que convierte un alias sin certificado en un fallo
  permanente.
- `Cross-Origin-Resource-Policy: same-site` en API y web — compatible con el
  esquema de subdominios; no rompe nada entre `*.nexara.com.mx`.
- **`trust proxy` = 1** (`apps/api/src/main.ts`, `httpServer.set('trust proxy', 1)`).
  Correcto para un salto de proxy. Pero `getClientIpFromRequestMeta`
  (`security.utils.ts`) toma **el primer elemento** de `X-Forwarded-For`, que es
  el valor que envía el cliente. Con Traefik *anexando* al header en vez de
  reemplazarlo, un cliente puede inyectar una IP arbitraria y (a) evadir el rate
  limit y (b) **meter la IP de otra persona en la lista de baneo** — seis strikes
  y esa IP recibe 403 durante una hora. Es un vector de denegación de servicio
  dirigida a nivel de infraestructura.

---

## 5. La API detrás del proxy

`apps/api/src/main.ts`:

- **`setGlobalPrefix('api', { exclude: ['/uploads', '/uploads/(.*)'] })`** — se
  aplica **después** de `app.listen`-adjacent setup pero antes de escuchar; los
  estáticos de `/uploads` quedan fuera del prefijo, coherente con el router
  `uploads` de Traefik (prioridad 102, sin Host).
- **`credentials: true`** ✅ y `methods: [GET, POST, PUT, PATCH, DELETE, OPTIONS]`.
- `allowedHeaders`: `Authorization`, `Content-Type`, `Accept`, `Origin`,
  `X-Requested-With`, `X-Device-Id`, `X-Device-Name`, `X-Device-Model`,
  `X-Device-Serial`, `X-Device-Browser`, `Sec-CH-UA-Model`, `Sec-CH-UA-Platform`.
  **Falta `X-Company-Id`**, que `apps/web/lib/api-base.ts:104` (`apiRequest`)
  **sí envía**. En una petición *same-origin* no importa; en la ruta
  cross-origin real del sitio público (apex → `api.nexara.com.mx`, habilitada por
  `WEB_NEXT_PUBLIC_ALLOW_CROSS_ORIGIN_API=true`) el preflight **rechazará la
  cabecera** y la petición fallará antes de salir. Multi-tenant roto en ese
  camino.

### Lista exacta de orígenes permitidos

El origen se resuelve en `resolveCorsOrigin` → `isOriginAllowed`
(`apps/api/src/common/security/security.utils.ts:127-176`), en este orden:

1. **Sin cabecera `Origin` → permitido siempre** (`if (!origin) return true`).
   Esto es lo que salva a la **app Android nativa**: usa Retrofit/OkHttp
   (`apps/mobile-native/.../data/api/ApiClient.kt`), que no envía `Origin`.
   ⚠️ Pero si el `Origin` llega con el valor literal `"null"` (WebView con
   `file://`, iframe sandboxed, algunos contenedores híbridos), `!origin` es
   **falso** y la petición **se rechaza con 403** en producción.
2. Solo si `NODE_ENV !== 'production'`: `http(s)://localhost[:puerto]`,
   `http(s)://127.0.0.1[:puerto]`, `http(s)://<algo>.localhost[:puerto]`.
3. **Lista literal de `CORS_ORIGIN`.** Como `CORS_ORIGIN` **no se inyecta al
   contenedor** (ver §7), en producción esta lista es el **valor por defecto del
   código**:
   - `http://localhost:3000`
   - `http://127.0.0.1:3000`
   - `http://138.197.42.104:3002`
   - `http://10.17.0.5:3002`
4. IPs directas: `http(s)://138.197.42.104[:puerto]`, `http(s)://10.17.0.5[:puerto]`.
5. **Patrón `^https://(<subdominio permitido>)\.nexara\.com\.mx$`**, donde
   `<subdominio permitido>` sale de `ALLOWED_SUBDOMAINS` o, en su ausencia (es el
   caso: no está definida en ningún sitio), de `DEFAULT_ALLOWED_SUBDOMAINS`:
   `core`, `sales`, `ops`, `finance`, `studio`, `portal`, `support`, `noc`,
   `people`, `lab`, `integra`, `consola`, `console`, `app`, `ventas`, `crm`,
   `operacion`, `contabilidad`, `admin`, `web`, `media`, `tickets`, `help`,
   `monitor`, `rh`, `hr`, `dev`, `mobile`.
6. `https://nexara.com.mx` y `https://www.nexara.com.mx` (literales).
7. Todo lo demás: **403**.

**Divergencias detectadas en esta lista:**

- **`erp` NO está en `DEFAULT_ALLOWED_SUBDOMAINS`** pero sí en `SUBDOMAIN_MAP` de
  la web y sí en el `CORS_ORIGIN` de `deploy/.env.nexara`. `https://erp.nexara.com.mx`
  → 403 por CORS (además de no estar enrutado).
- **`mobile` está en `DEFAULT_ALLOWED_SUBDOMAINS`** pero no en `SUBDOMAIN_MAP` ni
  en Traefik. Residuo.
- El `CORS_ORIGIN` que Adam mantiene en `deploy/.env.nexara` incluye
  `https://erp.nexara.com.mx` y `https://crm.nexara.com.mx` — **y no llega nunca
  al contenedor**. La cobertura efectiva la da el patrón del punto 5, por pura
  suerte. El día que alguien defina `ALLOWED_SUBDOMAINS` sin revisar esto, se
  cae medio ERP.

### La otra puerta: bloqueo por Host y por Origin en mutaciones

Antes del CORS hay dos filtros propios (`main.ts`) que también pueden cortar
tráfico y que **no devuelven cabeceras CORS**, así que en el navegador se ven
como fallos de red opacos:

- `isHostAllowed(request.headers.host)` → **400 "Invalid host header"** + 2
  strikes hacia el baneo. Los patrones (`security.utils.ts:56-68`) incluyen
  `^[a-z0-9-]+\.nexara\.com\.mx$`, así que cubre todos los subdominios.
- Para métodos mutantes: si `Sec-Fetch-Site` no es seguro **y** el Origin no está
  permitido → **403 "Cross-site request blocked"** + 3 strikes. Si el Origin
  está presente pero no permitido → **403 "Invalid origin"** + 2 strikes.
  **Seis peticiones así y la IP queda baneada una hora.** Un cliente móvil
  reintentando en bucle desde una IP de CGNAT compartida puede tumbar el acceso
  de todos los usuarios de ese operador.

---

## 6. Salud y arranque

**Hay endpoints de salud, pero el orquestador no los usa.**

`apps/api/src/health/health.controller.ts` expone `/api/health`,
`/api/health/ready` (solo base de datos) y `/api/health/live` (uptime).
`/api/health` comprueba base de datos, heap (`HEALTH_HEAP_LIMIT_MB` = 1 536 MB),
disco (umbral 90 % en `/`), Redis (TCP, 2 s) y go2rtc (no tumba el resultado).

Y sin embargo:

| Comprobación | Dev (`docker-compose.yml`) | **Producción (`deploy/docker-compose.nexara.yml`)** |
|---|---|---|
| `healthcheck` en `db` | sí (`pg_isready`) | **NO** |
| `healthcheck` en `redis` | sí (`redis-cli ping`) | **NO** |
| `healthcheck` en `api` | **NO** | **NO** |
| `healthcheck` en `web` | **NO** | **NO** |
| `depends_on: condition: service_healthy` | sí (api → db, redis) | **NO** (`depends_on: [db, redis, go2rtc]` a secas) |
| `restart:` | `unless-stopped` | `unless-stopped` (todos) ✅ |
| `mem_limit` / `deploy.resources.limits` | ninguno | **ninguno** |
| Traefik `healthCheck` en el loadBalancer | n/a | **NO configurado** en `nexara.yml` |

El `healthcheck` de `db` en **dev** además está mal: ejecuta
`pg_isready -U nexara` pero el usuario es `nexara_user`. Sobrevive porque
`pg_isready` devuelve 0 aunque el rol no exista, pero es una comprobación falsa.

**El arranque de la API ejecuta migraciones en el `CMD`:**
`deploy/docker/Dockerfile.api` termina en
`CMD ["sh","-c","cd /app/apps/api && npx prisma migrate deploy && node .../main.js"]`.
Es decir, **cada reinicio del contenedor — incluido cada OOM-kill — corre
`prisma migrate deploy` antes de abrir el puerto 3001**. Durante esa ventana el
puerto no escucha, Traefik no tiene `healthCheck` configurado para sacar el
servidor del pool, y **cada petición que entra es un 502**. Con `npx` resolviendo
el binario, más el arranque de Nest, la ventana no baja de varios segundos y en
una migración real puede ser minutos.

---

## 7. Variables de entorno

Diff mecánico entre `${VAR}` referenciadas en `deploy/docker-compose.nexara.yml`
y las claves presentes en `deploy/.env.nexara`. **No se transcribe ningún valor
de secreto.**

`deploy/.env.nexara` **no está bajo control de versiones** (`.gitignore` línea
15: `.env.*`; `git ls-files` no lo devuelve). El
`deploy/.env.nexara.example` que `nexara.sh` y `update.sh` mandan copiar en su
mensaje de error **no existe en el repositorio**: quien intente desplegar en una
máquina nueva siguiendo las instrucciones se queda bloqueado.

### 7.1 Definidas en `.env.nexara` pero que NUNCA llegan al contenedor

El compose no las referencia, así que `docker compose --env-file` las lee y las
descarta. **Esto es lo más grave del apartado.**

| Variable | Impacto de que no llegue |
|---|---|
| **`CORS_ORIGIN`** | 🔴 La API usa la lista por defecto del código (4 orígenes de localhost/IP). La cobertura de producción depende accidentalmente del patrón regex de subdominios. `erp` y todo lo que Adam añada al `.env` es papel mojado. |
| **`MAX_FILE_SIZE`** | 🔴 Techo de subida fijo en 5 MB del código. Explica los fallos al subir fotos desde el móvil. No se puede subir sin tocar código. |
| `UPLOAD_DIR` | El compose fija `UPLOADS_ROOT=/app/uploads` por su cuenta; `UPLOAD_DIR` es un nombre muerto. Dos nombres para la misma idea. |
| `DATABASE_URL` | El compose la reconstruye desde `POSTGRES_*`. Si difieren, gana el compose y el `.env` engaña al lector. |
| `NODE_ENV`, `PORT` | El compose los fija literales. Coinciden, pero son duplicados que pueden divergir. |
| `PUBLIC_WEB_URL` | El compose la deriva de `WEB_URL`. Duplicado. |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY` | Pagos sin configurar en el contenedor. |
| `OPENAI_API_KEY` | Sin efecto. |
| `SMTP_SOPORTE_USER/PASS`, `SMTP_VENTAS_USER/PASS`, `SMTP_BCC_EMAILS`, `SMTP_REPLY_TO`, `EMAIL_LOGO_URL` | Los buzones por departamento y el BCC de auditoría no existen dentro del contenedor. |
| `API_DOMAIN`, `WEB_DOMAIN`, `MOBILE_DOMAIN` | Documentales. |
| `MOBILE_NEXT_PUBLIC_*` (7 claves) | Restos de `apps/mobile`, borrada. Ruido. |

### 7.2 Referenciadas por el compose pero ausentes del `.env.nexara`

Todas tienen `:-` (valor por defecto), así que no rompen el arranque, pero
significan que el comportamiento real de producción está en el compose y no en
el fichero de configuración: `NODE_OPTIONS`, `HEALTH_HEAP_LIMIT_MB`,
`JOBS_RUN_WORKERS`, `TENANT_ALLOW_PRIMARY_FALLBACK`, `GLOBAL_RATE_LIMIT_MAX`,
`GLOBAL_RATE_LIMIT_WINDOW_MS`, `GO2RTC_URL`, `GO2RTC_PUBLIC_URL`,
`OFFICES_HIK_*`, `INTEGRA_HIK_*`, `INTEGRA_SECRETS_KEY`, `HIKVISION_URL`,
`HIK_APP_*`, `PAC_PROVIDER`, `PAC_FALLBACK_TO_MOCK`, `FACTURAMA_*`, `SW_*`,
`FINKOK_*`, `CSD_*`, `EFIRMA_*`, `CT_*` (17 claves).

Dos que merecen mención aparte:
- **`INTEGRA_SECRETS_KEY`** no tiene valor y su default es cadena vacía. Es la
  clave con la que se cifran las credenciales RTSP de los equipos.
- **`PAC_FALLBACK_TO_MOCK` = `1`** por defecto: si el timbrado real falla, cae a
  un PAC simulado sin avisar. Riesgo fiscal, no de red, pero queda anotado.

### 7.3 Sin valor por defecto seguro (rompen si faltan)

Referenciadas como `${VAR}` sin `:-`. Si faltan, Docker Compose emite un warning
y **las inyecta como cadena vacía**, que es peor que fallar:

| Variable | Estado en `.env.nexara` | Qué pasa si falta |
|---|---|---|
| **`JWT_SECRET`** | definida | 🔴 Firma y verificación con secreto vacío. Además el guard de `/uploads` (`main.ts`) responde **500 "Server configuration error"** en toda lectura protegida. Sesión rota de raíz. |
| **`JWT_EXPIRES_IN`** | definida (`24h`) | ⚠️ **Divergencia**: `session-cookie.ts` documenta y asume `"4h"` como valor alineado. El `.env` dice `24h`. La cookie durará 24 h porque `parseExpiresToMs` lee la env, pero el comentario del código miente. Revisar cuál es la intención. |
| `POSTGRES_USER/PASSWORD/DB` | definidas | La API no arranca. |
| **`WEB_URL`** | definida | Enlaces de correo y `PUBLIC_WEB_URL` vacíos. |
| **`WEB_NEXT_PUBLIC_API_URL`** | definida (`https://api.nexara.com.mx/api`) | 🔴 Es un **build arg**: si falta en el build, la imagen web se hornea con la URL vacía y el bundle del navegador queda roto de forma permanente hasta un rebuild. |
| **`WEB_NEXT_PUBLIC_ALLOW_CROSS_ORIGIN_API`** | definida (`true`) | Con valor vacío, el sitio público del apex deja de poder llamar a `api.nexara.com.mx`. Mismo problema de build arg. |
| `WEB_NEXT_PUBLIC_SOCKET_URL`, `_BASE_URL`, `_API_ASSET_ORIGIN` | definidas | Ídem, horneadas en la imagen. |
| `WEB_PUSH_VAPID_PUBLIC_KEY/PRIVATE_KEY`, `WEB_PUSH_CONTACT` | definidas | Push web caído. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **definida pero VACÍA** | 🟠 Push nativo Android sin credenciales. Coherente con los `google_api_key` placeholder del build de Android. |
| `BREVO_*`, `SMTP_*`, `GOOGLE_MAPS_API_KEY` | definidas (`BREVO_NEWSLETTER_LIST_ID` vacía) | Correo y mapas. |

### 7.4 Variables que el código consulta y que nadie define en ningún sitio

Ni en `.env.nexara`, ni en el compose → siempre valor por defecto del código:

| Variable | Default efectivo | Comentario |
|---|---|---|
| **`ALLOWED_SUBDOMAINS`** | `DEFAULT_ALLOWED_SUBDOMAINS` (API, 28 entradas) / `Object.keys(SUBDOMAIN_MAP)` (web, 28 claves distintas) | 🔴 **Dos listas distintas para el mismo concepto.** `erp` está en una y no en la otra; `mobile` al revés. |
| **`ALLOWED_HOSTS`** | patrones por defecto | Cubre `*.nexara.com.mx`, correcto. |
| **`SESSION_COOKIE_DOMAIN`** | `.nexara.com.mx` en producción | Correcto por defecto, pero depende de `NODE_ENV`. |
| `HTTP_REQUEST_TIMEOUT_MS` | 30 000 | 🔴 Causa directa de 502 (§8). |
| `HTTP_KEEPALIVE_TIMEOUT_MS` | 65 000 | 🔴 Causa directa de 502 (§8). |
| `APP_REQUEST_TIMEOUT_MS` | 120 000 | Inalcanzable. |
| `MAX_CONCURRENT_REQUESTS` | 5 000 | |
| `AUTH_RATE_LIMIT_MAX` / `_WINDOW_MS` | 25 / 900 000 | |
| `IP_BAN_MAX_STRIKES` / `IP_BAN_WINDOW_MS` | 6 / 3 600 000 | |
| `ENABLE_CLUSTER_MODE` | `false` | Un solo proceso Node para todo el ERP. |
| `ENABLE_SWAGGER` | `false` en producción | Correcto. |
| `SHUTDOWN_GRACE_MS` | 15 000 | |

**`NEXT_PUBLIC_API_URL` y `COOKIE_DOMAIN`** (nombres que el encargo pedía
rastrear): el primero existe solo como `WEB_NEXT_PUBLIC_API_URL` → build arg;
el segundo **no existe con ese nombre** — el nombre real es
`SESSION_COOKIE_DOMAIN` y nadie lo define.

---

## 8. Causas de 502 atribuibles a infraestructura, ordenadas

### 🔴 1. Carrera de keep-alive entre Node y Traefik — *explica los 502 intermitentes*

`apps/api/src/main.ts` fija **tres** temporizadores incompatibles entre sí y con
el proxy:

```
server.setTimeout(30_000)        // HTTP_REQUEST_TIMEOUT_MS — destruye el socket
server.keepAliveTimeout = 65_000 // HTTP_KEEPALIVE_TIMEOUT_MS
server.headersTimeout  = 66_000
```

`server.setTimeout(30_000)` impone **30 segundos de inactividad a todos los
sockets, incluidos los que están ocioso en keep-alive**. Traefik mantiene su pool
de conexiones salientes con un `idleConnTimeout` por defecto de **90 s**. Entre
el segundo 30 y el 90, Traefik cree tener una conexión viva que Node ya ha
destruido. En cuanto reutiliza ese socket para una petición nueva, recibe un
`connection reset` y devuelve **502 Bad Gateway**.

Es un 502 que aparece **de forma aleatoria, en peticiones triviales, después de
un rato de inactividad** — exactamente el patrón de "a veces falla". Y en móvil
es más frecuente porque el usuario deja la app en segundo plano: al volver, la
primera petición cae justo en esa ventana.

Evidencia adicional: `keepAliveTimeout` (65 s) es además **menor** que el
`idleTimeout` de Traefik (180 s), lo que reproduce el mismo fallo por segunda
vía. La regla es que el keep-alive del backend debe ser **mayor** que el idle del
proxy, y aquí es menor por los dos lados.

### 🔴 2. Petición que supera 30 s → socket destruido → 502, no 408

Misma línea `server.setTimeout(30_000)`. Un dashboard con agregaciones pesadas,
un export, un `prisma` sin índice: a los 30 s exactos Node corta el socket. El
408 de `APP_REQUEST_TIMEOUT_MS` (120 s) **nunca se dispara**. El usuario ve un
502, no un mensaje de "tarda demasiado".

En móvil el síntoma es distinto: OkHttp tiene `readTimeout(22 s)`
(`ApiClient.kt:27`), así que **la app abandona a los 22 s** y muestra un error de
red genérico antes de que el 502 llegue. Dos capas con timeouts distintos
produciendo dos mensajes distintos para la misma causa.

### 🔴 3. Migraciones Prisma en el `CMD` de arranque + sin healthcheck

`deploy/docker/Dockerfile.api`:
`npx prisma migrate deploy && node dist/main.js`.

Cada reinicio del contenedor abre una ventana en la que **el puerto 3001 no
escucha**. Como no hay `healthcheck` en el compose de producción ni
`loadBalancer.healthCheck` en `nexara.yml`, Traefik sigue enviando tráfico al
backend muerto → **502 durante toda la ventana**. Con `restart: unless-stopped`
y sin `mem_limit`, un OOM-kill dispara un ciclo reinicio → migrate → 502.

### 🔴 4. Un solo proceso Node, sin límite de memoria, sin cluster

`ENABLE_CLUSTER_MODE` no está definida → **un proceso Node atiende todo el ERP**
(`bootstrapWithCluster` cae a `bootstrap()` directo). `NODE_OPTIONS
--max-old-space-size=2048` pero **ningún `mem_limit` en el compose**: el heap de
V8 crece hasta 2 GB y quien mata el proceso es el OOM killer del host, no Node.
Muere → §3 → 502. Un `unhandledRejection` no lo tumba, pero un
`uncaughtException` sí llama a `gracefulShutdown` y el proceso sale.

### 🟠 5. Alias sin router HTTPS: no es 502, es peor

Los nueve hosts 🔴 de la tabla de §2 (`consola`, `crm`, `admin`, `media`, `help`,
`monitor`, `rh`, `hr`, `dev`) y `erp` **no fallan con 502: fallan antes**. Con
`sniStrict: true` y sin certificado emitido, el handshake TLS se rechaza. Con
HSTS `includeSubDomains; preload` ya cacheado, el navegador ni siquiera intenta
HTTP. Para el usuario es indistinguible de "el servidor está caído", y es lo que
probablemente se está reportando como parte del problema móvil (ver el enlace
hardcodeado a `consola.nexara.com.mx` en `ConsoleEvidencesScreen.kt:786`).

### 🟠 6. `/api` inexistente en seis alias enrutados → 404 en mutaciones

`console`, `app`, `ventas`, `contabilidad`, `web`, `tickets` llegan a la web pero
no tienen router `api` ni `socket-io`. El cliente pide same-origin
(`api-base.ts:41-45`). El redirect canónico 308 solo cubre `GET`/`HEAD`
(`middleware.ts:413`), así que **todo `POST`/`PUT`/`DELETE` a `/api` desde esos
hosts recibe un 404 de Traefik**. Y `/socket.io` tampoco existe ahí: el tiempo
real queda muerto en esos seis hosts.

### 🟡 7. Rate limit y baneo por IP compartida

`GLOBAL_RATE_LIMIT_MAX = 1200/min` **por IP**. Detrás de un CGNAT de operador
móvil o del NAT de una oficina, todos los usuarios comparten cubo. Al agotarlo:
429 masivo. Y el baneo (6 strikes → 403 durante una hora) se alimenta de
`X-Forwarded-For[0]`, que es **spoofable** (§4): un tercero puede banear la IP de
una oficina entera. No produce 502, pero se reporta como "no entra".

### 🟡 8. Deriva de configuración del proxy

`infra/proxy/docker-compose.yml` es un Traefik sin `websecure` ni resolver ACME,
contradictorio con el `NOTE` que dice que el proxy es `traefik-main` global. Si
alguien lo levanta creyendo que es el proxy del proyecto, **todo HTTPS cae a la
vez**. Además el directorio del file-provider sirve también `acrobat.yml` y
`zynoratek.yml`: un error de sintaxis introducido por otro proyecto afecta a la
carga de configuración dinámica compartida.

### 🟡 9. `update.sh` referencia un script que no existe

`deploy/update.sh` llama a `stop-legacy-host.sh`, que **no está en el
repositorio**; el script imprime "not found; skipping". Si en el droplet existe
un proceso legacy escuchando en 3000/3001 fuera de Docker, nadie lo para y el
puerto puede quedar ocupado por el proceso equivocado.

---

## 9. Correcciones, por orden de rentabilidad

1. **Alinear los timeouts.** `HTTP_KEEPALIVE_TIMEOUT_MS` debe superar el idle del
   proxy (≥ 185 s si Traefik queda en 180 s), `headersTimeout` un poco por
   encima, y `HTTP_REQUEST_TIMEOUT_MS` debe subir a ≥ 125 s (por encima del 408
   de aplicación) o desactivarse para que el 408 haga su trabajo. Esto solo, sin
   tocar nada más, elimina la clase 1 y la clase 2 de 502.
2. **Añadir `healthcheck` a `api` y `web` en `deploy/docker-compose.nexara.yml`**
   (`/api/health/live` y `/api/health/ready`) y un `loadBalancer.healthCheck` en
   `deploy/traefik/nexara.yml`. Sacar las migraciones del `CMD` a un paso
   explícito del despliegue (`update.sh` ya tiene `--with-migrate`).
3. **Cerrar el desfase de subdominios.** Decidir una única fuente de verdad y
   propagarla a los tres sitios: `SUBDOMAIN_MAP` (web), `DEFAULT_ALLOWED_SUBDOMAINS`
   (API) y los routers de Traefik. Como mínimo: añadir router HTTPS + certificado
   para los nueve alias que hoy solo tienen 301, o **quitarlos de `erp-http` y de
   `SUBDOMAIN_MAP`**; y resolver `erp` (enrutarlo o borrarlo de todas partes).
4. **Añadir los seis alias a los routers `api` y `socket-io`**, o quitarlos de
   `erp-frontends`.
5. **Inyectar `CORS_ORIGIN` y `MAX_FILE_SIZE` en el servicio `api` del compose.**
   Son dos líneas y arreglan CORS explícito y el techo de 5 MB en subidas.
6. Poner `mem_limit` (o `deploy.resources.limits.memory`) en `api` y `web`,
   coherente con `--max-old-space-size`.
7. Añadir `X-Company-Id` a `allowedHeaders` del CORS.
8. Usar la IP *derecha* de `X-Forwarded-For` (o `request.ip` con `trust proxy`
   correcto) en `getClientIpFromRequestMeta`, no la primera.
9. Borrar `infra/proxy/docker-compose.yml` o versionar de verdad el
   `traefik-main` de producción. Crear `deploy/.env.nexara.example`.

---

## Anexo · archivos revisados

- `docker-compose.yml` (desarrollo)
- `deploy/docker-compose.nexara.yml` (producción)
- `deploy/nexara.sh`, `deploy/update.sh`
- `deploy/docker/Dockerfile.api`, `deploy/docker/Dockerfile.web`
- `deploy/traefik/nexara.yml`, `deploy/traefik/tls-options.yml`
- `deploy/go2rtc/go2rtc.yaml`
- `infra/proxy/docker-compose.yml`, `infra/proxy/.env.example`
- `.github/workflows/ci.yml`
- `deploy/.env.nexara` (solo nombres de clave; ningún valor de secreto transcrito)
- `apps/api/src/main.ts`
- `apps/api/src/common/security/security.utils.ts`
- `apps/api/src/common/security/session-cookie.ts`
- `apps/api/src/health/*`
- `apps/web/middleware.ts`, `apps/web/next.config.js`, `apps/web/lib/api-base.ts`
- `apps/mobile-native/android/app/build.gradle.kts`
- `apps/mobile-native/.../data/api/ApiClient.kt`, `.../access/WebPanelUrl.kt`
