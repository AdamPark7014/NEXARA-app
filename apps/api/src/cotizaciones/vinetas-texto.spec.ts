import { normalizarLista, segmentosLista, traeVineta } from './vinetas-texto.js';

describe('viñetas de una partida', () => {
  it('separa las viñetas que vienen en la misma línea y deja el encabezado como párrafo', () => {
    const texto =
      'Disco duro Con las siguientes características: • Subcategoría: Unidad de estado sólido. • Generación: SSD SAS. • Uso mixto.';
    expect(segmentosLista(texto)).toEqual([
      { tipo: 'parrafo', texto: 'Disco duro Con las siguientes características:' },
      { tipo: 'vineta', texto: 'Subcategoría: Unidad de estado sólido.' },
      { tipo: 'vineta', texto: 'Generación: SSD SAS.' },
      { tipo: 'vineta', texto: 'Uso mixto.' },
    ]);
  });

  it('también parte un guion o un asterisco con espacios, y no parte Wi-Fi ni -20°C', () => {
    expect(segmentosLista('Access Point - Colocación: Techo. - Botón de reset.')).toEqual([
      { tipo: 'parrafo', texto: 'Access Point' },
      { tipo: 'vineta', texto: 'Colocación: Techo.' },
      { tipo: 'vineta', texto: 'Botón de reset.' },
    ]);
    expect(segmentosLista('* Alimentación PoE * Montaje en bastidor')).toEqual([
      { tipo: 'vineta', texto: 'Alimentación PoE' },
      { tipo: 'vineta', texto: 'Montaje en bastidor' },
    ]);
    expect(segmentosLista('Radio Wi-Fi 6E de -20°C a 50°C')).toEqual([
      { tipo: 'parrafo', texto: 'Radio Wi-Fi 6E de -20°C a 50°C' },
    ]);
  });

  it('respeta los saltos que ya trae el texto', () => {
    expect(segmentosLista('Título\n• Una\n• Dos')).toEqual([
      { tipo: 'parrafo', texto: 'Título' },
      { tipo: 'vineta', texto: 'Una' },
      { tipo: 'vineta', texto: 'Dos' },
    ]);
  });

  it('al pegar, cada viñeta queda en su renglón', () => {
    expect(normalizarLista('Cable • Conector macho • Forma de enchufe')).toBe(
      'Cable\n• Conector macho\n• Forma de enchufe',
    );
    expect(traeVineta('sin viñetas')).toBe(false);
    expect(traeVineta('Cable • Conector')).toBe(true);
    expect(traeVineta('Wi-Fi 6')).toBe(false);
  });
});
