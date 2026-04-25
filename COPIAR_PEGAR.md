# 📺 INSTRUCCIONES PARA TERMINAL DE VS CODE

## 🎯 COPY-PASTE DIRECTO EN TU TERMINAL

Cuando el servidor responda a SSH, abre la terminal integrada de VS Code (Ctrl+` o View → Terminal) y copia-pega UNO de estos comandos:

---

## ⚡ OPCIÓN A: Comando Único (RECOMENDADO)

Copia esto:
```
ssh root@138.197.42.104 "cd /var/www/nexara-app && chmod +x deploy-recovery.sh && bash deploy-recovery.sh"
```

Pégalo en VS Code terminal y presiona Enter.

**Qué pasa:**
- ✅ Se conecta al servidor
- ✅ Ejecuta script de recuperación
- ✅ Muestra logs en tiempo real
- ✅ Verifica estado de servicios

**Tiempo:** ~5-10 minutos

---

## 📋 OPCIÓN B: Conectar y Luego Ejecutar

**Paso 1:** Pega esto (solo conecta):
```
ssh root@138.197.42.104
```

**Paso 2:** Una vez adentro, pega esto:
```
cd /var/www/nexara-app && chmod +x deploy-recovery.sh && bash deploy-recovery.sh
```

---

## 🔍 OPCIÓN C: Monitor en Tiempo Real (Mientras se ejecuta)

Abre 2 terminales en VS Code (Terminal → Split Terminal horizontalmente):

### Terminal 1 (Ejecución):
```
ssh root@138.197.42.104 "cd /var/www/nexara-app && bash deploy-recovery.sh"
```

### Terminal 2 (Monitor):
```
ssh root@138.197.42.104 "docker logs -f nexara-api --tail=50 | grep -E '(error|Error|ERROR|listening|ready)'"
```

Así ves los logs mientras se ejecuta.

---

## ✅ SEÑALES DE ÉXITO

Cuando veas esto en la terminal, está funcionando:

### ✓ Sin errores en los logs:
```
[Nest] 4/25/2026, 3:45:00 PM     LOG [NestFactory] Starting Nest application...
[Nest] 4/25/2026, 3:45:00 PM     LOG [InstanceLoader] PrismaModule dependencies initialized
[Nest] 4/25/2026, 3:45:01 PM     LOG [RouterExplorer] Mapped {/api/auth/login,...}
[Nest] 4/25/2026, 3:45:02 PM     LOG Application successfully started
```

### ✗ Error (si ves esto):
```
ENOTFOUND api
```
→ Reinicia web: `docker restart nexara-web`

---

## 🆘 SI ALGO FALLA

### Script cuelga en docker logs?
Presiona **Ctrl+C** para interrumpir y luego:
```
docker ps -a
```

### "Connection refused"?
El servidor aún no ha respondido. Espera más.

### "Credenciales inválidas" en login test?
```
curl http://localhost:3001/api/auth/debug/verify-user?email=gerencia@nexara.com.mx
```

Si retorna `"exists": false`:
```
docker exec -it nexara-api npm run prisma:seed
```

---

## 📊 VISTA RECOMENDADA EN VS CODE

```
┌──────────────────────────────────────────┐
│ Terminal Output                          │
├──────────────────────────────────────────┤
│  Terminal 1          │  Terminal 2       │
│  ─────────────────────────────────────── │
│  $ ssh root@...      │  $ docker logs... │
│  [script running]    │  [logs streaming] │
│  ✓ API up            │  [error messages] │
│  ✓ Web up            │  [real-time view] │
└──────────────────────────────────────────┘
```

---

## 📝 PASOS VISUALES

### 1️⃣ Abrir Terminal (Ctrl+`)
![Terminal integrada se abre abajo]

### 2️⃣ Copiar Comando
```
ssh root@138.197.42.104 "cd /var/www/nexara-app && bash deploy-recovery.sh"
```

### 3️⃣ Pegar en Terminal (Ctrl+V)
[Terminal muestra el comando]

### 4️⃣ Presionar Enter
[Script comienza a ejecutarse]

### 5️⃣ Esperar Resultados
- ⏳ 1-2 min: Docker reinicia
- ⏳ 3-5 min: Contenedores arrancan
- ⏳ 5-10 min: Tests ejecutan
- ✅ Verde = éxito

---

## 🎬 SECUENCIA DE SALIDA ESPERADA

```
╔════════════════════════════════════════════════════════════╗
║     NEXARA Server Recovery & Deployment Script            ║
║     Fixing console + API + login issues                   ║
╚════════════════════════════════════════════════════════════╝

✓ Detectado: Ejecutando en SERVIDOR

═══ FASE 1: Diagnóstico Inicial ═══

1. Verificando estado de contenedores...
nexara-api         Exited (1) 2 minutes ago
nexara-web         Exited (1) 2 minutes ago
nexara-db          Up 22 hours

═══ FASE 2: Preparación ═══

1. Matando procesos colgados...
✓ Procesos limpiados

2. Reiniciando docker daemon...
✓ Docker reiniciado

3. Actualizando código desde GitHub...
Already up to date.
✓ Código actualizado

═══ FASE 3: Reiniciando Contenedores ═══

1. Deteniendo contenedores viejos...
✓ Contenedores detenidos

2. Iniciando contenedores nuevos...
[+] Running 2/2
 ✔ nexara-web Started
 ✔ nexara-api Started
✓ Contenedores iniciados

3. Verificando estado...
NAMES         STATUS
nexara-api    Up 5 seconds
nexara-web    Up 3 seconds
nexara-db     Up 22 hours

═══ FASE 4: Diagnósticos ═══

1. Logs de API (últimas 10 líneas)...
[NestFactory] Starting Nest application
Application successfully started

2. Logs de Web (últimas 10 líneas)...
ready - started server on 0.0.0.0:3000

3. Verificando usuario en BD...
 id | nombre | email
----+--------+--------------------------------
  1 | Admin  | gerencia@nexara.com.mx

═══ FASE 5: Tests ═══

1. Test Debug Endpoint (verificar usuario)...
{
  "exists": true,
  "hasPasswordHash": true,
  "isSuperAdmin": true
}

✅ RECUPERACIÓN COMPLETADA
```

---

## 🚀 FINAL

```bash
# TODO EN UNA LÍNEA:
ssh root@138.197.42.104 "cd /var/www/nexara-app && bash deploy-recovery.sh"
```

Copia ↑ esto ↑ en tu terminal de VS Code y listo.
