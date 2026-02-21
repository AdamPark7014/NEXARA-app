# 📖 Índice de Documentación - Migración a Subdominios

Tu aplicación ha sido configurada para funcionar con subdominios. Aquí está toda la documentación disponible.

## 🚀 Empieza Por Aquí

### 1. **QUICK_START.md** ← LEÉ ESTO PRIMERO
   - **Duración:** 5 minutos
   - **Contenido:** Pasos rápidos para empezar
   - **Para:** Usuarios que quieren hacer/entender todo en 15 min
   - 📍 [QUICK_START.md](./QUICK_START.md)

### 2. **GUIA_MIGRACION_WINDOWS.md** - Para Windows Users
   - **Duración:** 20-30 minutos (lectura + implementación)
   - **Contenido:** Pasos detallados, paso a paso
   - **Para:** Usuarios en Windows que necesitan instrucciones claras
   - **Incluye:**
     - Cómo copiar contenido
     - Cómo editar el archivo hosts
     - Cómo probar localmente
     - Cómo configurar DNS en producción
     - Troubleshooting
   - 📍 [GUIA_MIGRACION_WINDOWS.md](./GUIA_MIGRACION_WINDOWS.md)

## 🔍 Documentación de Referencia

### 3. **RESUMEN_CAMBIOS_SUBDOMINIOS.md** - Qué Se Implementó
   - **Duración:** 10-15 minutos (lectura)
   - **Contenido:** 
     - Resumen de cambios técnicos
     - Estructura de carpetas
     - Cómo funciona el middleware
     - Archivos creados/modificados
     - FAQ
   - **Para:** Entender la arquitectura y cambios realizados
   - 📍 [RESUMEN_CAMBIOS_SUBDOMINIOS.md](./RESUMEN_CAMBIOS_SUBDOMINIOS.md)

### 4. **MIGRACION_SUBDOMINIOS.md** - Guía Técnica Completamente
   - **Duración:** 20-30 minutos (lectura)
   - **Contenido:**
     - Bien explicado el cambio (antes/después)
     - Mapeo detallado de subdominios
     - Cómo migrar contenido
     - Configuración DNS
     - Certificados SSL
     - Configuración del servidor (Nginx, Apache)
     - Redirects para URLs antiguas
   - **Para:** Desarrolladores o DevOps que necesitan todo el contexto
   - 📍 [MIGRACION_SUBDOMINIOS.md](./MIGRACION_SUBDOMINIOS.md)

## 🛠️ Herramientas y Scripts

### 5. **migrate-to-subdomains.sh** - Script Automático
   - **Sistema:** Linux/Mac (Bash)
   - **Propósito:** Automatizar copia de contenido
   - **Uso:** 
     ```bash
     bash migrate-to-subdomains.sh console ventas web
     ```
   - 📍 [migrate-to-subdomains.sh](./migrate-to-subdomains.sh)

## 📁 Archivos de Código Nuevos/Modificados

### Middleware
- **`apps/web/middleware.ts`** - 🆕 El corazón del sistema de subdominios
  - Detecta automáticamente qué subdominio está siendo accedido
  - Mapea `consola.nexara.com.mx` → carpeta `console`
  - Funciona en desarrollo y producción

### Estructura de Rutas
- **`apps/web/app/__subdomains/[slug]/`** - 🆕 Carpeta dinámicaa
  - `layout.tsx` - Layout principal con sidebar
  - `page.tsx` - Página raíz (redirige a /dashboard)
  - `(dashboard)/` - Grupo de rutas para dashboard
  - `(auth)/` - Grupo de rutas para autenticación

### Configuración
- **`apps/web/lib/subdomain-config.ts`** - 🆕 Mapeo de subdominios
  - Define qué subdominio corresponde a cada panel
  - Define dominios públicos

### Herramientas
- **`apps/web/lib/subdomain-diagnostic.tsx`** - 🆕 Componente de debugging
  - Monitoreo en tiempo real del subdominio actual
  - Útil para verificar que el middleware está funcionando

### Configuración del Proyecto
- **`apps/web/next.config.js`** - 🔧 Actualizado
  - Comentarios sobre soporte de subdominios
  - Configuración lista para redirects (si es necesario)

## 🎯 Flujo Recomendado de Lectura

**Si tienes 5 minutos:**
1. Lee [QUICK_START.md](./QUICK_START.md)
2. Copia un panel
3. Prueba en local

**Si tienes 30 minutos:**
1. Lee [QUICK_START.md](./QUICK_START.md)
2. Lee [GUIA_MIGRACION_WINDOWS.md](./GUIA_MIGRACION_WINDOWS.md)
3. Implementa los pasos
4. Prueba en local y otros paneles

**Si tienes 1-2 horas:**
1. Lee [QUICK_START.md](./QUICK_START.md)
2. Lee [RESUMEN_CAMBIOS_SUBDOMINIOS.md](./RESUMEN_CAMBIOS_SUBDOMINIOS.md)
3. Lee [GUIA_MIGRACION_WINDOWS.md](./GUIA_MIGRACION_WINDOWS.md)
4. Implementa TODO (todos los paneles)
5. Prepara producción (DNS, SSL)

**Si eres DevOps/Backend:**
1. Lee [RESUMEN_CAMBIOS_SUBDOMINIOS.md](./RESUMEN_CAMBIOS_SUBDOMINIOS.md)
2. Lee [MIGRACION_SUBDOMINIOS.md](./MIGRACION_SUBDOMINIOS.md)
3. Configura el servidor
4. Configura DNS y certificados

## 📋 Mapeo de Subdominios (De Referencia Rápida)

| Subdominio | Dominio Público | Panel Antiguo |
|---|---|---|
| `console` | `consola.nexara.com.mx` | `/panel/console` |
| `ventas` | `ventas.nexara.com.mx` | `/panel/ventas` |
| `web` | `web.nexara.com.mx` | `/panel/web` |
| `contabilidad` | `contabilidad.nexara.com.mx` | `/panel/contabilidad` |
| `tickets` | `tickets.nexara.com.mx` | `/panel/tickets` |
| `ingenieros` | `ingenieros.nexara.com.mx` | `/panel/ingenieros` |
| `dashboard` | `dashboard.nexara.com.mx` | `/panel/dashboard` |

## 🔑 Conceptos Clave

### ¿Qué es el Middleware?
Un interceptor que corre en el servidor y:
1. Lee el dominio de la solicitud
2. Extrae el subdominio (ej: "consola" de "consola.nexara.com.mx")
3. Internamente, mapea a la carpeta `[slug]` con el valor correcto
4. Carga el contenido correcto

### ¿Cómo funciona `[slug]`?
Es una carpeta dinámica de Next.js que:
- Recibe el parámetro `slug` desde el middleware
- El `slug` es "console", "ventas", "web", etc.
- El layout se adapta según el slug (diferentes sidebars, links, etc.)

### URLs Internas vs Externas
- **Interna** (lo que ve Next.js): `/__subdomains/console/dashboard`
- **Externa** (lo que ve el usuario): `consola.nexara.com.mx/dashboard`
- El middleware las traduce automáticamente

## 🧪 Verificación Rápida

Para saber si todo está configurado correctamente:

```powershell
# Asumiendo que tengas el servidor corriendo en localhost:3000
# y hayas editado tu archivo hosts

curl -H "Host: consola.localhost" http://localhost:3000
```

Si funciona, deberías ver HTML de tu página principal.

## 🚨 Páginas de Error Comunes

Si ves estos errores, consulta el archivo correspondiente:

| Error | Consulta |
|---|---|
| "No encuentra consola.localhost" | GUIA_MIGRACION_WINDOWS.md → Paso 4 (Archivo Hosts) |
| "404 Not Found" | QUICK_START.md → Paso 2 (¿Copiaste TODO?) |
| "Estilos rotos" | GUIA_MIGRACION_WINDOWS.md → Problemas Comunes |
| "Links rotos" | QUICK_START.md → Paso 2 (Buscar y reemplazar) |

## 📞 Soporte Rápido

**Pregunta:** ¿Cómo pruebo en local?
**Respuesta:** Ver [QUICK_START.md](./QUICK_START.md) Paso 3

**Pregunta:** ¿Cómo configuro DNS?
**Respuesta:** Ver [MIGRACION_SUBDOMINIOS.md](./MIGRACION_SUBDOMINIOS.md) "Configurar DNS"

**Pregunta:** ¿Puedo mantener `/panel/*` funcionando?
**Respuesta:** Ver [MIGRACION_SUBDOMINIOS.md](./MIGRACION_SUBDOMINIOS.md) "Soporte para URLs Antiguas"

**Pregunta:** ¿Qué archivos modifiqué?
**Respuesta:** Ver [RESUMEN_CAMBIOS_SUBDOMINIOS.md](./RESUMEN_CAMBIOS_SUBDOMINIOS.md) "Archivos Creados/Modificados"

## 📊 Estado del Proyecto

```
✅ Middleware implementado
✅ Estructura de carpetas creada
✅ Configuración lista
✅ Documentación completa
⏳ Migración de contenido (POR HACER - por ti)
⏳ Testing en producción (POR HACER - por ti)
⏳ Configuración DNS (POR HACER - por ti)
⏳ Certificado SSL (POR HACER - por ti)
```

---

## 🎬 Empieza Ahora

Si aún no lo has hecho:

1. **Abre** [QUICK_START.md](./QUICK_START.md)
2. **Sigue** los 5 pasos en orden
3. **Prueba** en tu navegador
4. **Repite** para otros paneles

¡Déjame saber si tienes preguntas! 🚀
