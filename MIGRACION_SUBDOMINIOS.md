# Guía de Migración: De Subrutas a Subdominios

## Cambios Implementados

Tu aplicación Next.js ha sido configurada para funcionar con **subdominios** en lugar de subrutas. Esto significa:

### Antes (Sistema Anterior)
```
nexara.com.mx/panel/console/dashboard
nexara.com.mx/panel/ventas/cotizaciones
nexara.com.mx/panel/web/noticias
```

### Después (Sistema Nuevo)
```
consola.nexara.com.mx/dashboard
ventas.nexara.com.mx/cotizaciones
web.nexara.com.mx/noticias
```

## Archivos Configurados

### 1. **Middleware** (`middleware.ts`)
- Detecta automáticamente el subdominio desde la URL
- Mapea subdominios públicos a carpetas internas
- Funciona tanto en desarrollo como en producción

### 2. **Estructura de Carpetas**
Nueva estructura creada en `app/__subdomains/[slug]/`:
```
app/
└── __subdomains/
    └── [slug]/              # Dinámico: console, ventas, web, etc.
        ├── layout.tsx       # Layout principal con sidebar
        ├── page.tsx         # Página raíz (redirige a /dashboard)
        ├── (dashboard)/     # Grupo para dashboard
        │   ├── layout.tsx
        │   └── dashboard/
        │       └── page.tsx
        └── (auth)/          # Grupo para autenticación
            └── login/
                └── page.tsx
```

### 3. **Configuración** (`lib/subdomain-config.ts`)
Define qué subdominio corresponde a cada panel y su mapeo con la estructura antigua.

## Mapeo de Subdominios

| Subdominio | Dominio Público | Panel Original | 
|---|---|---|
| `console` | `consola.nexara.com.mx` | `/panel/console` |
| `ventas` | `ventas.nexara.com.mx` | `/panel/ventas` |
| `web` | `web.nexara.com.mx` | `/panel/web` |
| `contabilidad` | `contabilidad.nexara.com.mx` | `/panel/contabilidad` |
| `tickets` | `tickets.nexara.com.mx` | `/panel/tickets` |
| `ingenieros` | `ingenieros.nexara.com.mx` | `/panel/ingenieros` |
| `dashboard` | `dashboard.nexara.com.mx` | `/panel/dashboard` |

## Cómo Migrar Contenido

### Opción 1: Copiar Carpetas Completas (Recomendado)

1. **Copiar contenido de un panel existente**
   ```bash
   # Copiar panel/console a __subdomains/[slug]
   cp -r apps/web/app/panel/console/* apps/web/app/__subdomains/[slug]/(dashboard)/
   ```

2. **Actualizar imports y links**
   - Cambiar `/panel/console` → `/`
   - Cambiar `/panel/console/dashboard` → `/dashboard`
   - Los links relativos funcionarán automáticamente

3. **Ejemplo de migración:**
   ```tsx
   // ANTES (en panel/console/dashboard/page.tsx):
   <Link href="/panel/console/clients">Clientes</Link>

   // DESPUÉS (en __subdomains/[slug]/(dashboard)/clients/page.tsx):
   <Link href="/clients">Clientes</Link>
   ```

### Opción 2: Usar Componentes Compartidos

Si quieres reutilizar código, puedes:
1. Extraer componentes comunes a `components/`
2. Importarlos en ambas ubicaciones
3. Migrar gradualmente

## En Desarrollo

Para probar subdominios en **desarrollo local**, necesitas:

### En Windows (hosts file):
```
# C:\Windows\System32\drivers\etc\hosts
127.0.0.1 localhost
127.0.0.1 consola.localhost:3000
127.0.0.1 ventas.localhost:3000
127.0.0.1 web.localhost:3000
```

### O usar tu IP local:
```
192.168.1.100 consola.nexara.local
192.168.1.100 ventas.nexara.local
```

### Prueba rápida con curl:
```bash
curl -H "Host: consola.localhost:3000" http://localhost:3000/
```

## En Producción

### Configurar DNS

Necesitas agregar registros DNS wildcard en tu proveedor:

```dns
# En tu proveedor de DNS (DigitalOcean, Cloudflare, etc.)

consola.nexara.com.mx.    A    TU_IP
ventas.nexara.com.mx.     A    TU_IP
web.nexara.com.mx.        A    TU_IP
contabilidad.nexara.com.mx. A  TU_IP
tickets.nexara.com.mx.    A    TU_IP

# O usar wildcard (si lo permite):
*.nexara.com.mx.          A    TU_IP
```

### Configurar el Servidor Web

#### Si usas Nginx:
```nginx
server {
    listen 80;
    server_name ~^(?<subdomain>.+)\.nexara\.com\.mx$;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### Si usas Apache:
```apache
<VirtualHost *:80>
    ServerName consola.nexara.com.mx
    ServerAlias ventas.nexara.com.mx web.nexara.com.mx *.nexara.com.mx
    
    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
</VirtualHost>
```

### Certificados SSL

Necesitas un certificado wildcard o multi-dominio:
```bash
certbot certonly --manual \
  -d "*.nexara.com.mx" \
  -d "nexara.com.mx" \
  --preferred-challenges dns
```

## Próximos Pasos

1. **Migrar páginas:** Copia el contenido de `panel/console`, `panel/ventas`, etc. a `__subdomains/[slug]/`
2. **Actualizar links:** Busca y reemplaza rutas `/panel/tipo` → `/`
3. **Probar en desarrollo:** Modifica tu archivo hosts y accede a `consola.localhost:3000`
4. **Configurar DNS:** Agrega los registros en tu proveedor de DNS
5. **Implementar certificados:** Obtén un certificado wildcard para HTTPS
6. **Deploy:** Hacer push a producción

## Notas Importantes

- El **middleware** maneja automáticamente la reescritura de URLs
- Los **links internos** deben usar rutas relativas (sin `/panel/tipo`)
- El **layout dinámico** se adapta según el slug (subdominio)
- Puedes mantener la antigua estructura de `/panel` mientras migras
- Las **rutas antiguas** seguirán funcionando si no cambias nada

## Soporte para URLs Antiguas

Si quieres mantener las URLs antiguas (`/panel/console`) activas mientras migras:

1. Crear redirects en `next.config.js`:
```javascript
async redirects() {
  return [
    {
      source: '/panel/console/:path*',
      destination: '/console/:path*',
      permanent: false,
    },
  ];
}
```

2. O usa el middleware para servir ambas
