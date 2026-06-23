# Access Control Module - HikCentral Integration

## 📋 Descripción

Este módulo integra **HikCentral Professional** (Hikvision) en la plataforma NEXARA, permitiendo:

- ✅ Ver todas las puertas/dispositivos conectados
- ✅ Obtener estado en tiempo real de puertas
- ✅ Abrir puertas remotamente
- ✅ Registrar y visualizar eventos de acceso
- ✅ Crear y gestionar reglas de acceso por empleado
- ✅ Generar reportes de acceso

---

## 🚀 Endpoints Disponibles

### Base URL
```
GET/POST http://localhost:3001/api/access-control
```

---

## 📡 Endpoints

### 1. Obtener Todas las Puertas
```http
GET /api/access-control/doors
```

**Respuesta:**
```json
[
  {
    "id": "1",
    "name": "Puerta Principal",
    "description": "DOOR_LOCK",
    "location": "Entrada",
    "isOnline": true,
    "status": "locked",
    "batteryLevel": 100,
    "deviceType": "DOOR_LOCK"
  },
  {
    "id": "2",
    "name": "Puerta Oficina",
    "description": "DOOR_LOCK",
    "location": "Piso 1",
    "isOnline": true,
    "status": "unlocked",
    "batteryLevel": 95,
    "deviceType": "DOOR_LOCK"
  }
]
```

---

### 2. Obtener Estado de una Puerta
```http
GET /api/access-control/doors/:id/status
```

**Parámetros:**
- `id` (string): ID de la puerta

**Respuesta:**
```json
{
  "id": "1",
  "status": "locked",
  "lastEvent": "Door Locked",
  "lastEventTime": "2026-05-21T15:30:00Z"
}
```

---

### 3. Desbloquear Puerta Remotamente
```http
POST /api/access-control/doors/:id/unlock
```

**Body:**
```json
{
  "doorId": "1",
  "reason": "Autorizado por Admin",
  "durationSeconds": 5
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Puerta 1 desbloqueada exitosamente"
}
```

---

### 4. Obtener Eventos de Acceso
```http
GET /api/access-control/events?doorId=1&limit=50&offset=0
```

**Parámetros Query:**
- `doorId` (optional): Filtrar por ID de puerta
- `employeeId` (optional): Filtrar por empleado
- `eventType` (optional): Tipo de evento (entry, exit, denied, etc)
- `startDate` (optional): Fecha inicio (ISO 8601)
- `endDate` (optional): Fecha fin (ISO 8601)
- `limit` (optional): Cantidad de registros (default: 50)
- `offset` (optional): Offset para paginación (default: 0)

**Respuesta:**
```json
[
  {
    "id": "EVENT001",
    "doorId": "1",
    "employeeId": "EMP123",
    "cardNumber": "12345678",
    "eventType": "entry",
    "status": "success",
    "timestamp": "2026-05-21T15:30:00Z",
    "notes": "Acceso normal"
  },
  {
    "id": "EVENT002",
    "doorId": "1",
    "employeeId": "EMP456",
    "cardNumber": "87654321",
    "eventType": "denied",
    "status": "denied",
    "timestamp": "2026-05-21T15:29:00Z",
    "notes": "Acceso fuera de horario"
  }
]
```

---

### 5. Crear Regla de Acceso
```http
POST /api/access-control/rules
```

**Body:**
```json
{
  "employeeId": "EMP123",
  "doorIds": ["1", "2"],
  "description": "Acceso a plantas 1 y 2",
  "isActive": true,
  "startDate": "2026-05-21T00:00:00Z",
  "endDate": "2026-12-31T23:59:59Z",
  "accessLevel": "intermediate",
  "allowedTimeSlots": [
    {
      "start": "08:00",
      "end": "18:00"
    }
  ]
}
```

**Respuesta:**
```json
{
  "accessRuleID": "RULE001",
  "cardNo": "EMP123",
  "doorNoList": [1, 2],
  "accessLevel": 1,
  "validFrom": "2026-05-21",
  "validTo": "2026-12-31",
  "timeScheduleID": "SCHEDULE001"
}
```

---

### 6. Eliminar Regla de Acceso
```http
DELETE /api/access-control/rules/:id
```

**Parámetros:**
- `id` (string): ID de la regla

**Respuesta:**
```json
{
  "success": true,
  "message": "Regla de acceso RULE001 eliminada"
}
```

---

### 7. Verificar Estado de Conexión
```http
GET /api/access-control/health
```

**Respuesta:**
```json
{
  "status": "connected",
  "connected": true,
  "config": {
    "baseUrl": "http://localhost:54483",
    "port": 54483
  }
}
```

---

## 🔐 Autenticación

Todos los endpoints requieren un **Bearer Token** en el header:

```http
Authorization: Bearer {your_jwt_token}
```

---

## 📝 Ejemplos de Uso (cURL)

### Obtener todas las puertas
```bash
curl -X GET "http://localhost:3001/api/access-control/doors" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Desbloquear puerta
```bash
curl -X POST "http://localhost:3001/api/access-control/doors/1/unlock" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Autorizado",
    "durationSeconds": 5
  }'
```

### Crear regla de acceso
```bash
curl -X POST "http://localhost:3001/api/access-control/rules" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "EMP123",
    "doorIds": ["1", "2"],
    "description": "Acceso a plantas 1 y 2",
    "isActive": true,
    "accessLevel": "intermediate"
  }'
```

### Obtener eventos con filtros
```bash
curl -X GET "http://localhost:3001/api/access-control/events?doorId=1&limit=10&eventType=entry" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🔧 Configuración de HikCentral

### Variables de Entorno Requeridas

```env
HIKVISION_URL=http://localhost:54483
HIKVISION_PORT=54483
HIKVISION_USERNAME=admin
HIKVISION_PASSWORD=your_password
HIKVISION_TIMEOUT=10000
```

### Ubicación del archivo .env
```
C:\Users\adpoz\OneDrive\Documentos\SOFTWARE\NEXARA-app\.env
```

---

## 📂 Estructura del Módulo

```
src/access-control/
├── access-control.controller.ts      # Endpoints REST
├── access-control.module.ts          # Módulo principal
├── dto/
│   ├── door.dto.ts                   # DTO para puertas
│   ├── access-event.dto.ts           # DTO para eventos
│   └── access-rule.dto.ts            # DTO para reglas
├── entities/
├── interfaces/
│   └── hikvision-api.interface.ts    # Interfaces de Hikvision
└── services/
    ├── hikvision-api.service.ts      # Comunicación con API
    └── access-control.service.ts     # Lógica de negocio
```

---

## 🐛 Troubleshooting

### No se puede conectar a HikCentral
- Verificar que HikCentral está corriendo: `http://localhost:54483`
- Validar credenciales en `.env`
- Revisar firewall y permisos

### Token expirado
- El servicio maneja automáticamente la renovación de tokens
- Si aún falla, verificar que `HIKVISION_TIMEOUT` es suficiente

### Error 401 Unauthorized
- Verificar `HIKVISION_USERNAME` y `HIKVISION_PASSWORD`
- Asegurarse de que el usuario tiene permisos de API en HikCentral

---

## 📚 Referencias

- [HikCentral Professional API Docs](http://localhost:54483/openapi)
- [NEXARA API Docs](http://localhost:3001/api/docs)

---

**Versión:** 1.0.0  
**Última Actualización:** 21/05/2026  
**Desarrollado para:** NEXARA Platform v2
