# 🌐 Conexión entre Dominios - Nexara

## Arquitectura

```
┌─────────────────────┐
│  nexara.com.mx      │  ← Página pública (rutas en /app/(public))
│  Visitantes         │  ← Lee de la API: noticias, proyectos, clientes
└──────────┬──────────┘
           │
           │ HTTPS
           │
           ▼
    ┌──────────────┐
    │   API :3001  │  ← Backend NestJS + Prisma + PostgreSQL
    │   /api/*     │
    └──────┬───────┘
           │
           │
           ▼
┌─────────────────────┐
│ web.nexara.com.mx   │  ← Panel de administración
│ Gestiona contenido  │  ← Escribe en la API: crea/edita noticias, proyectos, etc.
└─────────────────────┘
```

## Flujo de Trabajo

### 1. **Crear/Editar Contenido** (web.nexara.com.mx)

Un administrador entra a `https://web.nexara.com.mx`:
- **Noticias** (`/noticias`): Crea/edita posts, sube imágenes, publica
- **Proyectos** (`/proyectos`): Gestiona portafolio de proyectos
- **Clientes** (`/clientes`): Administra clientes y sus logos
- **Contactos** (`/contactos`): Ve mensajes del formulario de contacto

Todas estas acciones **escriben en la API** via:
```typescript
fetch('https://nexara.com.mx/api/news', { method: 'POST', ... })
fetch('https://nexara.com.mx/api/projects', { method: 'PUT', ... })
```

### 2. **Mostrar Contenido** (nexara.com.mx)

Un visitante entra a `https://nexara.com.mx`:
- **Página principal** (`/`): Muestra últimas noticias y clientes
- **Proyectos** (`/proyectos`): Lista todos los proyectos publicados
- **Contacto** (`/contacto`): Formulario que envía mensajes a la API

Todas estas páginas **leen de la API** via:
```typescript
fetch('https://nexara.com.mx/api/news?status=PUBLISHED')
fetch('https://nexara.com.mx/api/projects')
fetch('https://nexara.com.mx/api/clients')
```

### 3. **Conexión en Tiempo Real**

✅ **Ya funciona automáticamente** porque ambos dominios comparten la misma API:
- Cuando publicas una noticia en `web.nexara.com.mx` → Se guarda en PostgreSQL via API
- Cuando un visitante recarga `nexara.com.mx` → La API devuelve las noticias actualizadas
- **No se necesita configuración adicional**

## Variables de Entorno

### Desarrollo (Local)
```env
# apps/web/.env
NEXT_PUBLIC_API_URL="http://localhost:3001/api"
```

### Producción (Servidor)
```env
# apps/web/.env.production
NEXT_PUBLIC_API_URL="https://nexara.com.mx/api"
```

## Nginx Configuration

El servidor nginx ya está configurado para:
1. Servir `nexara.com.mx` → Next.js en puerto 3000
2. Servir `web.nexara.com.mx` → Next.js en puerto 3000 (mismo proceso)
3. Proxy `/api/*` → NestJS API en puerto 3001

```nginx
# /etc/nginx/sites-available/nexara
server {
    server_name nexara.com.mx www.nexara.com.mx 
                web.nexara.com.mx 
                consola.nexara.com.mx 
                ventas.nexara.com.mx 
                contabilidad.nexara.com.mx 
                tickets.nexara.com.mx;

    # Frontend (Next.js)
    location / {
        proxy_pass http://localhost:3000;
        # ...
    }

    # API (NestJS)
    location /api {
        proxy_pass http://localhost:3001;
        # ...
    }
}
```

## Middleware de Subdominios

El middleware de Next.js maneja el enrutamiento:

```typescript
// apps/web/middleware.ts

// Si NO hay subdominio → Muestra (public)
// https://nexara.com.mx/ → app/(public)/page.tsx

// Si HAY subdominio → Reescribe a ruta específica
// https://web.nexara.com.mx/ → app/(subdomains)/web/
// https://consola.nexara.com.mx/ → app/(subdomains)/console/
```

## Páginas que se Conectan

### Panel Web (web.nexara.com.mx)
- `/dashboard` - Vista general
- `/noticias` - CRUD de noticias (NewsPost)
- `/proyectos` - CRUD de proyectos (Project)
- `/clientes` - CRUD de clientes (Client)
- `/contactos` - Lista de mensajes (ContactMessage)

### Página Pública (nexara.com.mx)
- `/` - Muestra últimas noticias y clientes
- `/proyectos` - Portfolio de proyectos
- `/contacto` - Formulario de contacto
- `/nexara` - Página sobre la empresa
- `/servicios` - Servicios ofrecidos
- `/soluciones` - Soluciones IT

## Endpoints de la API

### News (Noticias)
- `GET /api/news?status=PUBLISHED` - Listar publicadas (público)
- `GET /api/news` - Listar todas (admin)
- `POST /api/news` - Crear (admin)
- `PUT /api/news/:id` - Editar (admin)
- `DELETE /api/news/:id` - Eliminar (admin)

### Projects (Proyectos)
- `GET /api/projects` - Listar todos
- `POST /api/projects` - Crear
- `PUT /api/projects/:id` - Editar
- `DELETE /api/projects/:id` - Eliminar

### Clients (Clientes)
- `GET /api/clients` - Listar todos
- `POST /api/clients` - Crear
- `PUT /api/clients/:id` - Editar
- `DELETE /api/clients/:id` - Eliminar

### Contact Messages (Mensajes de Contacto)
- `POST /api/contact-messages/inbound` - Crear (desde formulario público)
- `GET /api/contact-messages` - Listar (admin)
- `PUT /api/contact-messages/:id` - Actualizar estado (admin)

## Deployment

Para que todo funcione en producción:

```bash
# 1. Copiar .env.production al servidor
scp apps/web/.env.production root@138.197.42.104:/var/www/nexara-app/apps/web/

# 2. Rebuild con variables de producción
cd /var/www/nexara-app/apps/web
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build  # Lee .env.production automáticamente

# 3. Reiniciar Next.js
pm2 restart nexara-web

# 4. Verificar que las variables se cargaron
pm2 logs nexara-web
```

## Testing

### Verificar conexión API desde página pública:
```bash
# En el navegador, visita nexara.com.mx
# Abre DevTools → Console
# Deberías ver fetch requests a https://nexara.com.mx/api/news
```

### Verificar conexión API desde panel web:
```bash
# En el navegador, visita web.nexara.com.mx
# Entra a /noticias
# Crea una noticia → Debería hacer POST a https://nexara.com.mx/api/news
# Publica la noticia → Cambia status a PUBLISHED
```

### Verificar que se reflejan los cambios:
```bash
# 1. En web.nexara.com.mx/noticias → Crea y publica una noticia
# 2. En nexara.com.mx → Recarga la página
# 3. La nueva noticia debería aparecer en la página principal
```

## Troubleshooting

### Las páginas públicas no muestran contenido
- Verifica que `NEXT_PUBLIC_API_URL` esté configurada correctamente
- Revisa logs de Next.js: `pm2 logs nexara-web`
- Prueba el endpoint directamente: `curl https://nexara.com.mx/api/news`

### El panel no puede guardar cambios
- Verifica que el usuario tenga permisos (JWT token válido)
- Revisa CORS en `apps/api/src/main.ts`
- Revisa logs de la API: `pm2 logs nexara-api`

### Las imágenes no se muestran
- Verifica que nginx sirva `/uploads/` correctamente
- Las imágenes deben subirse vía la API y guardarse en `apps/api/uploads/`
- La API devuelve URLs relativas que el frontend convierte a absolutas

## Resumen

✅ **Ya está todo conectado**. Solo falta:
1. Copiar `.env.production` al servidor
2. Hacer rebuild con `npm run build`
3. Reiniciar con `pm2 restart nexara-web`

Los cambios en `web.nexara.com.mx` se reflejarán automáticamente en `nexara.com.mx` porque ambos leen/escriben de la misma base de datos a través de la API. 🎯
