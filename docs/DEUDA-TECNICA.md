# Deuda técnica — NEXARA

**Fecha del inventario:** 2026-08-27 · **Rama:** `mejora/calidad-y-web` · **Base:** `main` (1 065 commits)

Este documento recoge lo que queda a medias **y no se puede cerrar sin una
decisión de producto**. Lo trivial no vive aquí: se arregla y se commitea.

---

## 0. Aviso sobre el conteo de TODO/FIXME

El encargo de este turno esperaba **~31** marcadores `TODO`/`FIXME`. **No los hay.**
El comando propuesto era:

```bash
grep -rn "TODO\|FIXME" apps/*/src --include=*.ts --include=*.tsx | grep -v node_modules
```

Tiene dos sesgos que inflaban la expectativa:

1. **`apps/*/src` no cubre la web.** `apps/web` no tiene carpeta `src/`: su
   código vive en `app/`, `components/` y `lib/`. El patrón solo alcanzaba
   `apps/api/src`.
2. **Sin `\b`, "TODO" captura la palabra española "TODO"/"TODOS"** en
   comentarios en prosa, que en este repo son mayoría.

Conteo real sobre todo `apps/`, excluyendo `node_modules`, `.next`, `dist`,
`build` y los worktrees:

```bash
grep -rnE "\b(TODO|FIXME|HACK|XXX)\b" apps \
  --include=*.ts --include=*.tsx --include=*.js --include=*.jsx \
  | grep -v node_modules | grep -v '/.next/' | grep -v '/dist/' | grep -v '/build/'
```

**5 coincidencias**, de las cuales **solo 1 era deuda real**:

| Ruta:línea | Texto | Veredicto |
|---|---|---|
| `apps/api/src/gps/dto/update-gps.dto.ts:2` | `TODO: Define los campos actualizables…` | **Deuda real → RESUELTA** en este turno |
| `apps/api/src/common/rbac/url-matrix.ts:100` | `// CEO — ve TODO (lectura)…` | Falso positivo: "TODO" español |
| `apps/web/lib/rbac/page-matrix.ts:41` | `// CEO — ve TODO en lectura` | Falso positivo: "TODO" español |
| `apps/api/src/pac/cfdi-xml.builder.ts:342` | `cadenaOriginal` con `XXX` | Falso positivo: `XXX` es el código SAT de "sin moneda" en complementos de pago |
| `apps/api/src/pac/cfdi-xml.builder.ts:351` | `Moneda="XXX"` | Ídem |

Además: **0 ocurrencias** de `@ts-ignore`, `@ts-nocheck` o `@ts-expect-error` en
todo `apps/`. La supresión de tipos no es un problema en este repo.

**Conclusión: la deuda de este proyecto no está marcada con `TODO`.** Está en
módulos que funcionan con datos sintéticos o adaptadores mock, y en código
muerto. Eso es lo que inventaría el resto del documento.

---

## 1. Módulos que sirven datos sintéticos

### 1.1 NOC — dashboard sobre datos inventados

**`apps/api/src/noc/noc.service.ts:29-36`** (y `listDevices`, línea 41)

El servicio genera dispositivos sintéticos derivados de `operationalProject` y
`service-clients` reales. El propio comentario documenta el plan: adaptadores
por dispositivo en `apps/api/src/noc/adapters/` para Hikvision ISAPI, SNMP y MQTT.

- **Decisión de producto:** ¿se vende NOC como módulo activo o se marca "en
  diseño" hasta tener integración real? Hoy un cliente ve un panel que parece
  telemetría y no lo es.
- **Nota:** ya existe documentación local de ISAPI/HCT (skill `hikvision-api`);
  el camino técnico está, falta la decisión y el alcance.

### 1.2 Timbrado CFDI en modo mock

**`apps/api/src/pac/adapters/mock.adapter.ts`** · usado en **`apps/api/src/pac/pac.service.ts:33`**

`PAC_PROVIDER` por defecto es `mock`. **Esto NO es un bug**: `assertProductionReady()`
(`pac.service.ts:50-57`) bloquea el timbrado si `NODE_ENV=production` y el adapter
es mock, y `fallbackToMock` se fuerza a `false` en producción.

- **Decisión de producto/proveedor:** contratar PAC real (Facturama, SW o Finkok)
  y cargar `PAC_PROVIDER` + credenciales + CSD. Hasta entonces, **facturación
  electrónica no es funcional en producción, por diseño.**
- **Riesgo si se olvida:** el módulo de invoicing existe y es navegable; el fallo
  aparece solo al intentar timbrar.

---

## 2. Integraciones anunciadas y no conectadas

### 2.1 Notificaciones de comida sin WebSocket

**`apps/api/src/attendance/lunch/lunch-breaks.cron.service.ts:182-186`**

El método `broadcastNotification()` solo escribe en el log; el comentario dice
"Aquí iría la integración con WebSocket/Socket.io — Por ahora solo logging".
Se invoca desde 4 sitios del módulo. El resto del sistema **sí** tiene Socket.io
(`createRealtimeSocket` en la web, `@nestjs/websockets` en la API), así que la
pieza que falta es el cableado, no la infraestructura.

- **Decisión de producto:** ¿a quién se notifica (solo administradores, o también
  al empleado), y con qué prioridad frente al centro de notificaciones existente?

### 2.2 SCIM: superficie declarada, provisioning no implementado

**`apps/api/src/auth/oidc.service.ts:174-181`**

`scimStatus()` devuelve `endpoint: '/scim/v2'` y una nota que se describe a sí
misma como "skeleton Iter 9". El endpoint anunciado no tiene implementación.

- **Decisión de producto:** SCIM es una exigencia de venta *enterprise*. O se
  implementa, o se retira del estado público para no prometer lo que no hay.

### 2.3 CT: XML del proveedor parseado como JSON

**`apps/api/src/smart-quote/connectors/ct-ftp.connector.ts:75`**

`// XML completo: por ahora si no hay parser XML dedicado, reutilizamos JSON`.

- **Contexto externo:** el catálogo de producción de CT exige IP autorizada (el
  puerto 3001 está filtrado hasta el alta). Cerrar esto depende de un tercero.

---

## 3. Código muerto (0 referencias en el árbol)

Ninguno se ha borrado en este turno: los tres son piezas deliberadas y retirarlas
es una decisión de diseño, no una limpieza obvia.

| Ruta | Qué es | Referencias |
|---|---|---|
| `apps/web/components/ui/ModuleStub.tsx` | Placeholder narrativo para módulos sin UI propia, con badge, capacidades y roadmap | **0** |
| `apps/web/lib/errors/ErrorAlert.tsx:1` | Se autodescribe `// Simple ErrorAlert component placeholder`; estilos en línea, sin tema | **0** |
| `apps/web/lib/errors/api-error.ts:1` | Se autodescribe `// Simple parseApiError placeholder` | **0** |

- **Decisión de producto:** `ModuleStub` parece pensado para los módulos que hoy
  no tienen pantalla. O se usa (y entonces hay que decidir en qué rutas), o se
  retira. `lib/errors/*` es un intento de manejo de errores unificado que nunca
  se adoptó: o se termina y se aplica, o se borra para no confundir.

---

## 4. Cosmético / bajo impacto

| Ruta:línea | Asunto |
|---|---|
| `apps/web/lib/access-matrix.ts:237` | Iconos como emoji; el comentario planea migrar a `lucide-react` |
| `apps/api/src/projects/projects.service.ts:399` | `catch` silencioso al insertar imagen en PDF; cae a placeholder sin registrar el motivo |
| `apps/api/src/jobs/jobs.module.ts:31` | Cola registrada como "durable placeholder that validates shape" |

---

## 5. Resuelto en este turno (no vuelve a la lista)

- **`apps/api/src/gps/dto/update-gps.dto.ts`** — era un stub vacío con el único
  `TODO` real del repo. Completado como `PartialType(OmitType(CreateGpsDto,
  ['usuarioId']))`, con spec propia (11 casos) que replica el `ValidationPipe`
  global de `main.ts`.
- **`apps/web/lib/legacy-path-remap.ts:80`** — el destino del remapeo era
  `'/tickets$1'`, pero `joinRemapTarget()` concatena, no sustituye grupos. Un
  bookmark `/panel/tickets/9` acababa en `/tickets$1/9`, ruta que la whitelist
  del rol `cliente` no reconoce: **el cliente veía un bloqueo**. Lo detectó una
  de las specs nuevas. Corregido y con test de regresión.
- **`apps/web/app/components/Footer.tsx`** — la página `/legal/eliminar-cuenta`
  existía y estaba en el sitemap, pero **ningún enlace de la UI llevaba a ella**.
  Google Play exige que sea alcanzable desde la navegación. Enlace añadido.
- **`apps/tmp/`** — residuo (logs de build, PDFs y capturas de smoke) eliminado
  del árbol. `apps/api/scripts/smoke-cotizacion-pdf.ts:45` sigue escribiendo ahí
  y recrea el directorio con `mkdirSync({recursive:true})`; se añadió `apps/tmp/`
  a `.gitignore` para que no vuelva a versionarse.
