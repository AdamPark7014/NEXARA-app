# Guía Práctica: Migración de Subrutas a Subdominios en Windows

## Resumen Rápido

Tu aplicación está configurada para trabajar con subdominios. Antes necesitabas:
- `nexara.com.mx/panel/console` ❌

Ahora será:
- `consola.nexara.com.mx` ✅

## Paso 1: Entender la Nueva Estructura

### Carpeta Nueva Creada
```
apps/web/app/__subdomains/[slug]/
├── layout.tsx           # ← Tiene el sidebar automático
├── page.tsx             # ← Redirige a /dashboard
├── (dashboard)/         # ← Grupo para páginas normales
│   ├── layout.tsx
│   └── dashboard/
│       └── page.tsx
└── (auth)/              # ← Grupo para login (sin sidebar)
    └── login/
        └── page.tsx
```

### Mapeo de Subdominios
```
consola.nexara.com.mx   → console
ventas.nexara.com.mx    → ventas
web.nexara.com.mx       → web
contabilidad.nexara.com.mx → contabilidad
tickets.nexara.com.mx   → tickets
```

El **middleware** (`middleware.ts`) detecta automáticamente el subdominio y lo mapea.

## Paso 2: Copiar Contenido Actual a la Nueva Estructura

### Opción A: Copiar CONSOLE (Ejemplo)

1. **Abre el explorador de archivos:**
   - Navega a: `apps/web/app/panel/console/`

2. **Copia TODO EL CONTENIDO** (excepto `layout.tsx` y `page.tsx` que ya existen):
   ```
   activities/
   attendance/
   client-tickets/
   clients/
   console.module.css
   cotizaciones/
   dashboard/
   evidences/
   gps/
   my-activities/
   my-evidences/
   my-profile/
   my-vehicles/
   my-viatics/
   Sidebar.tsx
   users/
   vehicles/
   viatics/
   ```

3. **Pega en:** `apps/web/app/__subdomains/[slug]/`

4. **Resultado:** La estructura en `[slug]` tendrá:
   ```
   app/__subdomains/[slug]/
   ├── layout.tsx              (ya existe)
   ├── page.tsx                (ya existe)
   ├── activities/             (copiado)
   ├── attendance/             (copiado)
   ├── console.module.css      (copiado)
   ├── dashboard/              (copiado, sobrescribe el existente)
   ├── Sidebar.tsx             (copiado)
   └── ... etc
   ```

### Opción B: Copiar VENTAS, WEB, etc.

Repite el proceso anterior para cada panel que quieras migrar.

## Paso 3: Ajustar los Enlaces Internos

### Cambios Necesarios en los Archivos Copiados

Si ves links como estos en el código:
```tsx
// ANTES (en /panel/console/)
<Link href="/panel/console/dashboard">Dashboard</Link>
<Link href="/panel/console/clients">Clientes</Link>
```

Cámbialos a:
```tsx
// DESPUÉS (en /__subdomains/[slug]/)
<Link href="/dashboard">Dashboard</Link>
<Link href="/clients">Clientes</Link>
```

### Búsqueda y Reemplazo Rápida (VS Code)

1. **Ctrl + H** (Abrir "Find and Replace")
2. **En "Find":** escribe `/panel/console/`
3. **En "Replace":** escribe `/`
4. **Click "Replace All"**

Repite para cada panel (ventas, web, contabilidad, etc.)

## Paso 4: Probar en Desarrollo Local

### En Windows, edita el archivo hosts:

1. **Abre Bloc de Notas como Administrador:**
   - `C:\Windows\System32\drivers\etc\hosts`

2. **Agrega al final del archivo:**
   ```
   127.0.0.1       consola.localhost
   127.0.0.1       ventas.localhost
   127.0.0.1       web.localhost
   127.0.0.1       contabilidad.localhost
   127.0.0.1       tickets.localhost
   ```
   
   O si prefieres puerto explícito:
   ```
   127.0.0.1       localhost.local
   ```

3. **Guarda el archivo**

### Ejecuta el servidor:
```powershell
cd apps/web
npm run dev

# O si usas turbo desde la raíz:
npm run dev
```

### Prueba en el navegador:
```
http://consola.localhost:3000/dashboard
http://ventas.localhost:3000/dashboard
http://web.localhost:3000/dashboard
```

## Paso 5: Configurar DNS en Producción

Cuando estés listo para ir a producción, necesitas:

### 1. Accede a tu proveedor de DNS
- DigitalOcean
- Cloudflare
- GoDaddy
- etc.

### 2. Agrega registros A para cada subdominio
```
NOMBRE                    TIPO    VALOR
consola.nexara.com.mx     A       TU_IP_SERVIDOR
ventas.nexara.com.mx      A       TU_IP_SERVIDOR
web.nexara.com.mx         A       TU_IP_SERVIDOR
contabilidad.nexara.com.mx A      TU_IP_SERVIDOR
tickets.nexara.com.mx     A       TU_IP_SERVIDOR
```

O usa un **wildcard** (si tu DNS lo permite):
```
*.nexara.com.mx           A       TU_IP_SERVIDOR
```

### 3. Espera 5-30 minutos para que se propague

### 4. Verifica que funciona:
```powershell
# En PowerShell
Resolve-DnsName consola.nexara.com.mx
```

Deberías ver tu IP en el resultado.

## Paso 6: Certificado SSL en Producción

Para HTTPS con subdominios, necesitas un certificado wildcard:

### Con Let's Encrypt (Recomendado, GRATIS):
```bash
# En tu servidor
certbot certonly \
  --manual \
  -d "*.nexara.com.mx" \
  -d "nexara.com.mx" \
```

Sigue las instrucciones para validación DNS.

## Checklist de Migración

```
☐ Copiar contenido de panel/console a __subdomains/[slug]/
☐ Copiar contenido de panel/ventas a __subdomains/[slug]/
☐ Copiar otros paneles necesarios
☐ Ajustar links en archivos (Ctrl + H reemplazar /panel/console/ → /)
☐ Ajustar imports internos
☐ Probar en desarrollo (consola.localhost:3000)
☐ Configurar DNS en producción
☐ Obtener certificado SSL wildcard
☐ Deploy a producción
☐ Verificar que todo funciona
```

## Problemas Comunes

### Problema: "No se resuelve consola.localhost"
**Solución:** Verifica que editaste correctamente `C:\Windows\System32\drivers\etc\hosts` y reinicia tu editor/navegador.

### Problema: "Página en blanco o error 404"
**Solución:** 
- Verifica que copiaste todo el contenido correctamente
- Revisa la consola del navegador (F12) para ver errores
- Usa `http://consola.localhost:3000/dashboard` (con `/dashboard` explícito)

### Problema: "Los estilos/imágenes no cargan"
**Solución:**
- Si usas rutas absolutas en CSS, cambialas a relativas
- Si importas imágenes, asegúrate que las rutas sean correctas

### Problema: "API calls fallan"
**Solución:**
- Si los calls a API asumen `/panel/console/`, actualiza las llamadas
- El middleware solo redirecciona las rutas, no los headers HTTP

## Estructura Final Esperada

Después de completar la migración, tu carpeta `__subdomains/[slug]` debería verse así:

```
app/__subdomains/[slug]/
├── (auth)/
│   └── login/
│       └── page.tsx
├── (dashboard)/
│   ├── dashboard/
│   │   └── page.tsx
│   ├── activities/
│   │   └── page.tsx
│   ├── clients/
│   │   └── page.tsx
│   ├── my-profile/
│   │   └── page.tsx
│   └── ... más páginas
├── layout.tsx           # ← Tiene el sidebar automático
├── page.tsx             # ← Redirige a /dashboard
└── components.tsx       # ← Componentes específicos del panel
```

## Mantener URLs Antiguas (Opcional)

Si quieres que `/panel/console/*` siga funcionando temporalmente:

1. Abre `next.config.js`
2. Descomenta la sección `redirects()`
3. Agrega: `source: '/panel/console/:path*'` → `destination: '/console/:path*'`

## Próximos Pasos

1. **Migra los paneles** siguiendo los pasos arriba
2. **Prueba en desarrollo local** 
3. **Cuando todo funcione, prepara producción:**
   - Configura DNS
   - Obtén certificado SSL
   - Deploy a tu servidor
4. **Verifica que todo funciona en producción**

## Documentación Adicional

- `MIGRACION_SUBDOMINIOS.md` - Guía técnica completa
- `lib/subdomain-config.ts` - Configuración del mapeo
- `middleware.ts` - Lógica de detección de subdominios

¡Éxito con la migración! 🚀
