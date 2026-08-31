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

## Configuración

### Servidor (Hetzner)

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

## Qué hace falta antes de montarlo

1. **Una caja siempre encendida en el sitio.** Un mini PC o una Raspberry Pi
   basta: solo corre WireGuard y go2rtc. Hoy no existe — durante las pruebas el
   peer fue la laptop, que se va cuando se va Adam.
2. **Acceso SSH al servidor desde donde se vaya a configurar.** `~/.ssh/config`
   tiene `HostName REEMPLAZA_CON_IP_HETZNER`, o sea que la entrada nunca se
   completó. El servidor resuelve por DNS a `5.78.215.109`.
3. **Decidir `/32` vs. LAN completa** (ver arriba). Es la única decisión que
   cuesta cara si se toma tarde.

## Mientras tanto

Sin enlace, todo funciona **desde dentro de la LAN**:

```bash
npm run integra:isapi:sync    -- --company 1 --site 1
npm run integra:isapi:publish -- --company 1 --site 1 --go2rtc http://127.0.0.1:1984
```

go2rtc sirve el muro de cámaras en `http://<ip-de-la-máquina>:1984`, visible
desde cualquier navegador de la red del cliente.
