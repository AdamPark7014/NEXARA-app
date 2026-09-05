import {
  APPENDIX_B_EVENT_TYPES,
  DEFAULT_SENSITIVITY,
  MAX_DETECTION_REGIONS,
  SMART_EVENT_TYPES,
  clampSensitivity,
  parseSmartCapabilities,
  patchFieldDetectionXml,
  patchLineDetectionXml,
  readNormalizedGrid,
  regionToCoordinatesList,
  replaceTagIfPresent,
  resolveTriggerEventTypes,
  resolveTuning,
  sanitizeRegions,
  supportedEventTypesFrom,
  upsertTag,
  type NormalizedRegion,
} from './isapi.detection';

/**
 * Parcheo de XML de detección: transformaciones puras, sin red.
 *
 * Los XML de abajo copian la **forma** de lo que devuelven los equipos de
 * Oficinas —lo que ya parsea `isapi.discovery.ts`—: `FieldDetection` con
 * `normalizedScreenSize`, cuatro `FieldDetectionRegion` (el equipo admite 4) y
 * los tags `sensitivityLevel`, `detectionTarget`, `timeThreshold` y
 * `alarmConfidence`. No se inventa ningún tag que el código no viera ya.
 */

const region = (id: number, extra = '') =>
  `<FieldDetectionRegion>` +
  `<id>${id}</id>` +
  `<enabled>false</enabled>` +
  `<detectionTarget>vehicle</detectionTarget>` +
  `<sensitivityLevel>100</sensitivityLevel>` +
  `<timeThreshold>5</timeThreshold>` +
  extra +
  `<RegionCoordinatesList>` +
  `<RegionCoordinates><positionX>0</positionX><positionY>0</positionY></RegionCoordinates>` +
  `<RegionCoordinates><positionX>1000</positionX><positionY>0</positionY></RegionCoordinates>` +
  `<RegionCoordinates><positionX>1000</positionX><positionY>1000</positionY></RegionCoordinates>` +
  `<RegionCoordinates><positionX>0</positionX><positionY>1000</positionY></RegionCoordinates>` +
  `</RegionCoordinatesList>` +
  `</FieldDetectionRegion>`;

const CONFIANZA = `<alarmConfidence opt="low,mediumLow,mediumHigh,high">high</alarmConfidence>`;

const fieldXml = (opts: { slots?: number; confidence?: boolean } = {}) => {
  const slots = opts.slots ?? 4;
  const extra = opts.confidence === false ? '' : CONFIANZA;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<FieldDetection version="2.0">` +
    `<enabled>false</enabled>` +
    `<normalizedScreenSize><normalizedScreenWidth>1000</normalizedScreenWidth>` +
    `<normalizedScreenHeight>1000</normalizedScreenHeight></normalizedScreenSize>` +
    `<startTriggerTime>500</startTriggerTime><endTriggerTime>500</endTriggerTime>` +
    `<FieldDetectionRegionList>` +
    Array.from({ length: slots }, (_, i) => region(i + 1, extra)).join('') +
    `</FieldDetectionRegionList>` +
    `</FieldDetection>`
  );
};

const LINE_XML =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<LineDetection version="2.0">` +
  `<enabled>false</enabled>` +
  `<normalizedScreenSize><normalizedScreenWidth>1000</normalizedScreenWidth>` +
  `<normalizedScreenHeight>1000</normalizedScreenHeight></normalizedScreenSize>` +
  `<LineItemList><LineItem>` +
  `<id>1</id><enabled>false</enabled>` +
  `<detectionTarget>vehicle</detectionTarget>` +
  `<sensitivityLevel>100</sensitivityLevel>` +
  `<directionSensitivity>left-right</directionSensitivity>` +
  `<alarmConfidence opt="low,mediumLow,mediumHigh,high">high</alarmConfidence>` +
  `<CoordinatesList>` +
  `<Coordinates><positionX>0</positionX><positionY>100</positionY></Coordinates>` +
  `<Coordinates><positionX>1000</positionX><positionY>100</positionY></Coordinates>` +
  `</CoordinatesList>` +
  `</LineItem></LineItemList>` +
  `</LineDetection>`;

/** Puerta: un rectángulo pequeño abajo a la izquierda. */
const PUERTA: NormalizedRegion = [
  { x: 0.05, y: 0.5 },
  { x: 0.35, y: 0.5 },
  { x: 0.35, y: 0.95 },
  { x: 0.05, y: 0.95 },
];

const contar = (xml: string, re: RegExp) => xml.match(re)?.length ?? 0;

describe('helpers de tags', () => {
  it('replaceTagIfPresent no inventa el tag si el equipo no lo mandó', () => {
    expect(replaceTagIfPresent('<a><b>1</b></a>', 'b', '2')).toBe('<a><b>2</b></a>');
    expect(replaceTagIfPresent('<a><c>1</c></a>', 'b', '2')).toBe('<a><c>1</c></a>');
  });

  it('upsertTag sí lo añade — reservado a tags documentados', () => {
    expect(upsertTag('<R><c>1</c></R>', 'b', '2', 'R')).toBe('<R><c>1</c><b>2</b></R>');
    expect(upsertTag('<R><b>1</b></R>', 'b', '2', 'R')).toBe('<R><b>2</b></R>');
  });

  it('clampSensitivity respeta el rango documentado [0,100]', () => {
    expect(clampSensitivity(70)).toBe(70);
    expect(clampSensitivity(999)).toBe(100);
    expect(clampSensitivity(-5)).toBe(0);
    expect(clampSensitivity('40')).toBe(40);
    expect(clampSensitivity(undefined)).toBe(DEFAULT_SENSITIVITY);
    expect(clampSensitivity('no')).toBe(DEFAULT_SENSITIVITY);
  });

  it('un perfil sin sensibilidad no deja la cámara sorda', () => {
    // `Number(null)` y `Number('')` son 0. Sin el atajo, una columna vacía
    // escribiría `sensitivityLevel=0` en el equipo.
    expect(clampSensitivity(null)).toBe(DEFAULT_SENSITIVITY);
    expect(clampSensitivity('')).toBe(DEFAULT_SENSITIVITY);
    // Pero un 0 pedido a mano sí se respeta.
    expect(clampSensitivity(0)).toBe(0);
  });
});

describe('sanitizeRegions', () => {
  it('recorta a 0..1 y descarta lo que no es polígono', () => {
    const r = sanitizeRegions([
      [
        { x: -0.5, y: 0.2 },
        { x: 2, y: 0.4 },
        { x: 0.3, y: 0.9 },
      ],
      [{ x: 0.1, y: 0.1 }], // dos vértices no bastan: no es polígono
      'basura',
    ]);
    expect(r).toEqual([
      [
        { x: 0, y: 0.2 },
        { x: 1, y: 0.4 },
        { x: 0.3, y: 0.9 },
      ],
    ]);
  });

  it('topa a las 4 ranuras que admite el equipo', () => {
    const r = sanitizeRegions(Array.from({ length: 9 }, () => PUERTA));
    expect(r).toHaveLength(MAX_DETECTION_REGIONS);
  });

  it('sin regiones válidas devuelve null (= comportamiento de siempre)', () => {
    expect(sanitizeRegions(null)).toBeNull();
    expect(sanitizeRegions([])).toBeNull();
    expect(sanitizeRegions([[{ x: 0, y: 0 }]])).toBeNull();
  });
});

describe('geometría → rejilla del equipo', () => {
  it('lee normalizedScreenSize del propio XML', () => {
    expect(readNormalizedGrid(fieldXml())).toEqual({ w: 1000, h: 1000 });
    // Un firmware sin el nodo: 1000×1000, que es lo medido en Oficinas.
    expect(readNormalizedGrid('<FieldDetection/>')).toEqual({ w: 1000, h: 1000 });
  });

  it('escala 0..1 a la rejilla y redondea a entero', () => {
    const out = regionToCoordinatesList(PUERTA, { w: 1000, h: 1000 });
    expect(out).toContain('<positionX>50</positionX><positionY>500</positionY>');
    expect(out).toContain('<positionX>350</positionX><positionY>950</positionY>');
    expect(out.startsWith('<RegionCoordinatesList>')).toBe(true);
  });

  it('respeta una rejilla distinta de 1000', () => {
    const out = regionToCoordinatesList([{ x: 0.5, y: 0.25 }, { x: 1, y: 1 }, { x: 0, y: 0 }], {
      w: 704,
      h: 576,
    });
    expect(out).toContain('<positionX>352</positionX><positionY>144</positionY>');
  });
});

describe('patchFieldDetectionXml · sin perfil (compatibilidad)', () => {
  const patch = patchFieldDetectionXml(fieldXml(), null);

  it('enciende la detección y la ranura 1', () => {
    expect(patch).not.toBeNull();
    expect(patch!.slots).toBe(4);
    expect(patch!.enabled).toBe(1);
    expect(patch!.xml).toContain('<FieldDetection version="2.0"><enabled>true</enabled>');
  });

  it('deja la región a fotograma completo, como hacía antes', () => {
    expect(patch!.xml).toContain(
      '<RegionCoordinatesList>' +
        '<RegionCoordinates><positionX>0</positionX><positionY>0</positionY></RegionCoordinates>' +
        '<RegionCoordinates><positionX>1000</positionX><positionY>0</positionY></RegionCoordinates>' +
        '<RegionCoordinates><positionX>1000</positionX><positionY>1000</positionY></RegionCoordinates>' +
        '<RegionCoordinates><positionX>0</positionX><positionY>1000</positionY></RegionCoordinates>' +
        '</RegionCoordinatesList>',
    );
  });

  it('baja la sensibilidad del techo (100) al valor por defecto', () => {
    expect(patch!.xml).toContain(`<sensitivityLevel>${DEFAULT_SENSITIVITY}</sensitivityLevel>`);
    // Las otras tres ranuras siguen intactas: no se tocan sin perfil.
    expect(contar(patch!.xml, /<sensitivityLevel>100<\/sensitivityLevel>/g)).toBe(3);
  });

  it('no apaga las demás ranuras cuando no hay perfil', () => {
    expect(contar(patch!.xml, /<enabled>false<\/enabled>/g)).toBe(3);
  });

  it('escribe alarmConfidence conservando el `opt=` del equipo', () => {
    expect(patch!.wroteAlarmConfidence).toBe(true);
    // El equipo lo manda con atributos; se le devuelven tal cual. Un regex que
    // los ignore no encuentra el tag y el parcheo se pierde en silencio.
    expect(patch!.xml).toContain(
      '<alarmConfidence opt="low,mediumLow,mediumHigh,high">low</alarmConfidence>',
    );
  });

  it('conserva detectionTarget=human y re-arma rápido', () => {
    expect(patch!.xml).toContain('<detectionTarget>human</detectionTarget>');
    expect(patch!.xml).toContain('<startTriggerTime>0</startTriggerTime>');
    expect(patch!.xml).toContain('<endTriggerTime>0</endTriggerTime>');
  });
});

describe('patchFieldDetectionXml · con perfil', () => {
  it('escribe los polígonos del perfil, uno por ranura', () => {
    const zona2: NormalizedRegion = [
      { x: 0.6, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.4 },
    ];
    const patch = patchFieldDetectionXml(fieldXml(), {
      regions: [PUERTA, zona2],
      sensitivity: 35,
      target: 'human',
      alarmConfidence: 'mediumHigh',
      timeThresholdSec: 3,
    });
    expect(patch!.enabled).toBe(2);
    expect(patch!.xml).toContain('<positionX>50</positionX><positionY>500</positionY>');
    expect(patch!.xml).toContain('<positionX>600</positionX><positionY>100</positionY>');
    expect(contar(patch!.xml, /<sensitivityLevel>35<\/sensitivityLevel>/g)).toBe(2);
    expect(contar(patch!.xml, /<alarmConfidence[^>]*>mediumHigh<\/alarmConfidence>/g)).toBe(2);
    expect(contar(patch!.xml, /<timeThreshold>3<\/timeThreshold>/g)).toBe(2);
  });

  it('apaga las ranuras que el perfil no usa (si no, la zona vieja sigue disparando)', () => {
    const patch = patchFieldDetectionXml(fieldXml(), { regions: [PUERTA] });
    expect(patch!.enabled).toBe(1);
    // 1 encendida + 3 apagadas explícitamente.
    expect(contar(patch!.xml, /<enabled>true<\/enabled>/g)).toBe(2); // raíz + ranura 1
    expect(contar(patch!.xml, /<enabled>false<\/enabled>/g)).toBe(3);
  });

  it('nunca usa más de 4 polígonos aunque el perfil traiga más', () => {
    const patch = patchFieldDetectionXml(fieldXml(), {
      regions: Array.from({ length: 7 }, () => PUERTA),
    });
    expect(patch!.enabled).toBeLessThanOrEqual(MAX_DETECTION_REGIONS);
  });

  it('recorta una sensibilidad fuera de rango en vez de mandarla al equipo', () => {
    const patch = patchFieldDetectionXml(fieldXml(), { sensitivity: 5000 });
    expect(patch!.xml).toContain('<sensitivityLevel>100</sensitivityLevel>');
    expect(patch!.xml).not.toContain('<sensitivityLevel>5000</sensitivityLevel>');
  });
});

describe('patchFieldDetectionXml · no inventar tags', () => {
  it('si el equipo no devolvió alarmConfidence, no se escribe', () => {
    const xml = fieldXml({ confidence: false });
    const patch = patchFieldDetectionXml(xml, { alarmConfidence: 'high' });
    expect(patch!.wroteAlarmConfidence).toBe(false);
    expect(patch!.xml).not.toContain('alarmConfidence');
  });

  it('tampoco se inventa el alias viejo `sensitivity`', () => {
    const patch = patchFieldDetectionXml(fieldXml(), { sensitivity: 40 });
    expect(patch!.xml).not.toMatch(/<sensitivity>/);
  });

  it('un XML sin regiones no se parchea: devuelve null', () => {
    expect(patchFieldDetectionXml('<FieldDetection><enabled>true</enabled></FieldDetection>')).toBeNull();
    // La PTZ DarkFighter responde 403 antes de llegar aquí, pero si un firmware
    // devolviera un cuerpo vacío tampoco se le manda un PUT a ciegas.
    expect(patchFieldDetectionXml('')).toBeNull();
  });
});

describe('patchLineDetectionXml', () => {
  it('sin perfil deja la línea a media altura y baja la sensibilidad', () => {
    const patch = patchLineDetectionXml(LINE_XML, null);
    expect(patch!.lines).toBe(1);
    expect(patch!.xml).toContain('<positionX>0</positionX><positionY>500</positionY>');
    expect(patch!.xml).toContain('<positionX>1000</positionX><positionY>500</positionY>');
    expect(patch!.xml).toContain(`<sensitivityLevel>${DEFAULT_SENSITIVITY}</sensitivityLevel>`);
    expect(patch!.xml).toContain('<directionSensitivity>any</directionSensitivity>');
    expect(patch!.xml).toContain(
      '<alarmConfidence opt="low,mediumLow,mediumHigh,high">low</alarmConfidence>',
    );
  });

  it('con perfil usa el primer y el último vértice como extremos del segmento', () => {
    const patch = patchLineDetectionXml(LINE_XML, {
      regions: [
        [
          { x: 0.1, y: 0.8 },
          { x: 0.5, y: 0.8 },
          { x: 0.9, y: 0.2 },
        ],
      ],
      sensitivity: 30,
      target: 'human,vehicle',
    });
    expect(patch!.xml).toContain('<positionX>100</positionX><positionY>800</positionY>');
    expect(patch!.xml).toContain('<positionX>900</positionX><positionY>200</positionY>');
    expect(patch!.xml).toContain('<sensitivityLevel>30</sensitivityLevel>');
    expect(patch!.xml).toContain('<detectionTarget>human,vehicle</detectionTarget>');
  });

  it('sin LineItem no se parchea', () => {
    expect(patchLineDetectionXml('<LineDetection><enabled>true</enabled></LineDetection>')).toBeNull();
  });
});

describe('resolveTuning', () => {
  it('rellena huecos con lo que reproduce el comportamiento anterior', () => {
    expect(resolveTuning(null)).toEqual({
      target: 'human',
      sensitivity: DEFAULT_SENSITIVITY,
      alarmConfidence: 'low',
      regions: null,
      timeThresholdSec: 0,
    });
  });

  it('descarta enums que no existen en vez de escribirlos', () => {
    const t = resolveTuning({
      target: 'perro' as never,
      alarmConfidence: 'altísima' as never,
      timeThresholdSec: -4,
    });
    expect(t.target).toBe('human');
    expect(t.alarmConfidence).toBe('low');
    expect(t.timeThresholdSec).toBe(0);
  });
});

describe('lista blanca de eventos', () => {
  it('la base son los cinco que el sistema cablea hoy', () => {
    expect([...SMART_EVENT_TYPES]).toEqual([
      'fielddetection',
      'linedetection',
      'facedetection',
      'VMD',
      'videoloss',
    ]);
  });

  it('un perfil puede ampliarla, sin duplicar y sin reordenar la base', () => {
    const out = resolveTriggerEventTypes(['loitering', 'regionEntrance', 'vmd']);
    expect(out.slice(0, 5)).toEqual([...SMART_EVENT_TYPES]);
    expect(out).toContain('loitering');
    expect(out).toContain('regionEntrance');
    // `vmd` ya estaba como `VMD`: no entra dos veces.
    expect(out.filter((t) => t.toLowerCase() === 'vmd')).toHaveLength(1);
  });

  it('lo que no está en el Apéndice B no entra', () => {
    const out = resolveTriggerEventTypes(['ANPR', 'heatMap', 'queueDetection', '']);
    expect(out).toEqual([...SMART_EVENT_TYPES]);
  });

  it('normaliza la caja a la grafía oficial del catálogo', () => {
    expect(resolveTriggerEventTypes(['LOITERING'])).toContain('loitering');
    expect(resolveTriggerEventTypes(['scenechangedetection'])).toContain('scenechangedetection');
  });

  it('el catálogo documentado incluye los tipos que hoy están «no verificados»', () => {
    for (const t of ['loitering', 'regionEntrance', 'regionExiting', 'unattendedBaggage', 'defocus']) {
      expect(APPENDIX_B_EVENT_TYPES as readonly string[]).toContain(t);
    }
  });
});

describe('parseSmartCapabilities', () => {
  /** Forma medida: la PTZ DarkFighter declara false; las AcuSense, true. */
  const ACUSENSE =
    `<SmartCap version="2.0">` +
    `<isSupportFieldDetection>true</isSupportFieldDetection>` +
    `<isSupportLineDetection>true</isSupportLineDetection>` +
    `<isSupportFaceDetect>true</isSupportFaceDetect>` +
    `<isSupportRegionEntrance>true</isSupportRegionEntrance>` +
    `<isSupportLoitering>false</isSupportLoitering>` +
    `<isSupportPeopleCounting>false</isSupportPeopleCounting>` +
    `<isSupportRoadTraffic>false</isSupportRoadTraffic>` +
    `</SmartCap>`;

  it('lee los flags que el equipo declara', () => {
    const caps = parseSmartCapabilities(ACUSENSE);
    expect(caps.fieldDetection).toBe(true);
    expect(caps.lineDetection).toBe(true);
    expect(caps.faceDetect).toBe(true);
    expect(caps.regionEntrance).toBe(true);
    expect(caps.loitering).toBe(false);
  });

  it('lo que el equipo NO dice queda en null, que no es «no soportado»', () => {
    const caps = parseSmartCapabilities(ACUSENSE);
    expect(caps.defocus).toBeNull();
    expect(caps.unattendedBaggage).toBeNull();
    expect(caps.heatMap).toBeNull();
  });

  it('guarda los isSupport que no sabemos mapear, sin perderlos', () => {
    const caps = parseSmartCapabilities(ACUSENSE);
    expect(caps.extra).toEqual({ isSupportRoadTraffic: false });
  });

  it('la PTZ que no soporta nada smart se lee igual de bien', () => {
    const caps = parseSmartCapabilities(
      '<SmartCap><isSupportFieldDetection>false</isSupportFieldDetection></SmartCap>',
    );
    expect(caps.fieldDetection).toBe(false);
    expect(supportedEventTypesFrom(caps)).toEqual([]);
  });

  it('traduce capacidades a eventTypes del Apéndice B', () => {
    expect(supportedEventTypesFrom(parseSmartCapabilities(ACUSENSE))).toEqual([
      'fielddetection',
      'linedetection',
      'facedetection',
      'regionEntrance',
    ]);
  });
});
