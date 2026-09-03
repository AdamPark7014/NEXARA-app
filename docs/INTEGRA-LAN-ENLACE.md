# NEXARA Integra · enlace servidor ↔ sitio del cliente

Cómo hacer que el servidor alcance una LAN de cliente con `provider=ISAPI`.
Complementa [INTEGRA-LAN](INTEGRA-LAN.md).

## Qué se rompe hoy sin enlace

No es solo el video. Un sitio ISAPI tiene **dos** funciones caídas:

| | Por qué falla |
|---|---|
| **Sync** | El cron de 15 min corre en el servidor, que no tiene ruta a `192.168.9.0/24`. Para un sitio ISAPI falla **siempre**. Hoy se suple a mano con `integra:isapi:sync` desde dentro. |
| **Video** | `nexara-go2rtc` corre en el servidor y no alcanza el RTSP de los equipos. `/stream` devuelve la URL y la nota «GO2RTC_URL no configurado». |

Un enlace bien puesto arregla las dos de una vez.

## Topología recomendada

WireGuard iniciado **desde el sitio**, más go2rtc **dentro del sitio**.

```
        SITIO DEL CLIENTE                          HETZNER
  ┌────────────────────────────┐            ┌──────────────────────┐
  │ 192.168.9.0/24             │            │ nexara-api           │
  │                            │            │ nexara-web           │
  │  NVR .34 ─ cámaras ─ ACS   │            │ traefik              │
  │            ▲               │            │                      │
  │            │ RTSP local    │            │  wg0 10.77.0.1/24    │
  │      ┌─────┴────────┐      │  WireGuard │        ▲             │
  │      │ caja on-site │──────┼────────────┼────────┘             │
  │      │  · wg client │ :51820 (saliente) │                      │
  │      │  · go2rtc    │      │            │                      │
  │      └──────────────┘      │            └──────────────────────┘
  │        10.77.0.2           │
  └────────────────────────────┘
```

**Por qué el túnel lo abre el sitio y no el servidor.** El router es del cliente
(un DS-3WR15X que probablemente no administras), y muchos enlaces mexicanos van
detrás de CGNAT: no hay IP pública estable ni forma de abrir un puerto entrante.
Saliente al `:51820` del servidor funciona sin tocar el router.

**Por qué go2rtc queda en el sitio y no en el servidor.** Si estuviera allá,
cada canal que alguien mira arrastra el RTSP crudo por el túnel. Con go2rtc
local, el RTSP no sale de la LAN: por el túnel viaja solo el stream ya remuxado
del canal que se está viendo. Y si el visor negocia WebRTC, ni eso.

## Alta automática (lo que se usa en la práctica)

Lo que sigue en «Configuración» es el montaje **a mano**, útil para entender qué
hace cada pieza. Para operar hay una vía automática — [ADR-0021](ADR-0021-integra-edge-enrolamiento.md):

```bash
sudo bash deploy/edge/server-setup.sh
```

```bash
sudo bash deploy/edge/wg-reconcile.sh --install <token-que-imprime>
```

Y por cada sitio, emitir el token en la consola y correr en la caja:

```bash
curl -fsSL https://integra.nexara.com.mx/api/integra/edge/install.sh | sudo bash -s -- <token>
```

La caja genera sus claves —la privada nunca sale de ahí—, se registra, recibe su
`10.77.0.x` y arranca sola con go2rtc y el latido. **Nadie edita `wg0.conf`**, y
dar de alta un sitio no reinicia la interfaz ni interrumpe a los que ya estaban.

## Configuración

### Servidor (Hetzner · 5.78.215.109, SSH en el 2222)

Estado comprobado el 31-08-2026: **WireGuard no está instalado**. El kernel
(6.8) ya trae el módulo, así que solo faltan las herramientas.

El servidor **no tiene firewall de host** — `ufw` inactivo y la política de
`iptables INPUT` en `ACCEPT`. Para el enlace eso significa que no hay que abrir
nada: el `51820/udp` quedará accesible en cuanto WireGuard escuche. Dicho de
otro modo, lo que protege esa máquina hoy es que nada más escuche. Con 28
contenedores de producción encima, merece una revisión aparte.

```bash
apt install wireguard
wg genkey | tee /etc/wireguard/server.key | wg pubkey > /etc/wireguard/server.pub
```

`/etc/wireguard/wg0.conf`:

```ini
[Interface]
Address    = 10.77.0.1/24
ListenPort = 51820
PrivateKey = <server.key>

# Un peer por sitio. AllowedIPs = la IP del peer + la LAN que enruta.
[Peer]
# sitio-oficinas
PublicKey  = <clave pública de la caja on-site>
AllowedIPs = 10.77.0.2/32, 192.168.9.0/24
```

```bash
systemctl enable --now wg-quick@wg0
```

En el **firewall de Hetzner** hay que abrir `51820/udp` entrante. Es el único
puerto nuevo, y es UDP: no responde a escaneos TCP.

### Caja on-site

```ini
[Interface]
Address    = 10.77.0.2/32
PrivateKey = <clave privada de la caja>

[Peer]
PublicKey           = <server.pub>
Endpoint            = 5.78.215.109:51820
AllowedIPs          = 10.77.0.0/24
# Imprescindible detrás de NAT: mantiene viva la traducción del router.
PersistentKeepalive = 25
```

Y activar reenvío, para que el servidor llegue a las cámaras a través de ella:

```bash
sysctl -w net.ipv4.ip_forward=1
iptables -t nat -A POSTROUTING -s 10.77.0.0/24 -o <iface-lan> -j MASQUERADE
```

El `MASQUERADE` evita tener que meter una ruta de vuelta hacia `10.77.0.0/24`
en el router del cliente: las cámaras ven las peticiones como si vinieran de la
caja, que ya es su vecina.

### NEXARA

En `deploy/.env.nexara`, apuntar el media gateway al go2rtc del sitio:

```bash
GO2RTC_URL=http://10.77.0.2:1984
```

Y quitar `go2rtc` del `docker-compose.nexara.yml` **solo si** todos los sitios
son ISAPI. Mientras haya sitios Artemis, el del servidor sigue haciendo falta:
esos sí entregan RTSP alcanzable desde allá.

Con eso, `POST /api/integra/sync` y el cron de 15 min empiezan a funcionar para
sitios ISAPI, y `integra:isapi:sync` deja de ser obligatorio.

**Si se enruta solo el `/32`** (la opción recomendada más abajo), el servidor no
llega a las cámaras y el sync tiene que correr en la caja. Entonces la caja
necesita la base, y la vía limpia es publicar Postgres **solo en el túnel**:

```yaml
# deploy/docker-compose.nexara.yml
  db:
    ports:
      - "10.77.0.1:5432:5432"   # solo la IP de wg0, nunca 0.0.0.0
```

Así la base es alcanzable desde los peers de WireGuard y desde nadie más — que
es justo lo que hace falta, y menos superficie que abrir la LAN entera.

## La trampa que muerde en el sitio número tres

**Las LAN de los clientes se van a repetir.** `192.168.1.0/24` y `192.168.0.0/24`
son el default de medio México, y en cuanto dos sitios compartan rango, el
`AllowedIPs` del servidor deja de poder decidir a qué peer enrutar.

Hay que decidirlo **antes** del segundo sitio, no después:

- **Lo barato:** exigir un rango distinto por sitio y anotarlo. Frágil — depende
  de que nadie se equivoque, y el rango a veces no es negociable.
- **Lo correcto:** que el servidor **nunca** hable con la LAN del cliente. Solo
  con la IP WireGuard de la caja on-site (`10.77.0.x`, única por sitio), y que
  esa caja sea la que llega a los equipos. Es decir: `AllowedIPs = 10.77.0.2/32`,
  sin la LAN.

La segunda encaja sola con la arquitectura de arriba: si go2rtc vive en el sitio
y el sync también, el servidor no necesita ver `192.168.9.x` para nada. El único
motivo para enrutar la LAN entera es que el cron del servidor haga el sync — y
eso se resuelve mejor con un agente en la caja que dispare `integra:isapi:sync`
contra la base por el túnel.

**Recomendación:** enrutar solo `/32` desde el principio y poner el sync en la
caja. Cuesta lo mismo hoy y evita una migración con clientes encima.

## Alternativa: Tailscale

Misma idea, sin administrar claves ni abrir puertos: la caja y el servidor se
unen a una tailnet y se ven por su IP `100.x`. Trae NAT traversal, ACLs por
dispositivo y rotación de claves resuelta.

A favor: se monta en minutos y sobrevive a cambios de ISP del cliente.
En contra: depende de un coordinador de terceros. Con `--advertise-routes` tiene
el **mismo** problema de rangos repetidos, así que la recomendación no cambia:
que el servidor hable con la caja, no con la LAN.

Si el volumen de sitios crece, Headscale (coordinador propio) da lo mismo sin el
tercero.

## Qué caja poner en el sitio

La caja hace dos cosas: cerrar el túnel y correr go2rtc. La segunda es la que
manda en el dimensionado, y depende de un detalle de las cámaras.

**Las DS-2CD2123G2 publican tres streams por canal:**

| Stream | Códec | Resolución | Sirve para |
|---|---|---|---|
| 1 principal | H.265 | 1920×1080 | vista a pantalla completa |
| 2 sub | H.265 | 640×360 | — |
| 4 tercero | **H.264** | 704×576 | **mosaico, sin transcodificar** |

Esto importa porque **H.265 no se reproduce bien en navegador**: Safari sí,
Chrome solo con decodificación por hardware y según plataforma. El tercer stream
es H.264, así que un mosaico de 13 cámaras se sirve **en crudo, sin gastar CPU**.
El transcodificado solo hace falta al abrir una cámara a 1080p.

| Opción | ~MXN | Túnel | go2rtc | H.265→H.264 |
|---|---|---|---|---|
| **Mini PC Intel N100** (Beelink S12 Pro, Minisforum UN100) | 3,000–4,500 | sí | sí | **sí, por QuickSync** |
| Raspberry Pi 5 8 GB + SSD | 3,500–4,500 | sí | sí | por software: se ahoga |
| Router con WireGuard (GL.iNet Flint 2, Mikrotik hAP ax3) | 1,500–3,500 | sí | **no** | no |

**Recomendación: mini PC con Intel N100.**

- El QuickSync del N100 transcodifica varios 1080p H.265 a H.264 casi gratis.
  Es la única de las tres que cubre el caso completo.
- Es x86: corre las mismas imágenes Docker que el servidor, sin variantes ARM.
- Sale más barato que una Pi 5 con almacenamiento decente, y sin tarjeta SD, que
  es la pieza que se muere en un equipo que no se apaga nunca.
- Sobra potencia para el `integra:isapi:sync` por cron.

Un router con WireGuard resuelve **solo** el túnel. Sería suficiente si go2rtc se
quedara en el servidor, pero eso devuelve el RTSP crudo al enlace WAN — que es
justo lo que la topología evita.

> Nota de catálogo: los gateways Ruijie que distribuye SYSCOM hacen IPsec/L2TP y
> valdrían para el túnel, pero no hospedan go2rtc. Una sola caja x86 sale más
> simple que dos equipos.

## Qué hace falta antes de montarlo

1. **La caja del sitio** (ver arriba). Hoy no existe: durante las pruebas el peer
   fue la laptop, que se va cuando se va Adam.
2. **`apt install wireguard` en el servidor.** No está puesto.
3. **Decidir `/32` vs. LAN completa** (ver arriba). Es la única decisión que
   cuesta cara si se toma tarde.
4. **Dar de alta el sitio en la base de producción.** El `IntegraSite` de las
   pruebas vive en la base local de la laptop, no allá.

## Mientras tanto

Sin enlace, todo funciona **desde dentro de la LAN**:

```bash
npm run integra:isapi:sync    -- --company 1 --site 1
npm run integra:isapi:publish -- --company 1 --site 1 --go2rtc http://127.0.0.1:1984
```

go2rtc sirve el muro de cámaras en `http://<ip-de-la-máquina>:1984`, visible
desde cualquier navegador de la red del cliente.
