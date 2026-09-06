# Auditoría 01 — Sesión y persistencia de login entre subdominios (web)

**Fecha:** 2026-09-06 · **Rama:** `mejora/calidad-y-web` · **Modo:** solo lectura
**Área:** `apps/web` (middleware, `(auth)`, `UserContext`, `AppShell`) + `apps/api/src/auth`

Síntoma reportado por Adam:

> «en la web si entras a un subdominio el login y eso no te deja debes generar
> persistencia en que si entras a sales y te logueas en sales entras a sales, ya
> adentro decides si cambiar de login pero en todos pues mantener esto»

---

## 1. Diagnóstico raíz

**No es un problema de cookies.** La cookie de sesión real (`nexara_token`,
`HttpOnly`) se emite con `Domain=.nexara.com.mx` y sí se comparte entre
subdominios (`apps/api/src/common/security/session-cookie.ts:37-53`). La cookie
señal `nx_session` también (`apps/web/components/UserContext.tsx:250`). El
middleware las ve correctamente.

Son **dos causas independientes**, ambas en el cliente, y hay que arreglar las dos:

### Causa A — Tras autenticar, el login te expulsa del subdominio a propósito

`apps/web/components/PanelLogin.tsx:346-362`. Con `smartRedirect=true` (que es lo
que usa `/login`, ver `apps/web/app/(auth)/login/page.tsx:52`), el código decide
a dónde ir así:

```ts
// PanelLogin.tsx:349-362
const sub = host.split(".")[0]?.toLowerCase() || "";
const currentPanel =
  sub === "integra" || sub === "lab" ? resolvePanelId(sub) : null;   // ← línea 351-352
if (currentPanel && canUserAccessPanel(userData, currentPanel)) {
  ...quédate aquí...
}
const homeUrl = getUserHomeUrlAbsolute(userData);                     // ← línea 360
window.location.assign(homeUrl);                                      // ← línea 361
```

La regla «quédate en el subdominio donde te logueaste» **existe, pero está
cableada a `integra` y `lab` y a nadie más** (línea 351-352). Para `sales`,
`core`, `ops`, `studio`, `crm`, `ventas`… se cae al `else` y se ejecuta
`getUserHomeUrlAbsolute(userData)` (`apps/web/lib/panel-home.ts:57-71`), que
resuelve el panel HOME **del rol**, no el subdominio actual, y construye una URL
absoluta a **otro** subdominio.

Con el mapa de roles de `apps/web/lib/rbac/roles.ts:52-70`, sólo
`coord_ventas` y `vendedor` tienen `ROLE_HOME_PANEL = 'sales'`. Los otros 15
roles —incluidos `super_admin`, `ceo`, `dir_admin`, `contabilidad`, `rh`,
`ing_campo`, `arquitecto`, diseñadores— **salen disparados a `core`, `ops`,
`studio` o `lab`**. Adam, como super admin/platform owner, cae en
`getUserHomePath` → `/erp/executive` (`user-access.ts:307-308`) o `/lab` si es la
cuenta técnica (`user-access.ts:306`): en ambos casos, fuera de `sales`.

**Eso es literalmente el síntoma reportado.** Te logueas en `sales`, y el propio
código te manda a `core.nexara.com.mx/executive`.

### Causa B — El `next=` que escribe el middleware no lo lee nadie

`apps/web/middleware.ts:296-298` escribe el destino deseado:

```ts
const nextPath = `${requestPathname}${request.nextUrl.search || ''}`;
url.pathname = '/login';
url.search = `?next=${encodeURIComponent(nextPath)}`;
```

`apps/web/components/app-shell/AppShell.tsx:106` hace lo mismo, y
`apps/web/lib/tab-session.ts:38` (`buildFreshLoginUrl`) también.

**Ningún fichero del proyecto lee ese parámetro.** Barrido completo sobre
`apps/web/app`, `apps/web/components` y `apps/web/lib` buscando `searchParams.get`
/ `"next"` / `'next'`: cero consumidores. `PanelLogin.tsx` no lo menciona en
ninguna de sus 522 líneas; usa siempre `redirectTo` (fijo, `"/dashboard"`, ver
`app/(auth)/login/page.tsx:47`) o `getUserHomeUrlAbsolute`.

Consecuencia: pidas la URL que pidas, tras loguearte aterrizas en el home del
rol. El `returnTo` está muerto de punta a punta.

### Causa C (agravante) — Al saltar de subdominio SIN `?_nxt=` la sesión se pierde

`safeGetStoredUser()` (`UserContext.tsx:163-228`) tiene tres fuentes:

1. `sessionStorage` — por origen **y** por pestaña. En `core` no existe lo que se
   guardó en `sales`. (línea 187)
2. Cookie compartida `nexara_user` — (líneas 196-213).
3. `localStorage` legacy — (líneas 218-227), y en navegador lo **borra**
   (`safePersistUser`, línea 294).

La fuente 2 es la única que cruzaría subdominios… pero **en navegador nunca se
escribe**: `safePersistUser` la escribe sólo dentro de
`if (isCapacitorNative())` (`UserContext.tsx:301`). En web es siempre falso. La
rama de hidratación por cookie de las líneas 196-213 es **código muerto en el
navegador**.

Y no hay red de seguridad: el `useEffect` de arranque (`UserContext.tsx:419-435`)
**no llama nunca a la API cuando no hay usuario guardado**. Si `storedUser` es
`null`, hace `setIsContextReady(true)` con `user = null` y se acabó. Aunque la
cookie `HttpOnly` `nexara_token` sea perfectamente válida y `nx_session=1` esté
presente, el cliente se declara «sin sesión».

Resultado observable: escribes a mano `core.nexara.com.mx/erp/dashboard` estando
logueado en `sales`. El middleware ve `nx_session=1` y **te deja pasar**
(`middleware.ts:285-286`); el AppShell monta, no encuentra usuario, y hace
`router.replace('/login?next=…')` (`AppShell.tsx:100-108`). Pantalla de login
teniendo sesión válida en el servidor.

### Causa D (agravante) — Rebote extra por `usePathname()` en subdominio

En un subdominio la URL del navegador es la **pública** (`sales…/dashboard`), no
la interna (`/crm/dashboard`); el middleware hace `rewrite`, no redirect
(`middleware.ts:520-527`). Que el propio código lo sabe se ve en
`toSubdomainPublicPath` (`cross-panel-handoff.ts:172-181`), en
`buildCrossPanelUrl` que devuelve `publicPath` cuando te quedas en el mismo
subdominio (`cross-panel-handoff.ts:235`) y en `detectCurrentPanelId`, que cae al
hostname justo porque el pathname puede no traer prefijo de panel
(`cross-panel-handoff.ts:95-103`).

Pero `AppShell.tsx:358-361` evalúa el permiso contra ese pathname público:

```ts
const accessGuardWarning = useMemo(() => {
  const path = pathname || "/";
  return !canUserAccessPath(user, path);   // canOpenPage(role, "/dashboard")
}, [user, pathname]);
```

`canOpenPage` normaliza con `normalizeLegacyPath` (`page-matrix.ts:353` →
`legacy-path-remap.ts:241`), que **no** añade prefijo de panel: `/dashboard`
sigue siendo `/dashboard`. Ninguna regla de `PAGE_MATRIX` (todas son
`/erp/**`, `/crm/**`, …) casa. Para todo usuario que no sea `super_admin`,
`accessGuardWarning` es `true` **en cada página del subdominio**, y el efecto de
las líneas 365-374 dispara `router.replace(panelEntryPath)` → `/crm/dashboard`.

Es decir: aunque arregles A y B, el usuario acabará siempre en el dashboard del
panel con la URL fea `sales.nexara.com.mx/crm/dashboard`, nunca en la página que
pidió.

---

## 2. Traza paso a paso — «entro a sales y me logueo»

Caso: usuario `dir_admin` (o Adam, super admin) abre
`https://sales.nexara.com.mx/crm/leads` sin sesión.

| # | Actor | Qué pasa | Referencia |
|---|---|---|---|
| 1 | Traefik | `sales-frontend` (prio 20) → `nexara-web:3000`. `/api` va a `nexara-api` por el router `api`. | `deploy/traefik/nexara.yml:151-157`, `:123` |
| 2 | middleware | Host permitido (`sales` ∈ `SUBDOMAIN_MAP`). | `middleware.ts:27-63`, `:114` |
| 3 | middleware | Auth gate: `/crm/leads` casa `isPanelPath`, es navegación HTML, no hay `nx_session`, no hay `?_nxt` → **302** a `/login?next=%2Fcrm%2Fleads` en el **mismo** host `sales`. | `middleware.ts:281-299` |
| 4 | middleware | `GET sales…/login?next=…`: no es panel path; `subdomain='sales'` → `internalPrefix='/crm'`; `canonicalSub('/crm')='sales'` → **no** hay redirect canónico (bien); `pathname === '/login'` → `NextResponse.next()`. El login **se pinta en sales**. | `middleware.ts:407-413`, `:509-512` |
| 5 | cliente | `UserProvider` arranca. `consumeFreshLoginIntent()` no-op. `consumeHandoffParam()` → `null`. `safeGetStoredUser()`: `sessionStorage['nexara_user']` vacío; hidratación por cookie **saltada** porque `isBrowserLoginPath()` es `true`; `localStorage` vacío → `user = null`. | `UserContext.tsx:401-435`, `tab-session.ts:10-14` |
| 6 | cliente | `PanelLogin` monta con `smartRedirect=true`, `redirectTo="/dashboard"`. **El `?next=` de la URL se ignora por completo.** | `app/(auth)/login/page.tsx:46-53` |
| 7 | cliente | Submit → `POST https://sales.nexara.com.mx/api/auth/login`. Mismo origen, así que la cookie de respuesta se acepta pese a no pasar `credentials`. | `PanelLogin.tsx:218-226`, `api-base.ts:45-47` |
| 8 | API | `Set-Cookie: nexara_token=<JWT>; HttpOnly; Secure; SameSite=Lax; Path=/; Domain=.nexara.com.mx; Max-Age=4h`. **Correcto y compartido.** | `auth.controller.ts:40-42`, `session-cookie.ts:43-53` |
| 9 | cliente | `document.cookie = "nx_session=1; Path=/; SameSite=Lax; Max-Age=86400; Domain=.nexara.com.mx; Secure"`. **Correcto y compartido.** | `PanelLogin.tsx:323-329` |
| 10 | cliente | `setUser(userData)` → efecto → `safePersistUser`: escribe `sessionStorage['nexara_user']` **con `token` sustituido por el centinela `session-cookie`**; borra `localStorage`; **no** escribe la cookie `nexara_user` (no es Capacitor). Este dato queda encerrado en el origen `sales.nexara.com.mx`. | `UserContext.tsx:271-274`, `:294`, `:301` |
| 11 | cliente | `smartRedirect`: `sub='sales'` → no es `integra` ni `lab` → `currentPanel = null`. Se ejecuta `getUserHomeUrlAbsolute(userData)`. | `PanelLogin.tsx:349-352`, `:360` |
| 12 | cliente | `getUserHomePanel` → `'erp'` (dir_admin/super admin); `getUserHomePath` → `/erp/executive`; `buildCrossPanelUrl('erp', '/erp/executive', userJson)`: `targetSub='core'`, `currentSub='sales'` → **distintos** → devuelve `https://core.nexara.com.mx/executive?_nxt=<base64 del usuario completo>`. | `panel-home.ts:62-70`, `cross-panel-handoff.ts:233-240` |
| 13 | cliente | `window.location.assign(...)` → **se abandona `sales`.** El `next=/crm/leads` se pierde sin dejar rastro. | `PanelLogin.tsx:361` |
| 14 | middleware (core) | `/executive` no casa `isPanelPath` → sin gate. `subdomain='core'` → rewrite a `/erp/executive`. | `middleware.ts:281`, `:520-527` |
| 15 | cliente (core) | `consumeHandoffParam()` lee `?_nxt`, lo **decodifica sin verificar firma**, `setUser(handoffUser)`, persiste en el `sessionStorage` de `core` y limpia la URL. | `UserContext.tsx:404-417`, `cross-panel-handoff.ts:67-73` |
| 16 | cliente (core) | `AppShell` monta. `pathname` = `/executive` (público). `canUserAccessPath(user,'/executive')` → `normalizeLegacyPath` no lo prefija → ninguna regla `/erp/**` casa → `accessGuardWarning = true` → `router.replace('/erp/executive')`. **Rebote extra**; URL final `core.nexara.com.mx/erp/executive`. | `AppShell.tsx:358-374` |

**Resultado:** el usuario pidió `sales.nexara.com.mx/crm/leads`, se autenticó en
`sales`, y termina en `core.nexara.com.mx/erp/executive`. Dos subdominios y una
página de diferencia respecto a lo que pidió.

### Variante: vendedor / coord_ventas

En el paso 12, `getUserHomePanel` → `'crm'` → `targetSub='sales'` = `currentSub`
→ `buildCrossPanelUrl` devuelve la ruta pública `/dashboard`
(`cross-panel-handoff.ts:235`). Sí se queda en `sales`… pero aterriza en
`/dashboard`, no en `/crm/leads`, y sufre igual el rebote del paso 16 hasta
`sales.nexara.com.mx/crm/dashboard`.

### Variante: ya logueado en sales, abro core a mano

1. `GET core.nexara.com.mx/erp/dashboard` → middleware ve `nx_session=1`
   (compartida) → **pasa** (`middleware.ts:285-286`).
2. `safeGetStoredUser()` en el origen `core`: `sessionStorage` vacío;
   `getSharedCookie('nexara_user')` → `null` porque **nunca se escribe en
   navegador** (`UserContext.tsx:301`); `localStorage` vacío → `user = null`.
3. No hay bootstrap contra la API (`UserContext.tsx:419-435`).
4. `AppShell.tsx:100-108` → `router.replace('/login?next=/erp/dashboard')`.

**Login otra vez, con la cookie `HttpOnly` viva en el servidor.** Ésta es la
parte de «pierdes sesión» del reporte.

---

## 3. Defectos

### 1. BLOQUEANTE — El login abandona el subdominio de origen salvo para `integra`/`lab`
**`apps/web/components/PanelLogin.tsx:349-362`** (clave: líneas 351-352 y 360-361).

`currentPanel` sólo se resuelve si el subdominio es `integra` o `lab`; para
cualquier otro se ignora dónde estás y se salta al home del rol.

*Arreglo:* resolver el panel del subdominio actual **siempre**, con el mapa que
ya existe:

```ts
// sustituir 349-352 por:
const host = typeof window !== "undefined" ? window.location.hostname : "";
const sub = host.split(".")[0]?.toLowerCase() || "";
const currentPanel = sub ? detectCurrentPanelId() : null;  // usa SUBDOMAIN_TO_PANEL_ID
```

`detectCurrentPanelId()` (`cross-panel-handoff.ts:91-104`) ya mapea
`sales→crm`, `core→erp`, `ops→ops`, `studio→studio`, `ventas→crm`… y devuelve
`null` en `localhost`/apex. Con eso, el bloque 353-359 («si puedes entrar a este
panel, quédate») pasa a cubrir los 6 paneles en vez de 2. Sólo se cae a
`getUserHomeUrlAbsolute` si el usuario **no** tiene acceso al panel del
subdominio donde se logueó, que es el comportamiento que Adam pide («ya adentro
decides si cambiar»).

### 2. BLOQUEANTE — El parámetro `next` se escribe en tres sitios y no se lee en ninguno
**Escritores:** `apps/web/middleware.ts:296-298`,
`apps/web/components/app-shell/AppShell.tsx:104-107`,
`apps/web/lib/tab-session.ts:36-39`.
**Lectores:** ninguno (barrido completo de `apps/web/app|components|lib`).

*Arreglo:* en `PanelLogin`, antes del bloque `smartRedirect` (línea 346), leer y
**validar** el destino, y darle prioridad:

```ts
const rawNext = new URLSearchParams(window.location.search).get("next");
// Validación anti open-redirect: sólo rutas internas, sin host ni protocolo.
const safeNext =
  rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.includes("\\")
    ? rawNext
    : null;
if (safeNext) {
  const targetPanel = panelIdFromInternalPath(safeNext) ?? detectCurrentPanelId();
  if (targetPanel && canUserAccessPanel(userData, targetPanel)) {
    window.location.assign(buildCrossPanelUrl(targetPanel, safeNext, JSON.stringify(userData)));
    return;
  }
}
```

La validación es obligatoria: hoy no existe porque nadie lee el parámetro, pero
en cuanto se lea, un `?next=//evil.com` sería un open-redirect.

### 3. BLOQUEANTE — La sesión no sobrevive al salto de subdominio sin `?_nxt=`
**`apps/web/components/UserContext.tsx:301`** (la cookie compartida sólo se
escribe en Capacitor) y **`:419-435`** (no hay bootstrap contra la API).
La rama de hidratación por cookie de `:196-213` es código muerto en navegador.

*Arreglo (el correcto, no reintroducir el usuario en una cookie legible):*
añadir un bootstrap servidor cuando no hay usuario local pero sí señal de sesión.
En el `useEffect` de arranque, sustituir el `setIsContextReady(true)` seco de la
línea 435 por:

```ts
if (!storedUser) {
  const hasSessionHint = document.cookie.includes('nx_session=1');
  if (hasSessionHint && online && !isBrowserLoginPath()) {
    try {
      const r = await fetch(buildApiUrl('auth/profile'), {
        credentials: 'include',           // imprescindible
        cache: 'no-store',
      });
      if (r.ok) {
        const profile = normalizeUser({ ...(await r.json()), token: SESSION_COOKIE_SENTINEL });
        if (profile) { setUser(profile); safePersistUser(profile); }
      } else if (r.status === 401 || r.status === 403) {
        setSessionCookie(false);          // limpiar la señal huérfana
      }
    } catch { /* offline: sigue sin sesión */ }
  }
}
setIsContextReady(true);
```

Esto es lo que convierte la cookie `HttpOnly` `Domain=.nexara.com.mx` —que ya
existe y ya funciona— en SSO real entre subdominios, y deja `?_nxt=` como mera
optimización en lugar de único mecanismo. También elimina la necesidad de meter
el objeto usuario completo en la URL (defecto 4).

### 4. ALTA — `?_nxt=` salta el gate del middleware y no está firmado
**`apps/web/middleware.ts:293-301`** (basta la *presencia* del parámetro para
saltarse el redirect a login) + **`apps/web/lib/cross-panel-handoff.ts:67-73`**
(`decodeHandoff` es `atob` puro, sin firma ni caducidad propia) +
**`apps/web/components/UserContext.tsx:404-417`** (`setUser(handoffUser)` sin
validar contra el servidor).

Un anónimo puede pedir
`https://core.nexara.com.mx/erp/dashboard?_nxt=<base64 de {id,email,isSuperAdmin:true,permissions:[…],expiresAt:futuro}>`
y obtener el shell de superadmin renderizado: middleware pasa (línea 293), el
cliente se cree el objeto y pinta el sidebar completo. Las llamadas a la API
devolverán 401 y `syncProfile` acabará echándolo (`UserContext.tsx:372-374`),
pero mientras tanto se filtra el mapa de módulos y la estructura de permisos, y
la protección server-side documentada en `middleware.ts:267-279` queda anulada.

Además, el comentario de `cross-panel-handoff.ts:10-12` afirma que el parámetro
«no queda en historial ni logs del servidor». **La segunda mitad es falsa**: el
`?_nxt=` viaja en la línea de petición y queda en los access-log de Traefik y de
Next antes de que `replaceState` lo borre del historial.

*Arreglo:* con el defecto 3 resuelto, **borrar el mecanismo**: quitar el bypass
de `middleware.ts:293-300` y `HANDOFF_PARAM` de `buildCrossPanelUrl`. Si se
quiere conservar por latencia, que el token sea un identificador opaco de un solo
uso emitido y canjeado por la API (`POST /auth/handoff` → `GET /auth/handoff/:id`),
nunca el objeto usuario serializado.

### 5. ALTA — El guard de acceso compara contra la ruta pública, no la interna
**`apps/web/components/app-shell/AppShell.tsx:358-361`** y el efecto que
depende de él, **`:365-374`**.

En subdominio `usePathname()` da `/dashboard`, `/leads`, `/executive`…, y
`canOpenPage` normaliza con `normalizeLegacyPath` (`page-matrix.ts:353`), que no
antepone prefijo de panel (`legacy-path-remap.ts:241-257`). Ninguna regla de
`PAGE_MATRIX` casa → `accessGuardWarning` es `true` en toda página de subdominio
para todo rol que no sea `super_admin` → rebote garantizado a
`panelEntryPath`. Se pierde la página pedida y la URL final queda duplicada
(`sales.nexara.com.mx/crm/dashboard`).

*Arreglo:* normalizar el pathname al interno antes de evaluar, reutilizando el
helper que ya existe:

```ts
// AppShell.tsx:358-361
const accessGuardWarning = useMemo(() => {
  const raw = pathname || "/";
  const internal = panelIdFromInternalPath(raw)
    ? raw
    : normalizeInternalPanelPath(panel, raw);   // cross-panel-handoff.ts:142
  return !canUserAccessPath(user, internal);
}, [user, pathname, panel]);
```

Y en la línea 373, redirigir con `toSubdomainPublicPath(panel, target)` en vez de
la ruta interna, para no dejar la URL duplicada.

### 6. MEDIA — El login no manda `credentials: 'include'`: rompe el desarrollo local
**`apps/web/components/PanelLogin.tsx:218-226`** (`loginToEndpoint`) y
**`apps/web/components/UserContext.tsx:365-368`** (`syncProfile`).

En producción no se nota porque `getApiBase()` devuelve el mismo origen en hosts
`*.nexara.com.mx` (`api-base.ts:44-47`) y un `fetch` same-origin manda cookies por
defecto. Pero en local `apps/web/.env.local:1` fija
`NEXT_PUBLIC_API_URL=http://localhost:3001/api` frente a un front en `:3000`:
petición **cross-origin**, y sin `credentials: 'include'` el navegador **descarta
el `Set-Cookie`** de la respuesta de login. La API ya está lista
(`main.ts:374 → credentials: true`); falta el lado cliente. Efecto: en dev la
sesión sólo «funciona» por `sessionStorage`, y cualquier cosa que dependa de la
cookie (`/uploads`, sockets, `auth/profile` real) falla de forma inexplicable.

*Arreglo:* añadir `credentials: 'include'` en el `fetch` de `loginToEndpoint`
(línea 219) y en `syncProfile` (línea 365). `extendSession` (`:338`) y `logout`
(`:520`) ya lo hacen.

### 7. MEDIA — Rama muerta del middleware que destruiría el path si se alcanzase
**`apps/web/middleware.ts:461-470`**.

```ts
const legacyPrefixHit = /^\/(console|contabilidad|people|operacion|ventas|web|noc|support)(\/.*)?$/.exec(pathname);
if (legacyPrefixHit) {
  const url = request.nextUrl.clone();
  url.pathname = '/';                       // ← tira la ruta entera
  return applySecurityHeaders(NextResponse.redirect(url, 308));
}
```

Los 8 prefijos están todos en `LEGACY_PANEL_PREFIX_MAP`
(`legacy-path-remap.ts:218-231`), así que el bloque global de la línea 326 ya los
convierte antes y esto no se alcanza hoy. Pero es una bomba: si alguien añade un
alias al regex sin añadirlo al mapa, `sales…/support/tickets/42` se convierte en
un 308 a `/` y el usuario pierde el destino. El comentario de la línea 467 admite
que es «red de seguridad» — una red que borra datos.

*Arreglo:* eliminar el bloque, o hacer que use `normalizeLegacyPath(pathname)`
como destino en vez de `'/'`.

### 8. MEDIA — El auth gate del middleware no cubre las rutas públicas de subdominio
**`apps/web/middleware.ts:281`**.

```ts
const isPanelPath = /^\/(erp|crm|ops|studio|lab|core|sales|console|…)(\/.*)?$/.test(requestPathname);
```

Sólo casa rutas **internas**. Pero las URLs que el propio producto genera en
subdominio son las públicas: `buildCrossPanelUrl` devuelve `/dashboard`
(`cross-panel-handoff.ts:230-235`) y el middleware las resuelve por `rewrite`
(`:520-527`). Por tanto `sales.nexara.com.mx/dashboard`,
`/leads`, `/quotes`, y la raíz `/` de cualquier subdominio de panel **no pasan
por el gate**: se renderiza el AppShell y el rebote a login lo hace el cliente,
que es exactamente el «flash de UI sin sidebar» que el comentario de las líneas
267-279 dice haber eliminado.

*Arreglo:* mover el gate para que se evalúe **después** de resolver
`internalPrefix` (es decir, dentro del bloque `isMappedPanelSubdomain`, antes del
`rewrite` de la línea 526), usando el path reescrito. O, más simple: si
`isMappedPanelSubdomain` y el prefijo interno es un panel privado, aplicar el
gate sea cual sea el pathname público.

### 9. MEDIA — Subdominios en `SUBDOMAIN_MAP` sin router HTTPS en Traefik
**`deploy/traefik/nexara.yml:243`** (`erp-frontends`) frente a
**`middleware.ts:27-63`**.

`erp-http` (línea 28-55) redirige HTTP→HTTPS para `consola`, `crm`, `admin`,
`media`, `help`, `monitor`, `rh`, `hr`, `dev`… pero la lista de `erp-frontends`
(HTTPS) **no los incluye**. Resultado: `http://crm.nexara.com.mx` → 308 a HTTPS →
**404 de Traefik**, sin llegar nunca al middleware que los redirigiría al
canónico. Lo mismo con el router `api` (línea 123), que sólo cubre los 11 hosts
canónicos: un `POST /api/auth/login` desde `ventas.nexara.com.mx` no tendría
backend.

*Arreglo:* alinear las tres listas (`erp-http`, `erp-frontends`, `api`) con
`Object.keys(SUBDOMAIN_MAP)`, o retirar de `SUBDOMAIN_MAP` los alias que no se
publican.

---

## 4. Qué **no** es el problema (hipótesis descartadas con evidencia)

| Hipótesis | Veredicto | Evidencia |
|---|---|---|
| «La cookie de sesión no lleva `Domain=.nexara.com.mx`, por eso no se comparte» | **Falso** | `apps/api/src/common/security/session-cookie.ts:37-53`: `resolveCookieDomain()` devuelve `.nexara.com.mx` con `NODE_ENV=production`, y `deploy/docker-compose.nexara.yml:154` lo fija. `SESSION_COOKIE_DOMAIN` no está sobreescrito en ningún `.env` del repo. |
| «`nx_session` es por-subdominio» | **Falso** | `UserContext.tsx:246-252` y `PanelLogin.tsx:326-328` añaden `Domain=.nexara.com.mx` cuando el hostname contiene `nexara.com.mx`. Se comparte. Es precisamente por eso que el middleware deja pasar peticiones a `core` sin que el cliente tenga sesión (defecto 3). |
| «`SameSite` bloquea la cookie entre subdominios» | **Falso** | `SameSite=Lax` opera sobre el *sitio registrable* (`nexara.com.mx`), no sobre el host. `sales.` ↔ `core.` son **same-site**. Además todos los saltos son navegaciones top-level GET, que `Lax` permite. |
| «El JWT vive en `localStorage`, y `localStorage` es por origen» | **Falso, pero acertado en espíritu** | En navegador `localStorage` se **borra** (`UserContext.tsx:294`). Lo que se usa es `sessionStorage` (`:281`), que es por origen **y además por pestaña** — peor. Y desde la migración a `HttpOnly` ahí no hay JWT, sólo el centinela `session-cookie` (`:99`, `:271-273`). |
| «Un redirect canónico `sales → core` tira la sesión» | **Falso, y ese redirect ni se dispara** | `CANONICAL_BY_INTERNAL_PREFIX['/crm'] === 'sales'` (`middleware.ts:75`), así que en `sales` la condición `subdomain !== canonicalSub` de la línea 412 es falsa: no hay 308. Y aunque lo hubiera, un 308 no toca cookies. Quien salta de subdominio es `window.location.assign` en `PanelLogin.tsx:361`, código de aplicación, no el middleware. |
| «Hay un bucle de redirección middleware → login → paneles → middleware» | **Falso** | `/login` y `/paneles` tienen paso franco explícito en `middleware.ts:503-512`, y ninguno de los dos casa `isPanelPath` (`:281`). El ciclo se cierra: login → `assign(home)` → rewrite → render. Lo que hay son **rebotes de más** (pasos 13 y 16 de la traza), no un bucle infinito. |
| «Un route handler de Next pisa o borra la cookie» | **Falso** | Sólo existen dos route handlers (`app/ct-media/route.ts`, `app/feed.xml/route.ts`) y ninguno toca cookies. Cero usos de `cookies()` en `apps/web`. |
| «CORS del API rechaza credenciales» | **Falso** | `apps/api/src/main.ts:371-374`: `credentials: true` con `resolveCorsOrigin`. El que no las manda es el cliente (defecto 6). |
| «`ALLOWED_SUBDOMAINS` está recortado y bloquea `sales`» | **Falso** | La variable no aparece en ningún `.env`, compose ni Dockerfile del repo, así que `getAllowedSubdomains()` cae al default `Object.keys(SUBDOMAIN_MAP)` (`middleware.ts:92-93`), que incluye `sales`. |
| «`lab.localhost:3000` se comporta distinto y eso explica lo de producción» | **Parcialmente, y en dirección contraria** | En local `buildCrossPanelUrl` devuelve `internalPath` cuando el host es `localhost` pelado (`cross-panel-handoff.ts:253`) — mismo origen, `sessionStorage` compartido, todo «funciona». Con `*.localhost` sí hay salto real (`:243-251`). Es decir: **el bug es invisible en `localhost:3000` y sólo aparece con subdominios**, lo que explica que llevara tanto sin detectarse. El defecto 6 es el único que es *peor* en dev. |

---

## 5. Orden de arreglo sugerido

1. **Defecto 3** (bootstrap desde `auth/profile` cuando hay `nx_session` y no hay
   usuario local) — es el que convierte la cookie compartida en SSO real y quita
   la dependencia de `?_nxt`.
2. **Defecto 1** (`currentPanel` para todos los subdominios) — resuelve
   literalmente lo que pidió Adam.
3. **Defecto 2** (leer y validar `next`) — devuelve al usuario a la página que
   pidió.
4. **Defecto 5** (guard contra ruta interna) — quita el rebote residual y arregla
   la URL final.
5. **Defecto 4** (retirar `?_nxt` o firmarlo) — ya sin uso funcional tras 1-3.
6. **Defectos 6, 8, 9** — higiene de dev, del gate server-side y del proxy.
7. **Defecto 7** — borrar la rama muerta.

Los defectos 1, 2 y 5 se tocan en dos ficheros (`PanelLogin.tsx`, `AppShell.tsx`)
y no requieren cambios en la API. El defecto 3 es el único que añade una llamada
de red nueva en el arranque, y sólo cuando hay `nx_session` sin usuario local.
