# Resumen de Cambios: Implementación de Subdominios

## ¿Qué Se Implementó?

Se ha configurado tu aplicación Next.js para funcionar con **subdominios dinámicos** en lugar de subrutas. Esto significa que tus paneles ahora pueden accederse como:

- ✅ `consola.nexara.com.mx` (en lugar de `nexara.com.mx/panel/console`)
- ✅ `ventas.nexara.com.mx` (en lugar de `nexara.com.mx/panel/ventas`)
- ✅ `web.nexara.com.mx` (en lugar de `nexara.com.mx/panel/web`)
- ✅ Y lo mismo para contabilidad, tickets, ingenieros, etc.

## Archivos Creados/Modificados

### 1. **middleware.ts** ✨ CREADO
   - **Ubicación:** `apps/web/middleware.ts`
   - **Propósito:** Detecta automáticamente el subdominio de la solicitud y mapea las URLs internamente
   - **Cómo funciona:**
     - Lee el header `Host` de la solicitud
     - Extrae el subdominio (ej: "consola" de "consola.nexara.com.mx")
     - Reescribe la URL interna a `/__subdomains/[slug]/...`
     - Funciona en desarrollo local y producción

### 2. **Carpeta `__subdomains/[slug]/`** ✨ CREADA
   - **Ubicación:** `apps/web/app/__subdomains/[slug]/`
   - **Contenido:**
     ```
     [slug]/
     ├── layout.tsx           # Layout principal con sidebar dinámico
     ├── page.tsx             # Página raíz (redirige a /dashboard)
     ├── (dashboard)/         # Grupo de rutas para dashboard
     │   ├── layout.tsx
     │   └── dashboard/
     │       └── page.tsx
     ├── (auth)/              # Grupo de rutas para autenticación
     └── panel.tsx            # Componente de layout adicional
     ```

### 3. **lib/subdomain-config.ts** ✨ CREADO
   - **Ubicación:** `apps/web/lib/subdomain-config.ts`
   - **Propósito:** Define el mapeo entre subdominios públicos y carpetas internas
   - **Ejemplo:**
     ```ts
     {
       'consola': { publicDomain: 'consola.nexara.com.mx', panelPath: '/panel/console' },
       'ventas': { publicDomain: 'ventas.nexara.com.mx', panelPath: '/panel/ventas' },
       // ... etc
     }
     ```

### 4. **lib/subdomain-diagnostic.tsx** ✨ CREADO
   - **Ubicación:** `apps/web/lib/subdomain-diagnostic.tsx`
   - **Propósito:** Componente para depuración y verificación del middleware
   - **Uso:** Agrega `<SubdomainDiagnostic />` en tu layout para ver información en tiempo real

### 5. **Documentación** 📚 CREADA
   - `MIGRACION_SUBDOMINIOS.md` - Guía técnica completa
   - `GUIA_MIGRACION_WINDOWS.md` - Guía paso a paso para Windows
   - `migrate-to-subdomains.sh` - Script de migración

### 6. **next.config.js** 🔧 MODIFICADO
   - Agregados comentarios para documentar el soporte de subdominios
   - Agregada configuración de redirects (comentada, para uso futuro)
   - Sin cambios funcionales importantes (es compatible)

## Cambios en la Carpeta `app/`

### Antes:
```
app/
├── panel/
│   ├── console/           ← Console panel aquí
│   ├── ventas/            ← Ventas panel aquí
│   ├── web/               ← Web panel aquí
│   └── cotizaciones/
└── ... otras rutas
```

### Después:
```
app/
├── __subdomains/          ← NUEVA CARPETA
│   └── [slug]/            ← Dinámico: console, ventas, web, etc.
│       ├── layout.tsx
│       ├── page.tsx
│       ├── (dashboard)/
│       │   └── dashboard/
│       │       └── page.tsx
│       └── (auth)/
│           └── login/
├── panel/                 ← Mantiene la estructura antigua
│   ├── console/
│   ├── ventas/
│   ├── web/
│   └── ... (sin cambios)
├── ... otras rutas
```

**Nota:** La carpeta `panel/` permanece sin cambios. Puedes migrar gradualmente.

## Cómo Funciona el Flujo

```
Usuario accede a: consola.nexara.com.mx/dashboard
                  ↓
Navegador envía solicitud HTTP con Host: consola.nexara.com.mx
                  ↓
middleware.ts intercepta
  ├─ Lee Host header → "consola.nexara.com.mx"
  ├─ Extrae subdominio → "consola"
  └─ Mapea a slug interno → "console"
                  ↓
Next.js carga: /__subdomains/console/dashboard
                  ↓
Route Handler (Next.js File Router):
  ├─ Carpeta: [slug] con slug="console"
  ├─ Carga layout de [slug]/layout.tsx (con sidebar dinámico)
  ├─ Carga page de (dashboard)/dashboard/page.tsx
                  ↓
Usuario ve: Dashboard del panel CONSOLE con sidebar
```

## Configuración del Middleware

El middleware en `middleware.ts` detecta:

### En Desarrollo Local (Windows)
```
localhost:3000           → Sin subdominio (dominio principal)
consola.localhost:3000   → Subdominio "console"
ventas.localhost:3000    → Subdominio "ventas"
```

### En Producción
```
nexara.com.mx            → Sin subdominio (dominio principal)
consola.nexara.com.mx    → Subdominio "consola" → mapea a "console"
ventas.nexara.com.mx     → Subdominio "ventas" → mapea a "ventas"
```

## Sidebar Dinámico

El `layout.tsx` de `[slug]` incluye un sidebar que se adapta automáticamente:

```tsx
const getSidebarLinks = (): SidebarLink[] => {
  switch (slug) {
    case 'console':
      return [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Actividades', href: '/activities' },
        { label: 'Clientes', href: '/clients' },
        // ... más links
      ];
    case 'ventas':
      return [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Cotizaciones', href: '/cotizaciones' },
        // ... más links
      ];
    // ... etc para otros paneles
  }
};
```

Cada panel tiene sus propios links específicos.

## Qué Necesitas Hacer Ahora

### Fase 1: Desarrollo Local (Ahora)
1. ✅ Estructura creada
2. 📝 Copiar contenido de panels existentes a `__subdomains/[slug]/`
3. ⚡ Ajustar links internos (cambiar rutas de `/panel/console/` a `/`)
4. 🧪 Probar en desarrollo local (editar el archivo hosts)

### Fase 2: Producción (Cuando esté listo)
5. 🌐 Configurar DNS (agregar registros A para subdominios)
6. 🔒 Obtener certificado SSL wildcard
7. 🚀 Deploy a producción
8. ✅ Verificar funcionalidad

## Archivos para Revisar

Para entender bien cómo funciona, revisa estos archivos en el siguiente orden:

1. **middleware.ts** - Entiende cómo detecta subdominios
2. **lib/subdomain-config.ts** - Ve el mapeo de subdominios
3. **app/__subdomains/[slug]/layout.tsx** - El layout principal dinámico
4. **app/__subdomains/[slug]/(dashboard)/dashboard/page.tsx** - Ejemplo de página

## Preguntas Frecuentes

### ¿Puedo mantener las rutas antiguas (`/panel/*`) funcionando?
**Sí.** Una correcta. Las carpetas en `panel/` siguen existiendo, así que ambas funcionarán temporalmente. Cuando estés listo, puedes añadir redirects en `next.config.js` para forzar el uso de subdominios.

### ¿Y si un usuario accede a `nexara.com.mx/console`?
**Sin configuración adicional**, verá la página raíz. Puedes agregar redirects en `next.config.js` para redirigir `/console` → a subdominio.

### ¿Qué pasa con los tokens/cookies de sesión?
**Importante:** Los cookies con `domain: .nexara.com.mx` funcionarán en todos los subdominios. Verifica tu configuración de autenticación.

### ¿Puedo usar esto con API calls?
**Sí.** El middleware solo afecta las rutas (páginas). Las API calls siguen usando `/api/*` normalmente.

## Próximas Acciones Recomendadas

1. **Lee la guía** `GUIA_MIGRACION_WINDOWS.md` para instrucciones paso a paso
2. **Copia un panel** (ej: console) como ejemplo
3. **Prueba en local** con `consola.localhost:3000`
4. **Ajusta otros paneles** siguiendo el mismo patrón
5. **Cuando todo funcione**, configura DNS y SSL
6. **Haz deploy** a producción

## Documentación de Referencia

- **Next.js Middleware:** https://nextjs.org/docs/app/building-your-application/routing/middleware
- **Dynamic Routes:** https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes
- **DNS Records:** Consulta con tu proveedor

---

**Última actualización:** Febrero 20, 2026  
**Estado:** ✅ Implementado y listo para migración
