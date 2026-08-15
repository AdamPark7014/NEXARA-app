# Migración de la sesión a cookie `HttpOnly`

**Estado: IMPLEMENTADO, sin desplegar.** Compila y la suite pasa entera, pero
**no se ha probado contra un entorno levantado**. Ver la lista de comprobación
del final antes de desplegar.

## El problema — y una corrección al diagnóstico inicial

El diagnóstico de partida decía que el JWT vivía en una cookie escrita desde
JavaScript. **Eso solo es cierto en la app nativa.** Al implementar se comprobó
que en el navegador:

- `PanelLogin.tsx:294` y `UserContext.tsx` escriben la cookie `nexara_token`
  **solo bajo `isCapacitorNative()`**.
- En navegador el JWT se guarda en **`sessionStorage`** (`UserContext.tsx:171`).

La conclusión de seguridad no cambia: `sessionStorage` es **igual de legible por
XSS** que una cookie sin `HttpOnly`. Cualquier script inyectado se lleva el token
y suplanta al usuario durante toda su vigencia (`JWT_EXPIRES_IN`, 4 h por
defecto). Pero el mecanismo era otro, y eso alteró la implementación: no bastaba
con cambiar la cookie, había que **dejar de persistir el JWT en `sessionStorage`**.

### Consecuencia: un fallo de la Fase 1 que esto repara

La protección de `/uploads` (Fase 1) aceptaba el token desde la cookie
`nexara_token` asumiendo que el navegador la tenía. **No la tenía.** Tal cual
quedó, cada `<img src="/uploads/...">` privado habría respondido 401 en el
navegador: avatares, evidencias y adjuntos rotos.

Al emitir ahora el servidor la cookie para todos los clientes, esa vía funciona
de verdad. **La Fase 1 no debe desplegarse sin este cambio.**

## Superficie real medida

| Elemento | Medida | Impacto |
|---|---|---|
| Emisión de tokens | 3 puntos: `auth.service.ts:954` (staff), `portal-auth.service.ts:195` y `:269` (cliente y sucursal) | Hay que emitir `Set-Cookie` en los tres |
| Cabeceras `Authorization` en web | **300 usos en 152 ficheros** | El punto crítico del diseño |
| Decodificación del JWT en cliente | **1 sitio**, `UserContext.tsx:106`, y **solo para caducidad** | Reemplazable; los permisos vienen de `nexara_user`, no del token |
| Middleware de Next | usa `nx_session=1`, no el token | **Ya es compatible**, no se toca |
| App nativa Android | `Authorization: Bearer` en 5 sitios (`ApiClient.kt` y otros) | **No tiene cookie jar: la cabecera debe seguir funcionando** |
| Lectura de cookie en API | 1 sitio: `uploads-access.ts` (Fase 1) | Ya preparado |

Dos hechos determinan el diseño: **la app nativa no puede usar cookies**, y
**300 llamadas construyen la cabecera a mano**. Un cambio de golpe rompería
ambas cosas a la vez.

## Idea central: la cabecera no se elimina, se vuelve opcional

La API pasa a aceptar el token **de la cookie además de la cabecera**, con este
orden de precedencia:

1. `Authorization: Bearer <token>` si viene y es válido → app nativa, integraciones.
2. Si no, cookie `nexara_token` (ya `HttpOnly`) → navegador.

Con esa precedencia, **los 300 puntos de llamada no necesitan tocarse para que
la migración funcione**. Cuando `user.token` deje de ser legible desde JS, esas
llamadas enviarán una cabecera vacía o ausente y la API caerá a la cookie. Se
limpian después, con calma, o nunca.

Esto convierte un cambio de big-bang en uno reversible por fases.

> Punto a validar en la fase 0: hoy `passport-jwt` usa
> `ExtractJwt.fromAuthHeaderAsBearerToken()`. Hay que cambiarlo a
> `fromExtractors([header, cookie])`. Conviene comprobar que un
> `Authorization: Bearer undefined` (literal, que es lo que produciría JS con un
> token indefinido) **no** aborte la extracción antes de llegar a la cookie; si
> lo hace, el extractor de cabecera debe descartar valores no-JWT en vez de
> fallar.

## Lo implementado

### API

| Fichero | Cambio |
|---|---|
| `common/security/session-cookie.ts` | **Nuevo.** Emisión, borrado y lectura de la cookie; extractor cabecera → cookie |
| `auth/jwt.strategy.ts` | `jwtFromRequest` pasa a `sessionTokenFromHeaders` |
| `auth/auth.controller.ts` | `login` y el callback OIDC emiten la cookie; **nuevo `POST /auth/logout`** |
| `portal-auth/portal-auth.controller.ts` | Igual para cliente y sucursal, con su `POST /portal/logout` |
| `auth/auth.service.ts` | El login devuelve `expiresAt` |
| `realtime/realtime.gateway.ts` | El handshake lee la cookie de `handshake.headers.cookie` |
| `common/security/uploads-access.ts` | Reutiliza el módulo compartido en vez de duplicar la lectura |

### Web

| Fichero | Cambio |
|---|---|
| `components/UserContext.tsx` | El JWT **ya no se persiste** en navegador; `isTokenExpired` → `isSessionExpired` sobre `expiresAt`; `logout` llama al servidor |
| `components/PanelLogin.tsx` | Guarda `expiresAt` |
| `lib/realtime-socket.ts` | Documentado que en navegador la cookie la adjunta el propio navegador |

### El detalle que evitó tocar 300 ficheros

`readBearerToken` **descarta cualquier `Bearer` que no tenga forma de JWT**. Los
~300 puntos que construyen `Authorization: Bearer ${user.token}` siguen
existiendo, pero ahora envían el marcador `session-cookie`, que la API descarta
para caer a la cookie. Sin ese filtro, un `Bearer undefined` habría abortado la
autenticación en vez de continuar.

En navegador `user.token` contiene ese marcador (`SESSION_COOKIE_SENTINEL`) en
lugar del JWT. Se conserva el campo porque cientos de sitios lo usan como bandera
de "hay sesión" (`if (!user?.token) return`); vaciarlo habría roto esas guardas.
La app nativa conserva el JWT real: autentica por cabecera y no usa la cookie.

## Fases del diseño original

### Fase 0 — Preparar la API (sin cambio visible)

- `jwt.strategy.ts`: extractor combinado cabecera → cookie.
- Los tres endpoints de login añaden `Set-Cookie` con `HttpOnly`, `Secure`,
  `SameSite=Lax`, `Domain=.nexara.com.mx`, `Max-Age` = vida del token, **además**
  de seguir devolviendo `access_token` en el cuerpo.
- Nuevo `POST /auth/logout` que borre la cookie en servidor. Hoy el logout es
  puramente cliente (`deleteSharedCookie`), lo cual dejará de funcionar cuando la
  cookie sea `HttpOnly`. **Sin esto, los usuarios no pueden cerrar sesión.**

Desplegable por sí sola. Nada cambia para el usuario: la cookie JS sigue siendo
la que se usa.

### Fase 1 — Sustituir la comprobación de caducidad

`isTokenExpired()` es lo único que necesita leer el token en el cliente. Se
sustituye por un `expiresAt` (timestamp) devuelto en el cuerpo del login y
guardado en una cookie **no sensible**, junto a `nx_session`. Conocer cuándo
caduca una sesión no da acceso a nada.

Complemento recomendado: que el interceptor de respuestas trate un `401` como
sesión caída y redirija a login. Hoy la app se apoya en la comprobación local.

### Fase 2 — Dejar de escribir el token desde JS

`PanelLogin.tsx:294` y `UserContext.tsx:250` dejan de llamar a
`setSharedCookie(ACCESS_TOKEN, ...)`. La cookie pasa a venir solo del
`Set-Cookie` del servidor, ya `HttpOnly`.

**Aquí es donde el token deja de ser robable por XSS.** Es también el punto de
no retorno: si algo se rompe, se revierte esta fase, no las anteriores.

### Fase 3 — Limpieza (opcional, sin prisa)

Retirar las cabeceras `Authorization` redundantes de los 152 ficheros del web, y
`SHARED_COOKIE_KEYS.ACCESS_TOKEN` de `shared-cookies.ts`. Puramente cosmético:
el sistema ya es seguro al terminar la fase 2.

## CSRF

Autenticar por cookie hace que el navegador la envíe sola, lo que abre la puerta
a CSRF. **Buena parte ya está cubierta** por lo que hay en `main.ts`: para
métodos mutantes se valida `Origin` contra la lista blanca y se rechaza cuando
`Sec-Fetch-Site` no es seguro. Sumado a `SameSite=Lax`, la exposición es baja.

Aun así, antes de la fase 2 conviene:

- Verificar que **ningún** endpoint mutante quede fuera de esa comprobación
  (por ejemplo rutas montadas antes del middleware).
- Confirmar que no haya endpoints `GET` con efectos secundarios: `SameSite=Lax`
  **sí** envía la cookie en navegaciones `GET` de nivel superior.

No propongo tokens CSRF dedicados de entrada: añaden bastante complejidad y las
defensas actuales cubren el caso. Si la revisión de arriba encuentra huecos, se
reconsidera.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Los subdominios comparten cookie por `Domain=.nexara.com.mx` | No cambia respecto a hoy; `HttpOnly` **reduce** el riesgo actual |
| La app nativa se queda sin sesión | La cabecera mantiene precedencia; probar la APK antes de la fase 2 |
| El logout deja de funcionar | Endpoint de logout en servidor, **fase 0**, antes que nada |
| `/uploads` por cookie | Ya funciona con la cookie tal cual; `HttpOnly` no le afecta (la manda el navegador igual) |
| Los 42 sockets migrados en la Fase 1 | `createRealtimeSocket` lee el token de la cookie con JS. **Se rompe con `HttpOnly`.** El handshake de socket.io debe pasar a apoyarse en la cookie que el navegador envía sola, y `resolveIdentity` en el gateway leerla de `handshake.headers.cookie` |

Ese último punto es el que más fácilmente se pasa por alto: lo introduje yo en la
Fase 1 y hay que ajustarlo en la fase 2, no después.

## Verificación pendiente — OBLIGATORIA antes de desplegar

Lo único verificado hasta ahora es que **compila** (0 errores de tipos en ambas
apps) y que **la suite pasa entera** (40 suites, 156 tests), incluidos 17 casos
nuevos sobre la precedencia cabecera/cookie en `session-cookie.spec.ts`.

Nada de esto se ha ejecutado contra un entorno real. Es un cambio en el camino de
login: **si falla, nadie entra**. Con la app levantada, comprobar:

1. Login de staff, de cliente y de sucursal.
2. Refresco de página con sesión activa.
3. Navegación entre subdominios (consola → ventas → tickets).
4. Imágenes y adjuntos de `/uploads` visibles.
5. Chat en vivo y notificaciones (sockets).
6. APK nativa: login y sincronización offline.
7. Logout, y confirmar que la cookie desaparece de verdad.

No puedo ejecutar estas pruebas sin el entorno levantado y credenciales; son
tuyas.
