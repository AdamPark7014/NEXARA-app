# Diseñador de videovigilancia (NEXARA Core)

Módulo de Core para diseñar un sistema de CCTV sobre el plano del sitio y sacar la propuesta para el cliente.
Funciona así: se sube el croquis, se convierte en muros y puertas con escala real, se colocan cámaras del
catálogo con su óptica y se ven los conos DORI recortados por los muros, en 2D y en 3D, junto con lo que ve
cada cámara. Al final sale un PDF con ficha por cámara, infraestructura y lista de equipo.

Pedido de Adam (29-10-2026), a partir de la propuesta «Proyecto CCTV Bodegas VDM» que David Morales armó con el
diseñador de SYSCOM: «parametrice un sistema que me genere todo esto y lo puedan generar los encargados de
área… incluyendo el arquitecto. Los únicos que no son los de soporte y los instaladores». Los encargados de
instalación y de soporte sí entran.

Estado (29-10): **fases 1 y 2 hechas**. Fase 1 es el motor en `apps/web/lib/cctv/`. Fase 2, con el mockup aprobado
por Adam, es el módulo `/erp/videovigilancia`: lista y alta, editor 2D, panel de cámara, vista desde la cámara y API
`/api/cctv-disenos`. Lo que sigue está en §10.

Dónde vive la fase 2:
- Web:
  - páginas en `app/(panels)/erp/videovigilancia/` (`page.tsx` lista y alta; `[id]/page.tsx` carga el diseño);
  - editor en `_editor/` (`EditorCctv`, `Lienzo`, `Inspector`, `VistaCamara`, `croquis.ts`);
  - en `lib/cctv/`: `editor.ts` (operaciones puras y deshacer), `vista.ts`, `catalogo.ts`, `api.ts` y `acceso.ts`.
- API: `src/cctv-disenos/` y la migración `20261029130000_cctv_disenos`.
- Niveles (fase 5b): el plano raíz es la planta baja y los demás pisos van en `plano.niveles`, cada uno con
  `{ nivel: { id, nombre, elevacionM, alturaLibreM }, plano }`. La geometría de cada nivel está en px de su
  croquis; para pasar algo de un piso a otro se va por metros. La API no cambió: el JSON viaja en el mismo campo
  `plano` (tope de 2 MB). El resumen suma la cobertura de todos los pisos, ponderada por área.

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

Desde el 01-11-2026 hay dos vistas 3D:

- **Maqueta** (`_editor/Maqueta3D.tsx` y `lib/cctv/maqueta/`), con three.js y WebGL: la que se abre por omisión.
- **Respaldo SVG** (`Lienzo3D`, `lib/cctv/escena3d.ts`): si el navegador no tiene WebGL2 o pierde el contexto.

Lo que sigue describe la maqueta; ver §4.1 para lo que se agregó.

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

### 4.1 Maqueta y plano técnico (fase 7, aprobada por Adam el 01-11-2026)

Mockup: <https://claude.ai/artifact/PoFrsCNRTWxHrDDYQDAWeY>. Maqueta de muestra: <https://claude.ai/artifact/MLTNVKcT6rGV9q3hGAhkJg>.

- **Modelos propios** (`maqueta/modelos.ts`): domo, turret, bala y PTZ se arman con código a partir de las medidas de la
  ficha, en milímetros. No usan fotos ni archivos del fabricante: su licencia prohíbe obras derivadas. Las fotos de
  `public/cctv/` salen de estos mismos modelos.
- **Capas** (`maqueta/motor.ts`): solo se rehace lo que cambió del plano. Se pinta a pedido; mientras se mueve va sin
  sombreado de contacto y al soltar se afina. Con tarjeta integrada Intel UHD gira a 47 cuadros por segundo con el sitio de
  ejemplo (10 cámaras, 25 muebles, 3 anaqueles). Si baja de 20, reduce la resolución sola.
- **Datos nuevos en el plano**, opcionales y sin migración: `areas` (zona con piso y nombre) y `muebles` (ambientación). La
  ambientación **no tapa la vista** en el cálculo; lo que tape se dibuja como obstáculo. Un obstáculo llamado «Anaquel» o
  «Rack» se ve con su estructura y cajas.
- **Muros tenues:** un muro de afuera se vuelve tenue solo si, desde donde se ve, tapa más de 4.5 m hacia adentro. Una
  bodega de 3 m se ve sólida desde arriba; una de 5 m o una vista baja abren la «casa de muñecas».
- **De noche:** cada cono llega hasta `irM`, el alcance de IR o luz blanca de la ficha. Es una aproximación: no considera las
  lámparas del sitio.
- **«Ver lo que ve»:** pone la vista en la lente con el ángulo vertical real de la óptica.
- **Plano técnico** (`_editor/PlanoTecnico.tsx`, `lib/cctv/planoTecnico.ts`): hoja doble carta a escala normalizada. Los ejes
  salen de las líneas donde corren muros rectos. En «Imprimir plano» sale a 17 × 11 in; dentro de la propuesta va girado en
  una hoja carta, porque Chrome reduce todo el documento si una hoja es más ancha que las demás.
- **Claves:** `CAM-01` sale de `numero`. Los demás equipos (AC, AS, GAB…) llegan con el catálogo.

Para ver el editor sin sesión y sin los minutos de `next dev`: empaquetar con esbuild, con `next/link`, `next/navigation` y
`next/dynamic` sustituidos por versiones mínimas y el `.nx-app-shell` alrededor (sin esa clase, `section` toma el ancho máximo
del sitio público). Sin GPU, Chrome necesita `--use-angle=swiftshader`.

### 4.2 Equipos, cableado y diagrama (fase 8, aprobada por Adam el 01-11-2026)

Además de cámaras se colocan grabador, switch, servidor, UPS, gabinete, terminal de acceso, barrera, sirena,
alerta sísmica, panel de alarma y un equipo genérico. Viven en `plano.equipos` (opcional: los diseños anteriores
no lo traen y no hace falta migrarlos) y el `tipo` decide su modelo y su comportamiento:

- **De rack** (`TIPOS_DE_RACK`): si hay gabinete en el nivel entran solos a la unidad libre más alta; un clic en el
  panel basta. Si no cabe quedan sueltos y se avisa. Al poner un gabinete entra lo que estaba suelto. Al moverlo
  viaja lo de adentro; al quitarlo, lo de adentro queda suelto, no se pierde.
- **De muro** (terminal, sirena, alerta, panel, genérico): se pegan al muro a menos de 1 m y miran hacia donde se
  tocó. Lejos de un muro llevan pedestal en la maqueta.
- **Terminal:** se liga a la puerta a menos de 3 m (`puertaId`). Si se borra la puerta, queda sin ligar y la revisión
  lo señala.
- **Sirena y alerta:** `alcanceM` es un estimado editable, sin descontar muros. Se dice así en la revisión.
- **Barrera:** la pluma corre hacia el rumbo.

`lib/cctv/sistema.ts` calcula lo demás, y es puro:

- `conexionesDelSistema`: el cable de cada equipo suelto al gabinete de su nivel (si no tiene, al de otro nivel,
  sumando el desnivel). `rutaCable` compara la L en sus dos sentidos y las Z por cada línea de muros, y elige la que
  más se pega a ellos. Mide con la misma regla de holgura y reserva de `infraestructura.ts`. El cable no se dibuja a
  mano: sale de lo colocado, y por eso la lista de equipo ya da metros y bobinas.
- `balanceDelSistema` y `revisionDelSistema`: PoE contra lo que da el switch, puertos, canales, Mbps, discos contra
  bahías, UTP arriba de 90 y 100 m, gabinete, terminal sin puerta y alarmas. Dicen el modelo y por cuánto.
- `DiagramaSistema.tsx`: hoja doble carta, como el plano técnico, con coordenadas calculadas.

Las fotos de `public/cctv/modelos/` y `public/cctv/frente/` son de nuestros propios modelos 3D, sin marca: ningún
equipo usa imágenes de un tercero. Sin WebGL, `Lienzo3D` no pinta estos equipos: se ven en el dibujo, el plano y el
diagrama.

### 4.3 Moverse por la maqueta y por dentro

Adam, 02-11: «le faltan cosas como deslizarte y checar y meter y moverte en el mapa». Antes solo se podía girar desde afuera.

- **Desde arriba:** arrastrar desliza el mapa; clic derecho, o «Girar» en la barra, lo gira; la rueda acerca hacia el puntero. W A S D
  o las flechas también deslizan, y Q o E giran. El arrastre sobre un área o un mueble ya no los mueve si no están elegidos: antes,
  arrastrar sobre el piso movía el piso. La vista no deja perder el sitio (`contenerVista`).
- **Encuadre:** se encuadra lo construido, no los conos de cobertura, que se salen mucho y dejaban el edificio chiquito.
- **Recorrer:** el botón, el muñeco arrastrado al sitio o doble clic en el piso te meten a 1.60 m (`entrarRecorrido`). W A S D, flechas o
  el pad caminan y Mayús corre. Arrastrar mira, como en un mapa de calle. Clic en el piso, en el minimapa o en el nombre de un área te lleva.
  Los muros, anaqueles y ventanas no se cruzan; las puertas y accesos sí; al chocar se resbala por el muro
  (`lib/cctv/recorrido.ts`, con pruebas). Adentro todo va a tamaño real, con techo y horizonte, y sin las líneas de cable.
- **Checar:** un panel dice en qué área estás y qué cámaras te ven ahí, con sus PPM: es la misma cuenta que la persona de prueba
  (`leerPersona`). «Aquí ninguna cámara te ve» es un punto ciego. Clic en un equipo se acerca y lo mira a su altura. «Ver lo que ve» ya
  deja pasar a la cámara anterior o siguiente. «Recorrido automático» pasea por las áreas, para enseñar el sitio.
- **Meter:** adentro se eligen equipos del panel y se ponen viendo el muro de frente, a la altura donde se tocó (`montaje`). «Apuntar» deja
  mirar con el puntero lo que debe ver la cámara, y la tarjeta de lo elegido sube o baja su altura.

**El imán** (`lib/cctv/pegado.ts`, Adam: «no se pegan a las esquinas»). Una cámara cerca de una esquina queda en ella, por el lado del puntero, a
4 cm de las dos caras y mirando en diagonal al cuarto; cerca de un muro queda de frente. Antes de soltar, un marcador dice «Esquina» o «Muro», en
la maqueta y en el plano. Al moverla se respeta hacia dónde miraba si desde ahí sigue viendo el cuarto; si no, voltea. No se monta más alto que el
muro. Alt la deja libre, y en poste o techo no se pega. La escena mide los dos muros de una esquina y le pone su soporte; antes medía solo el más
cercano y la cámara se metía en el otro. Al arrastrar, el punto se mide a la altura del equipo y no en el piso, para que siga al puntero.
Terminales, sirenas y alertas se quedan en su muro al moverlas.

### 4.4 Armar el diseño con IA, gastando casi nada

Para quien no quiere dibujar: «Armar con IA» pide la descripción del sitio con palabras, o una plantilla. **La IA solo saca unos datos de
la frase** (`cctv-disenos/sitio-ia.ts`: medidas, áreas, cuántas cámaras, marca); solo viaja la frase. **El diseño lo arma el código**
(`lib/cctv/generarSitio.ts`, con pruebas): muros, puertas, áreas, anaqueles, muebles, cámaras pegadas y apuntadas, gabinete con grabador y switches
según las cámaras, terminales en sus puertas. Son las mismas piezas de siempre, se ajustan igual y Ctrl+Z lo deshace de un paso. Las plantillas no
llaman a la IA.

También sirve para un equipo sin su PDF: «¿No tienes el PDF? Descríbelo» (`POST /catalogo/describir`) llena la misma pantalla de revisión, solo con
lo que dijo la persona, y lo guarda con `fuente: "manual"`.

Medido (`npm run eval:sitio -w apps/api`, Haiku 5.5 `low`): 12 frases de sitio y 8 de equipo, escritas para la prueba, cortas y con faltas: 20 de
20 sin inventar nada que no se dijera. US$0.00013 por llamada; p50 1.7 s, p95 3.9 s. Son frases nuestras, todavía no de gente real.

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

**Hecho en la fase 8.** La lista base vive en el código (`lib/cctv/catalogo.ts`) y lo que agrega cada empresa, en
`cctv_equipos` (`CctvEquipo`), con la misma forma para cámaras y lo demás: `familia`, `tipo`, `marca`, `modelo`,
`descripcion`, `datos` (canales, puertos, PoE… y, en cámaras, su `optica`), `medidas` en mm, `fuente` y `productId`.
Es solo la ficha: el inventario sigue siendo uno, así que `productId` apunta a `Product` (columna suelta, no se
alteró `products`) y las existencias saldrán de `stock_levels` en la fase de stock. Lo que no sale de una hoja
técnica lleva `fuente: "tipo"`, sin marca, y la pantalla dice «Falta su ficha». Un diseño guarda su copia de los
datos: cambiar o archivar el modelo no le mueve nada.

**Hecho en la fase 9: leer la memoria técnica.** «Cargar memoria técnica» (catálogo y «+ Agregar equipo» del editor) sube el
PDF a `POST /cctv-disenos/catalogo/leer-ficha`. Esa ruta no guarda nada: ni el PDF, porque la licencia de los materiales de
Hikvision no deja redistribuirlos, ni los datos. La persona revisa lo leído, con la hoja de donde salió cada dato, ve el modelo
armado con esas medidas y solo entonces guarda.

- **Qué viaja a la IA** (`cctv-disenos/ficha-ia.ts`, `ficha-pdf.ts`): el texto de todas las hojas con `pdftotext -raw` y dos
  hojas como imagen a 150 dpi, la portada (color y forma) y la del dibujo de dimensiones (sus cotas no están en el texto). `-raw`
  no es un capricho: el modo normal y `-layout` separan cada etiqueta de su valor en estas tablas. Pesa lo mismo con un PDF de
  1 MB que con uno de 30; la puerta no acepta más de 2 MB. Un PDF sin texto se lee por las imágenes de sus primeras 4 hojas.
- **Qué hace el código, no la IA:** la familia sale del tipo; los números se limpian; un dato sin número, de un campo desconocido
  o repetido se tira; una hoja que no existe se queda sin hoja; una cota imposible (carcasa más alta que el equipo, cúpula más
  ancha que el diámetro) se quita; en un switch cuentan los puertos con PoE.
- **Medido** (`npm run eval:ficha -w apps/api -- --carpeta <PDFs>`, Haiku 5.5 `low`, sin razonamiento): 15 fichas reales de varias
  marcas (Hikvision, Dahua, Axis, TP-Link y ZKTeco: cámaras, grabadores, panel, barrera, switches y terminales) y 4 casos escritos
  para ver si inventa. 210 de 213 datos (98.6 %). De los 3 que fallan, 2 quedaron vacíos y 1 salió mal: la pluma de la barrera, leída
  de 1.5 m cuando son 3; por eso la pantalla pide revisar. US$0.00099 por ficha; p50 3.1 s, máximo 7 s. No hay fichas de sirena,
  sísmica, servidor ni UPS. Los PDF no van en el repo; sí la verdad de cada uno, en `correr-ficha.ts`.
- **El modelo se parece, no es una copia.** Se arma con las medidas de la ficha, el color y la forma típica de su tipo
  (`maqueta/modelos.ts`, `modelosEquipos.ts`), y la pantalla lo dice. El parecido medido en la propuesta fue de 0.91 a 0.94 por
  silueta. En equipos que no son cámara solo cambian las proporciones: una terminal siempre tiene el mismo frente.
- **Lo que se guarda:** `datos.apariencia` (color, luces, caja trasera), `datos.ficha` (archivo, hojas, de qué hoja salió cada
  dato y lo que no da comportamiento: peso, IP, IK) y `datos.foto`, una foto de 256 px del modelo ya armado, en base64, para las
  tarjetas. `leerFilasCatalogo` las separa: no se copian a cada equipo colocado en un diseño.

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
  - `GET /catalogo` y `POST /catalogo`, `PATCH /catalogo/:id`, `POST /catalogo/:id/archivar` (antes de `:id`)
  - `POST /catalogo/leer-ficha` (PDF hasta 30 MB; devuelve lo leído, no guarda nada)
  - `POST /catalogo/describir` y `POST /generar-sitio` (`{ frase }`, hasta 1,500 caracteres; devuelven datos, no guardan nada)
- **Seguridad.** Las ligas para el cliente son de solo lectura, firmadas y con caducidad, y **sin precios**
  salvo que se marque. Los croquis no van en el prefijo público de `uploads`.

## 10. Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Motor: óptica, DORI, zona ciega, plano, oclusión, cobertura, humanoides, mapa de calor, infraestructura. 36 pruebas | **Hecha** (29-10) |
| 2 | Módulo y permisos, proyectos (guardar/abrir), editor 2D (croquis, calibrar, muros, aberturas, obstáculos, etiquetas, cotas, cámaras con conos recortados, humanoides), catálogo semilla, vista desde la cámara en 2D | **Hecha** (29-10) |
| 3 | 3D y vista desde cada cámara, recuadro de PPM, referencia de detalle. Se hizo en SVG axonométrico en lugar de three.js: sin dependencias nuevas ni WebGL | **Hecha** (29-10) |
| 4 | Propuesta PDF (hojas carta, impresión del navegador) y ficha por cámara. Falta «Pasar a cotización» | **Hecha**, salvo cotización (29-10) |
| 5b | Plano por niveles (varios pisos), artboard 5 aprobado por Adam el 29-10: barra de niveles, cada nivel con su croquis, escala, muros y cámaras; «Copiar muros» del nivel de abajo; numeración que sigue entre niveles; 3D apilado a la elevación real con los de abajo en gris; propuesta con una hoja de distribución por nivel. Motor en `lib/cctv/niveles.ts` | **Hecha** (29-10) |
| 5 | Detección automática (PDF vectorial y luego IA con eval) y «Leer ficha» | — |
| 6 | Infraestructura en el plano (gabinetes, rutas de cable, NVR/discos/switch) y mapa de calor en la propuesta | — |
| 7 | Maqueta 3D con WebGL, modelos propios, vista de noche, «Ver lo que ve», áreas y ambientación, plano técnico y foto de la maqueta en la propuesta (§4.1) | **Hecha** (01-11) |
| 8 | Catálogo de equipos: agregar modelos; acceso, alarmas, servidores, NVR y gabinete con su modelo y comportamiento; rutas de cable, diagrama de conexión y revisión (§4.2 y §6) | **Hecha** (01-11) |
| 9 | Memoria técnica: subir el PDF, la IA llena la ficha y se arma el modelo. Medido: 92 de 94 datos en 6 fichas con Haiku 5.5 | Propuesta aprobada |
| 9b | Moverse por dentro, imán de esquinas y muros, armar con IA, modelos y visor con vistas y cotas (§4.3, §4.4) | Pedido de Adam, 02-11 |
| 10 | Stock de Almacén, consulta en CT y «Pasar a cotización» | Falta decidir el inventario |
| 11 | Cotización premium | Faltan las especificaciones de Adam |

Cada fase se despliega sola (`/root/deploy-web.sh` si solo cambia la web; `/root/deploy-api-web.sh` si cambia
la API).

## 11. Pendientes que no son de código

- **Fichas Hikvision verificadas** de los modelos que NEXARA instala de verdad. Lista a David.
- **Foto de referencia propia** para la simulación de detalle, de día y de noche.
- **Cliente SYSCOM:** cuenta de API para precios y existencia. Hoy solo hay CT.
- **José Antonio:** si queda como `ing_soporte` (con la regla de reportes) o pasa a `enc_soporte`.
