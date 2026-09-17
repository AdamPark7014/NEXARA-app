import { cifrasDePartidas, objetivoDePropuesta } from './objetivo-plantilla.js';
import {
  PAQUETES,
  bloqueAlcanceDePaquete,
  buscarPaquete,
  mezclarBloqueAlcance,
  partidasDePaquete,
} from './paquetes.js';
import { totalesPorGrupo } from './partidas-grupos.js';

describe('paquetes', () => {
  it('«Cámara bala instalada» lleva cámara, balún, adaptador, caja e instalación', () => {
    const paquete = buscarPaquete('camara-bala-instalada')!;
    expect(paquete).toBeTruthy();
    expect(paquete.partidas).toHaveLength(5);
    const grupos = paquete.partidas.map((p) => p.grupo);
    expect(grupos).toContain('EQUIPOS');
    expect(grupos).toContain('MATERIALES');
    expect(grupos).toContain('MANO_DE_OBRA');
  });

  it('N paquetes generan N de cada partida: no hay 15 cámaras con 14 instalaciones', () => {
    const paquete = buscarPaquete('camara-bala-instalada')!;
    const partidas = partidasDePaquete(paquete, 15);
    expect(partidas).toHaveLength(5);
    for (const partida of partidas) {
      expect(partida.qty).toBe(15 * paquete.partidas.find((p) => p.name === partida.name)!.qtyPorPaquete);
    }
    const camaras = partidas.find((p) => p.grupo === 'EQUIPOS')!;
    const instalacion = partidas.find((p) => p.grupo === 'MANO_DE_OBRA')!;
    expect(camaras.qty).toBe(instalacion.qty);
  });

  it('respeta las unidades por paquete (el poste lleva dos montajes)', () => {
    const paquete = buscarPaquete('poste-3m-instalado')!;
    const partidas = partidasDePaquete(paquete, 2);
    const montajes = partidas.find((p) => p.name.includes('Montaje'))!;
    expect(montajes.qty).toBe(4);
  });

  it('cada partida queda marcada con el paquete que la generó', () => {
    const partidas = partidasDePaquete(buscarPaquete('camara-domo-instalada')!, 3);
    expect(partidas.every((p) => p.paqueteClave === 'camara-domo-instalada')).toBe(true);
    expect(partidas.every((p) => p.paqueteCantidad === 3)).toBe(true);
  });

  it('el alcance cuadra con la cantidad cotizada', () => {
    const bloque = bloqueAlcanceDePaquete(buscarPaquete('camara-bala-instalada')!, 8);
    expect(bloque.texto).toContain('8 cámaras tipo bala');
    expect(bloque.parametros.cantidad).toBe(8);
  });

  it('agregar dos veces el mismo paquete deja un solo bloque de alcance', () => {
    const paquete = buscarPaquete('camara-bala-instalada')!;
    const uno = bloqueAlcanceDePaquete(paquete, 8);
    const dos = bloqueAlcanceDePaquete(paquete, 15);
    const bloques = mezclarBloqueAlcance(mezclarBloqueAlcance([], uno), dos);
    expect(bloques).toHaveLength(1);
    expect(bloques[0]!.texto).toContain('15 cámaras');
  });

  it('las partidas del paquete caen en los tres grupos con importe', () => {
    const totales = totalesPorGrupo(partidasDePaquete(buscarPaquete('camara-bala-instalada')!, 1));
    expect(totales.EQUIPOS).toBeCloseTo(592.42, 2);
    expect(totales.MATERIALES).toBeCloseTo(268.8, 2);
    expect(totales.MANO_DE_OBRA).toBeCloseTo(1000, 2);
  });

  it('todas las claves son únicas', () => {
    const claves = PAQUETES.map((p) => p.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });
});

describe('01 Objetivo con las cifras de la cotización', () => {
  const partidas = partidasDePaquete(buscarPaquete('camara-bala-instalada')!, 15);

  it('cuenta piezas e importes por grupo', () => {
    const cifras = cifrasDePartidas(partidas);
    expect(cifras.piezasEquipo).toBe(15);
    expect(cifras.serviciosManoObra).toBe(15);
    expect(cifras.piezasMaterial).toBe(45);
  });

  it('nombra la cantidad real de equipos nuevos', () => {
    const objetivo = objetivoDePropuesta({ segmento: 'COMERCIAL', partidas });
    expect(objetivo.beneficios.join(' ')).toContain('15 equipos nuevos');
  });

  it('no inventa beneficios cuando no hay cifra que los respalde', () => {
    const objetivo = objetivoDePropuesta({ segmento: 'COMERCIAL', partidas: [] });
    expect(objetivo.beneficios.join(' ')).not.toContain('equipos nuevos');
    expect(objetivo.beneficios.join(' ')).not.toContain('mano de obra especializada');
  });

  it('no pasa de ocho beneficios, como la propuesta modelo', () => {
    const objetivo = objetivoDePropuesta({
      segmento: 'COMERCIAL',
      partidas,
      vigenciaDias: 15,
      proyecto: 'Renovación de CCTV',
    });
    expect(objetivo.beneficios.length).toBeGreaterThan(0);
    expect(objetivo.beneficios.length).toBeLessThanOrEqual(8);
  });

  it('el texto que escribió quien cotiza manda sobre la plantilla', () => {
    const objetivo = objetivoDePropuesta({
      segmento: 'OBRA',
      partidas,
      objetivoLibre: 'Dejar el patio de maniobras cubierto.',
    });
    expect(objetivo.intro).toBe('Dejar el patio de maniobras cubierto.');
  });

  it('cada segmento tiene su propia entrada y cierre', () => {
    const comercial = objetivoDePropuesta({ segmento: 'COMERCIAL', partidas });
    const licitacion = objetivoDePropuesta({ segmento: 'LICITACION', partidas });
    expect(comercial.intro).not.toBe(licitacion.intro);
    expect(licitacion.cierre).toContain('bases');
  });
});
