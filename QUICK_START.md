# 🚀 Quick Start - Subdominios en 5 Minutos

## Resumen Visual

```
ANTES ❌                          DESPUÉS ✅
nexara.com.mx/panel/console       consola.nexara.com.mx
nexara.com.mx/panel/ventas    →   ventas.nexara.com.mx
nexara.com.mx/panel/web           web.nexara.com.mx
```

## ✅ Lo que ya se hizo

Tu aplicación está **completamente configurada** para subdominios. Estos archivos fueron creados/modificados:

```
✅ middleware.ts                    (detecta subdominios automáticamente)
✅ app/__subdomains/[slug]/        (nueva estructura de rutas)
✅ lib/subdomain-config.ts         (mapeo de subdominios)
✅ next.config.js                  (actualizado)
✅ Documentación completa
```

## 📋 Pasos Inmediatos

### Paso 1: Copiar Contenido del Panel (5 min)

Toma el contenido de **UNO** de tus paneles actuales y cópialo:

```
De: C:\...\apps\web\app\panel\console\
Para: C:\...\apps\web\app\__subdomains\[slug]\
```

**Qué copiar:**
- ✅ Todas las carpetas (activities/, clients/, etc.)
- ✅ Todos los archivos (CSS, TSX, etc.)
- ⚠️ EXCEPTO: layout.tsx y page.tsx (ya existen)

**Resultado esperado:**
```
__subdomains/[slug]/
├── activities/          ← copiado
├── clients/             ← copiado
├── dashboard/           ← copiado (sobrescribe)
├── layout.tsx           (ya existe, no cambiar)
├── page.tsx             (ya existe, no cambiar)
└── ...más carpetas copiadas
```

### Paso 2: Buscar y Reemplazar Links (2 min)

1. **Ctrl + H** en VS Code (Find and Replace)
2. **En "Find":** `/panel/console/`
3. **En "Replace":** `/`
4. **Click "Replace All"** en la carpeta `__subdomains/[slug]/`

```tsx
// Busca esto:
<Link href="/panel/console/dashboard">

// Reemplaza con:
<Link href="/dashboard">
```

### Paso 3: Probar en Desarrollo (2 min)

1. **Edita tu archivo hosts** (Windows):
   - Abre: `C:\Windows\System32\drivers\etc\hosts` (como Admin)
   - Agrega: `127.0.0.1  consola.localhost`
   - Guarda

2. **Inicia el servidor:**
   ```powershell
   cd apps/web
   npm run dev
   ```

3. **Abre en el navegador:**
   ```
   http://consola.localhost:3000
   http://consola.localhost:3000/dashboard
   ```

Si ves tu panel y el sidebar funciona → ✅ **¡Éxito!**

### Paso 4: Repetir para Otros Paneles

Repite los pasos 1-3 para:
- ventas
- web
- contabilidad
- tickets

Ahora cada uno tendrá su subdominio.

### Paso 5: Cuando Hagas Deploy (DNS)

```
Tu proveedor DNS (Cloudflare, GoDaddy, etc.)

Agrega:
consola.nexara.com.mx         A    TU_IP_SERVIDOR
ventas.nexara.com.mx          A    TU_IP_SERVIDOR
web.nexara.com.mx             A    TU_IP_SERVIDOR
```

Espera 15 minutos y ¡listo!

## 🔧 Verificar que Funciona

### El Middleware está activo si:
- ✅ `consola.localhost:3000` → Carga la página del panel console
- ✅ Cambias a `/dashboard` y funciona
- ✅ El sidebar se muestra correctamente

### En Producción:
```powershell
# En Windows PowerShell
nslookup consola.nexara.com.mx

# Deberías ver tu IP del servidor
```

## 📚 Documentación Completa

Si necesitas más detalles, lee estos archivos (en orden):

1. **GUIA_MIGRACION_WINDOWS.md** ← Empieza aquí si quieres todo paso a paso
2. **RESUMEN_CAMBIOS_SUBDOMINIOS.md** ← Qué se implementó
3. **MIGRACION_SUBDOMINIOS.md** ← Guía técnica

## 🆘 Si Algo Falla

| Problema | Solución |
|----------|----------|
| "No se resuelve consola.localhost" | Reinicia VS Code/Navegador después de editar hosts |
| "Página 404" | Verifica que copiaste TODO el contenido a `__subdomains/[slug]/` |
| "No se ve el sidebar" | Abre DevTools (F12) → Revisa errores en Console |
| "Estilos rotos" | Verifica que los imports de CSS son relativos |
| "API calls fallan" | El middleware no afecta `/api` - verifica your API config |

## 🎯 Tu Checklist

- [ ] Copiar contenido del panel
- [ ] Buscar y reemplazar links
- [ ] Editar archivo hosts
- [ ] Probar en local: `consola.localhost:3000`
- [ ] Verificar que todo funciona
- [ ] Repetir para otros paneles
- [ ] Configurar DNS cuando hagas deploy
- [ ] Probar en producción

## ⏱️ Tiempo Estimado

- Copiar un panel: 2-5 minutos
- Ajustar links: 5 minutos
- Probar en local: 5 minutos
- **Total por panel: ~15 minutos**
- **Todos los paneles: ~1-2 horas**

---

## 🚀 Next Steps

1. **Ahora:** Copia console a `__subdomains/[slug]/` y prueba
2. **Luego:** Repite para otros paneles
3. **Cuando esté listo:** Configura DNS y SSL
4. **Deploy:** Sube a producción

¡Nos vemos en `consola.nexara.com.mx`! 🎉
