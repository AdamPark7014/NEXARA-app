# Diseñador de videovigilancia (NEXARA Core)

Módulo de Core para diseñar un sistema de CCTV sobre el plano del sitio y sacar la propuesta para el cliente.
Funciona así: se sube el croquis, se convierte en muros y puertas con escala real, se colocan cámaras del
catálogo con su óptica y se ven los conos DORI recortados por los muros, en 2D y en 3D, junto con lo que ve
cada cámara. Al final sale un PDF con ficha por cámara, infraestructura y lista de equipo.

Pedido de Adam (29-10-2026), a partir de la propuesta «Proyecto CCTV Bodegas VDM» que David Morales armó con el
diseñador de SYSCOM: «parametrice un sistema que me genere todo esto y lo puedan generar los encargados de
área… incluyendo el arquitecto. Los únicos que no son los de soporte y los instaladores». Los encargados de
instalación y de soporte sí entran.

Estado: **fase 1 hecha** (motor de cálculo con pruebas, `apps/web/lib/cctv/`). Las pantallas esperan el visto
bueno de Adam sobre el mockup (§10).

---

## 1. Cómo funciona el diseñador de SYSCOM (ingeniería inversa)

Fuentes:
- la propuesta en PDF (31 páginas);
- la vista pública de solo lectura del proyecto
  (`/calculadoras/disenador_de_videovigilancia/<id>`, sin sesión);
- sus paquetes de JavaScript públicos.

No se creó cuenta, no se inició sesión ni se guardó nada. Editar exige ser cliente de SYSCOM.

### 1.1 Flujo

1. **Modo mapa o croquis.** El proyecto abre sobre Google Maps satelital, con un buscador de ubicación. Al
   subir un croquis (JPG, PNG o PDF) pasa a modo croquis.
2. **Croquis.** La imagen se guarda (`/api/cctv/croquis?key=…png`) y se coloca con un ancho supuesto de 60 m.
   En ese momento se manda sola a `POST /api/cctv/detectar-plano` (multipart `file`).
3. **Detección con IA.** El servidor llama a un proveedor externo; sus errores traen «Proveedor: HTTP …». Lo
   que regresa es `construccion`: muros y aberturas.
   - Mientras detecta, el usuario puede seguir editando. Si editó algo, se queda su versión («Conservamos tus
     ediciones»).
   - Si falla: «Puedes dibujarla manualmente».
4. **Calibrar escala.** Se marcan dos puntos de una distancia conocida y se escribe la medida. Con eso
   `croquis.calibrado = true`. Hay también «Ver satélite / Ver croquis» y ajustes de ancho y opacidad.
5. **Edición.** Se pueden agregar, borrar o mover muros. Cada muro lleva `alturaM`, `grosorM` y `vidrio`.
   Las aberturas son `puerta | ventana | acceso`, con hojas, bisagra, sentido, si está abierta, si es
   transparente, y su base y altura.
6. **Cámaras del catálogo.** `GET /api/cctv/camaras?q&tecnologia&form_factor&tipo_lente&mp_min&ir_min&limit=30`
   devuelve productos de SYSCOM con atributos ópticos (`resolucion_mp`, `px_horiz`, `px_vert`, `focal_min_mm`,
   `focal_max_mm`, `hfov_min_deg`, `hfov_max_deg`, `sensor_formato`, `sensor_ancho_mm`, `ir_distancia_m`,
   `lentes[]`, `num_lentes`) y precio. En el plano, la cámara se arrastra por el cuerpo, se apunta por la
   punta y se abre o cierra por el borde (solo varifocal o PTZ).
7. **Humanoides.** Son el robot G1 de Unitree (licencia BSD-3). Se arrastran, y cada cámara muestra un
   recuadro con «134 PPM · Reconocimiento · persona a 10 m», zoom digital de 1× a 8× y «Ampliar».
8. **Infraestructura.**
   - Gabinetes: se validan PoE, canales, TB, Mbps, 12 Vcc y unidades de rack.
   - Cables: ruta con vértices, «va en tubería», `× holgura 1.2 + 6 m loop`, aviso arriba de 90 m y error
     arriba de 100 m de UTP.
   - Enlaces y grabación: retención de 1 a 90 días, H.264 o H.265, % de actividad.
9. **Salidas.** PNG, CSV con precios, «Reporte» (la página que David imprimió a PDF), unidades métricas
   (m · PPM) o imperiales (ft · PPF) y liga para compartir.

### 1.2 Modelo de datos (tal como viene en la página)

```jsonc
{
  "proyecto": {
    "nombre": "Proyecto CCTV Bodegas VDM", "modo": "croquis", "zoom": 20,
    "centro": { "lat": 24.789, "lng": -107.397 },
    "croquis": { "url": "/api/cctv/croquis?key=…png", "calibrado": true, "opacidad": 1,
                 "bounds": { "north": …, "south": …, "east": …, "west": … } },
    "construccion": {
      "version": 1,
      "paredes":   [{ "id": "p1", "a": { "u": 0.063, "v": 0.155 }, "b": { "u": 0.063, "v": 0.86 },
                      "alturaM": 5, "grosorM": 0.15, "vidrio": false }],          // u,v = fracción del croquis
      "aberturas": [{ "id": "a1", "paredId": "p7", "tipo": "puerta", "desde": 0.013, "hasta": 0.213,
                      "baseM": 0, "alturaM": 2.1, "hojas": 1, "bisagra": "inicio", "sentido": 1,
                      "abierta": true, "transparente": false }]
    },
    "camaras": [{ "id": "…", "nombre": "Domo 2 Z ALM", "modeloLabel": "HIKVISION DS-2CD1143G2-LIUF",
                  "productoId": 221944, "precio1": 142.38, "tecnologia": "ip", "esPtz": false,
                  "pos": { "lat": …, "lng": … }, "headingDeg": 132.2, "distanciaM": 13.757,
                  "alturaM": 5, "tiltDeg": 39,
                  "lentes": [{ "headingOffsetDeg": 0, "optica": {
                      "mp": 4, "pxHoriz": 2560, "pxVert": 1440, "focalMm": 2.8, "focalMinMm": 2.8,
                      "focalMaxMm": 2.8, "sensorFormato": "1/3", "sensorAnchoMm": 4.8,
                      "hfovDeclaradoDeg": null, "irM": 30 } }] }],
    "personas":  [{ "id": "per-…", "pos": { "lat": …, "lng": … }, "headingDeg": 180 }],
    "gabinetes": [], "cables": [], "enlaces": [],
    "infra": { "slackFactor": 1.2, "serviceLoopM": 6, "retencionDias": 30, "codec": "h265", "actividadPct": 100 },
    "unidades": { "longitud": "m", "densidad": "ppm" }
  },
  "readOnly": true, "ajeno": false
}
```

- Posiciones en lat/lng (con o sin croquis) y muros en coordenadas relativas del croquis (`u`, `v`).
- `distanciaM` es el **largo del cono** que fija el usuario. No sale de la óptica: los domos de 5 m y el de
  2.2 m tienen el mismo 13.757 m.
- Las balas sin sensor conocido (DS-2CFW06-P y DS-2CD1T47G3) **no tienen altura ni inclinación**. Por eso su
  ficha no trae «Montaje» ni «Zona ciega» y su PPM se calcula plana. Sin altura, SYSCOM supone 3 m («Altura
  estimada (3 m): actívala en el panel para afinar»).
- La liga pública expone el proyecto completo, **precios incluidos**. Las ligas de Core no deben hacer eso
  (§9).

### 1.3 Render

- Plano 2D sobre Google Maps (capas propias en SVG).
- 3D con three.js:
  - muros extruidos;
  - el croquis como textura del piso, por eso se ven los letreros «Oficina Principal…» en el suelo;
  - los conos proyectados al piso;
  - el robot G1 con un anillo azul;
  - vistas «Isométrica» y «Vista superior»;
  - arrastrar mueve la vista, Ctrl + arrastrar gira, la rueda hace zoom y «F» enfoca.
- **La «referencia de detalle al final del cono» es una foto real precalculada** por escalón de PPM y escena:
  - archivos `/calculadoras/cctv/ppm/{30|50|80|100|150|200|300|400|500|600}/{dia|noche_ir|noche_color|interior}.jpg`
    y `ppm2/{exterior_dia|noche_sin_luz|…}`;
  - escalones: `<40→30, <65→50, <90→80, <125→100, <175→150, <250→200, <350→300, <450→400, <550→500, si no 600`.

---

## 2. Fórmulas (verificadas contra la propuesta de David)

Implementadas en `apps/web/lib/cctv/optica.ts`; pruebas en `optica.spec.ts` con las cifras del PDF.

| Cálculo | Fórmula | Comprobación (Bodegas VDM) |
|---|---|---|
| Ancho de sensor | Tabla por formato: 1/3" = 4.8 mm, 1/2.8" = 5.1, 1/2.7" = 5.4, 1/1.8" = 7.1… | SYSCOM guarda 4.8 para 1/3" |
| Ángulo horizontal | `HFOV = 2·atan(ancho / (2·focal))`; el declarado manda; tope 149° | 2.8 mm → 81°, 2.9 mm → 79°, CFW06 (6 mm) → 94°, 1T47G3 (8.6 mm, 4 mm) → 94° |
| Ángulo vertical | `VFOV = 2·atan(ancho·(px_v/px_h) / (2·focal))` | 2.8 mm 16:9 → 51.5° |
| Ancho de escena | `W(d) = 2·d·tan(HFOV/2)`; si HFOV ≥ 150°, `W = d·HFOV(rad)` (panorámica) | |
| Densidad | `PPM = px_horizontales / W(d)` | 13.757 m → **109 PPM**; 13.94 m (2.9 mm) → 111; 11.71 m → 102; 11.46 m → 104 |
| Alcance por nivel | `d = px_h / (umbral · W(1))` | 2.8 mm: identificación **6 m**, reconocimiento **11.9 m**; 2.9 mm: 6.2 / 12.4; 1T47G3: 4.8 / 9.5 |
| DORI (IEC 62676-4) | Identificación 250 · Reconocimiento 125 · Observación **62.5** · Detección 25 px/m | SYSCOM usa 62 para observación |
| Zona ciega | `h / tan(incl + VFOV/2)` | 5 m · 39° → **2.4 m**; 2.2 m · 32° (2.9 mm) → 1.4; 2.2 · 34° → 1.3; 2.2 · 11° → 3 m |
| Fin del piso | `h / tan(incl − VFOV/2)` (∞ si el borde superior pasa del horizonte) | |
| Inclinación propuesta | `atan2(h − h_obj, d)` (centro del cuadro sobre el punto) | lo que hace SYSCOM si no hay inclinación |
| PPM de la persona | `d_visual = hypot(d_piso, h_cam − 0.85)` y `PPM(d_visual)` | 10.3 m a 5 m → **134 PPM**; 9 m → 151; 3.3 m a 2.2 m (2.9 mm) → 434 |

### 2.1 Una corrección a SYSCOM (decisión de diseño)

SYSCOM tiende en el piso la distancia **de la visual** para los anillos: con la cámara a 5 m, la ficha dice
«Identificación hasta 6 m» medido desde el poste. Pero una persona a 6 m del poste está a 7.3 m de la lente,
y ahí no hay 250 PPM.

Core mide los anillos en el piso con la altura descontada: `d_piso = √(d_visual² − (h − 0.85)²)`. A 5 m,
identificación llega a **4.3 m** y reconocimiento a 11.2 m. Es la cifra que la cuadrilla puede cumplir en sitio.

La ficha muestra las dos lecturas (`alcances` y `alcancesVisual`) para que David pueda compararlas con
SYSCOM. Por lo mismo, la PPM al final del cono se calcula con la visual (104 PPM, no 109).

### 2.2 Visibilidad y oclusión

En `visibilidad.ts`; es la misma prueba que usa SYSCOM.

- **Marco de cámara.** Sean `l` el avance en planta, `u` el lateral y `dz = h_obj − h_cam`. Entonces:
  - `adelante = l·cos(incl) − dz·sin(incl)`;
  - `arriba = l·sin(incl) + dz·cos(incl)`;
  - está en cuadro si `adelante > 0`, `|u| ≤ adelante·tan(HFOV/2)` y `|arriba| ≤ adelante·tan(VFOV/2)`;
  - en panorámicas se comparan ángulos en lugar de tangentes.
- **Lo que tapa.** Cada muro se parte en tramos por sus aberturas:
  - el antepecho y el dintel siguen tapando;
  - la hoja de una puerta abierta gira 90° sobre la bisagra; cerrada, tapa el hueco;
  - la ventana opaca tapa y la transparente no;
  - los muros de vidrio o reja no tapan;
  - los obstáculos (columnas, anaqueles, racks) tapan con sus costados hasta su altura.
- **Oclusión.** La visual lente → objetivo se corta con cada tramo en planta. Si a esa distancia su altura cae
  entre la base y el tope del tramo, está tapado. Se ignoran los primeros 30 cm: es el muro donde va
  atornillada la cámara.
- **Cobertura recortada.**
  - Abanico de rayos (uno cada 2° como mucho) con 64 muestras por rayo, a la altura de la cabeza (1.5 m).
  - Los bordes de cada tramo visible se afinan por bisección y se cortan por los radios DORI.
  - Los rayos vecinos se cosen en polígonos por nivel.
- **Humanoide.** Se prueban cuatro alturas (0.15, 0.65, 1.15 y 1.65 m) → «Visible», «Parcialmente visible»,
  «Oculta por un muro» o «Fuera de cuadro». A cada cámara le toca la persona más cercana dentro de su ángulo;
  si no hay, el punto al 60 % del cono.
- **Mapa de calor.** `mejorNivelEn` y `repartoDeArea` dan el mejor nivel por celda de 0.5 m. Con eso sale el
  «% del área con reconocimiento o mejor», que SYSCOM no da.

### 2.3 Infraestructura

En `infraestructura.ts`.

- **Flujo por cámara.** Tabla de H.264 a 15 fps: 1 MP = 2 Mbps, 2 MP = 4, 4 MP = 6, 8 MP = 12, 12 MP = 16.
  H.265 vale × 0.5 y H.265+ × 0.3.
- **Almacenamiento.** `TB = Σ Mbps · 86 400 · días · actividad / 8 / 10⁶`. Bodegas VDM (14 × 4 MP, H.265,
  30 días) da 42 Mbps, 13.6 TB y 2 discos de 8 TB.
- **Discos.** Se cuenta una capacidad útil del 93 %.
- **NVR.** Canales comerciales: 4, 8, 16, 32, 64 o 128.
- **PoE.** Clase af ≤ 12.95 W, at ≤ 25.5 W, bt ≤ 71.3 W. El presupuesto del switch lleva 20 % de margen.
- **Cable.** `(ruta + bajadas) × 1.2 + 6 m de loop`. Aviso arriba de 90 m, error arriba de 100 m (TIA-568).
  Se surte en bobinas de 305 m.

---

## 3. De croquis a plano vectorial

La geometría se guarda **en píxeles del croquis**, y `escala.metrosPorPx` la pasa a metros (`plano.ts`).
Recalibrar mueve todo junto y los muros siguen encima de sus trazos. Sin croquis, el lienzo usa 50 px por metro.

1. **Subir.** Se aceptan JPG, PNG y PDF.
   - Un PDF se rasteriza en el navegador con `pdfjs-dist` (ya está en la web) a unos 3000 px de ancho, para que
     sirva de fondo.
   - Se guarda en `uploads/cctv-croquis/` con la misma mecánica que `cotizaciones.service.ts › agregarPlano`.
2. **Calibrar con una cota** (`calibrar(a, b, metros)`). Se marcan los extremos de una cota conocida (en el
   croquis de VDM, 43.00 m) y se escribe la medida.
   - Se puede repetir; queda guardada la cota usada.
   - Mientras no se calibre, el editor muestra «Sin calibrar: las distancias son aproximadas».
3. **Detección automática.** Tiene dos caminos y conviene empezar por el que no cuesta.
   - **PDF vectorial** (los que exporta AutoCAD, como el de VDM). Las líneas ya vienen como trazos.
     `pdfjs.getOperatorList()` da los segmentos `moveTo/lineTo/re` y los textos con su posición. De ahí:
     - las líneas largas, gruesas y ortogonales se proponen como muros;
     - los cuadritos repetidos sobre los ejes, como columnas;
     - los textos numéricos junto a líneas de cota (`43.00`, `20.00`), como **calibración automática**;
     - los textos de área (`Recepcion de vehiculos`), como etiquetas.

     No usa IA, cuesta $0 y es exacto.
   - **Imagen o foto de croquis a mano.** Va por la **puerta única de IA** (`ia.zynoratek.com`, ver
     `C:\dev\scripts\ai-os\IA-CLAUDE.md`) con visión.
     - Se pide salida estructurada en píxeles de la imagen: `muros[{a,b}]`, `aberturas[{muro, desde, hasta,
       tipo}]`, `etiquetas[{texto,pos}]` y `cotas[{a,b,texto}]`.
     - Modelo: `claude-haiku-5-5` con esfuerzo `low` si pasa el eval. Si no, `claude-sonnet-5-5`.
     - El eval son 10 croquis (VDM más planos de obras de NEXARA) con muros marcados a mano. Métricas:
       cobertura de longitud de muro ≥ 90 % y error de extremo ≤ 2 % del ancho.
     - La llamada sale del backend (API Nest), nunca del navegador.

   En los dos caminos el resultado es una **propuesta**: se pinta encima en otro color y el usuario la acepta
   completa o por elemento. Si ya editó a mano, no se le pisa.
4. **Edición manual.**
   - **Herramientas:** muro (clic-clic, con imán a extremos y a 0°/90°/45°), puerta, ventana, acceso,
     obstáculo (rectángulo o polígono con altura), etiqueta y cota.
   - **Selección múltiple** para cambiar altura y grosor en lote («todos los muros perimetrales a 5 m,
     divisorias a 2.8 m»).
   - Deshacer y rehacer.
   - **Validación** (`problemasDelPlano`): aberturas encimadas o fuera de su muro, muros sin largo y cámaras
     repetidas.

## 4. Modelo 3D

- **Librería:** `three` (MIT) más `@types/three`.
  - Se carga con `next/dynamic` (`ssr: false`) solo en la ruta del diseñador; no pesa en el resto de Core.
  - No necesita `eval` ni workers `blob:`, así que pasa la CSP actual.
- **Escena.**
  - Piso con el croquis como textura (escala real).
  - Cada `Tapa` (`tapasDelPlano`) es una caja extruida con su grosor, de su base a su tope. Así salen los
    huecos de puertas y ventanas con dintel y antepecho, las hojas de puerta (en un tono madera) y los vidrios
    translúcidos.
  - Cámaras: domo, bala o PTZ simplificados a su altura real, en muro o poste.
  - Los polígonos DORI de `coberturaCamara` se pintan como calcas sobre el piso (verde, azul, ámbar y gris)
    con 35 % de opacidad.
- **Humanoide propio:** maniquí de 1.70 m hecho de cápsulas, con anillo y etiqueta. No se reutiliza el G1 ni
  ningún recurso de SYSCOM.
- **Controles:** orbitar, mover y zoom (`OrbitControls`); «Isométrica», «Vista superior» y «F» para enfocar
  la selección. Las cotas y las etiquetas de área se pintan como texto sobre el plano.

## 5. Vista desde cada cámara

- **Cámara de three.js.** Una `PerspectiveCamera` con `fov = VFOV` y `aspect = px_h / px_v`, puesta en la
  posición y altura de montaje, con rumbo y luego inclinación. Para panorámicas y ojos de pez se usa un render
  cúbico proyectado.
- **Recuadro flotante en el editor:** «134 PPM · Reconocimiento · persona a 10 m», con zoom digital 1–8×,
  «Ampliar» y «Recentrar persona». La etiqueta va pegada al humanoide (`proyectar`).
- **En el PDF:** cada vista se renderiza fuera de pantalla a 1600 × 900 y se sube como PNG con la propuesta.
- **«Referencia de detalle al final del cono».** No se copian las fotos de SYSCOM. Se genera la imagen:
  - una lámina de referencia propia (persona de cuerpo entero y una placa de prueba) fotografiada a una
    escala conocida de px/m se reduce a la PPM calculada y se vuelve a ampliar sin suavizado;
  - así se ve exactamente el pixelado de esa densidad;
  - mientras NEXARA no tome su foto de referencia, se usa una lámina sintética: silueta, carta de resolución y
    placa «NXR-123-A».

## 6. Catálogo de cámaras

Lo que hay hoy en el repo:
- `ProductCT` (CT Internacional) trae marca, precio y existencia, pero casi nada de óptica. En el feed hay 369
  artículos de videovigilancia y las especificaciones son escasas: no hay focal.
- SYSCOM aparece en `smart-quote/pricing` como «próximamente», sin cliente. El conector que existe está en
  `CONDUIT-app/packages/commerce-core/src/connectors/syscom.ts`.
- La skill `hikvision-api` cubre APIs de dispositivos y plataformas (HCT, ISAPI), no fichas de producto.

Hace falta un catálogo óptico propio y curado:

- **Tabla `CctvModeloCamara`.**
  - Identidad y comercio: `marca`, `modelo`, `claveSyscom`, `claveCt`, `productId?` (enlace a `Product`).
  - Forma: `tipo` (domo, bala, turret, ptz, panorámica, ojo de pez, multisensor).
  - Óptica: `lentes Json` (focal mín./máx., formato, ancho de sensor, HFOV y VFOV declarados, desfase),
    `pxHoriz`, `pxVert`, `irM`, `luzBlancaM`, `wdrDb`.
  - Energía y protección: `poeW`, `clasePoe`, `ip`, `ik`.
  - Para la ficha: `caracteristicas[]` y `foto`.
  - Control: `fuente` (manual, syscom, ct o ficha-ia), `verificadoPor` y `verificadoEn`.
- **Llenado.**
  1. Semilla con los modelos que NEXARA instala, empezando por los tres de VDM y los 2CD1043/2143/2347/2387,
     ColorVu y PTZ de catálogo Hikvision. Cada dato sale de la ficha técnica del fabricante y se marca como
     verificado.
  2. «Leer ficha»: se sube el PDF de datasheet y la IA (puerta única, Haiku) extrae los campos. Un encargado
     los confirma antes de usarlos.
  3. Precio y existencia vienen de CT (`productos_ct`) y, cuando haya cliente SYSCOM, de su API.
- **Respaldo de la óptica:** si una ficha no trae ancho de sensor, se usa el formato. Si tampoco lo trae, el
  HFOV declarado. Si no hay nada, la cámara no calcula y el editor lo pide.

## 7. Propuesta en PDF

Se genera en la API con `pdfkit` y el tema de `common/pdf/nexara-pdf-theme.ts`, como la propuesta técnica de
cotizaciones. Va con marca **NEXARA** (CCTV es de NEXARA; ver `.claude/rules/marcas-mailing.md`).

1. **Portada:** proyecto, cliente, fecha y preparado por.
2. **Distribución de cámaras:** el plano 2D con conos recortados, etiquetas «14 m · 104 PPM · Observación» y
   la lista numerada.
3. **Vista 3D del sitio** y **vistas desde cada cámara**, de dos en dos.
4. **Leyenda DORI:** qué significa cada color, con IEC 62676-4.
5. **Cobertura del área:** mapa de calor y % del área por nivel. SYSCOM no lo da.
6. **Ficha por cámara:**
   - número y nombre, modelo y foto;
   - alcance por nivel, en el piso y por la visual;
   - óptica (resolución, focal, HFOV, sensor, IR);
   - montaje (altura, inclinación, zona ciega, muro o poste);
   - vista desde la cámara con la persona y su PPM;
   - referencia de detalle;
   - características del equipo.
7. **Infraestructura:** NVR y canales, discos (TB), switch PoE (W), cable (m y bobinas) y ancho de banda.
8. **Lista de equipo** con cantidades. Precios solo si se pide; si no, se manda a cotización.
9. **Notas:** que es una simulación con la óptica de cada cámara y la norma DORI, y que la instalación real
   puede variar por obstáculos e iluminación.

Botón **«Pasar a cotización»**: crea o actualiza una `Cotizacion` con los equipos como `CotizacionItem` y
adjunta el plano en `planos`.

## 8. Acceso

Regla de Adam: **encargados de área y arquitecto sí; ingenieros de soporte e instaladores no; el encargado
de instalación (David) y el de soporte (José Antonio) sí.**

| Rol (`roleKey`) | Quién hoy | ¿Entra? |
|---|---|---|
| `ceo`, `dir_operaciones`, `dir_admin` | Christian y dirección | Sí |
| `coord_operaciones` | David (instalación), Luis Joel (servicios) | Sí |
| `arquitecto` | Josué («Encargado de Obra») | Sí |
| `administrativo` | Daniela (comercial), Mónica | Sí (encargadas de área) |
| `enc_soporte` | (rol existente, sin nadie hoy) | Sí |
| `ing_soporte` **con gente a cargo** | José Antonio (Encargado de soporte) | Sí |
| `ing_soporte` sin gente a cargo | Carolina, Alejandro | **No** |
| `ing_campo` | Joan, Israel, Juan José (instaladores) | **No** |

José Antonio comparte rol con su equipo, así que el rol no basta. Se distingue por **tener reportes directos**
(`managerId`, el mismo `esJefe()` de `src/me/equipo-alcance.ts`). La regla vive en una función de la API
(`puedeDisenarCctv`) que usan el guard del módulo y `/me`. La web solo lee la bandera.

Hay una alternativa: pasar a José Antonio a `enc_soporte`, que ya está cableado. Es más limpia, pero le cambia
otros permisos, así que la decide Adam.

Módulo `erp-videovigilancia` en «Clientes y obra», ruta `/erp/videovigilancia`. Es la lista completa de
lugares a tocar para dar de alta un módulo:
- `access-matrix.ts`
- `core-surface.ts`
- `rbac/page-matrix.ts`
- `section-views.ts`
- `ShellIcons.tsx`
- `navigation-module-map.ts` en la API
- `url-matrix.ts`
- `role-modules.spec.ts`

## 9. Datos y API

- **`CctvProyecto`:** `id`, `companyId`, `nombre`, `clienteId?`, `cotizacionId?`, `workProjectId?`,
  `plano Json` (el `Plano` de `plano.ts`), `grabacion Json`, `estado` (borrador, enviada o aprobada),
  `version` (concurrencia optimista: dos encargados no se pisan), `creadoPorId`, `actualizadoPorId` y fechas.
- **Endpoints** (`/api/cctv-disenos`):
  - `GET /` y `POST /`
  - `GET /:id`
  - `PATCH /:id` con `version`
  - `POST /:id/croquis` (multer)
  - `POST /:id/detectar` (PDF vectorial o IA)
  - `GET /modelos?q&tipo&mpMin&irMin`
  - `POST /:id/propuesta` (recibe los PNG de las vistas y devuelve el PDF)
  - `POST /:id/cotizacion`
- **Seguridad.** Las ligas para el cliente son de solo lectura, firmadas y con caducidad, y **sin precios**
  salvo que se marque. Los croquis no van en el prefijo público de `uploads`.

## 10. Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Motor: óptica, DORI, zona ciega, plano, oclusión, cobertura, humanoides, mapa de calor, infraestructura. 36 pruebas | **Hecha** (29-10) |
| 2 | Módulo y permisos, proyectos (guardar/abrir), editor 2D (croquis, calibrar, muros, aberturas, obstáculos, etiquetas, cotas, cámaras con conos recortados, humanoides), catálogo semilla | Espera el visto bueno del mockup |
| 3 | 3D y vista desde cada cámara (three.js), recuadro de PPM, referencia de detalle | — |
| 4 | Propuesta PDF y «Pasar a cotización» | — |
| 5 | Detección automática (PDF vectorial y luego IA con eval) y «Leer ficha» | — |
| 6 | Infraestructura en el plano (gabinetes, rutas de cable, NVR/discos/switch) y mapa de calor en la propuesta | — |

Cada fase se despliega sola (`/root/deploy-web.sh` si solo cambia la web; `/root/deploy-api-web.sh` si cambia
la API).

## 11. Pendientes que no son de código

- **Fichas Hikvision verificadas** de los modelos que NEXARA instala de verdad. Lista a David.
- **Foto de referencia propia** para la simulación de detalle, de día y de noche.
- **Cliente SYSCOM:** cuenta de API para precios y existencia. Hoy solo hay CT.
- **José Antonio:** si queda como `ing_soporte` (con la regla de reportes) o pasa a `enc_soporte`.
