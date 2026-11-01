import { puntosPorOmision } from './alcance-por-omision.js';

const pieza = (name: string, extra: Record<string, unknown> = {}) => ({ name, unit: 'Pieza', qty: 1, unitPrice: 100, ...extra });

describe('puntos por omisión de la cotización', () => {
  it('una obra de CCTV completa trae los títulos del diseño', () => {
    const titulos = puntosPorOmision([
      pieza('Cámara domo IP 4 MP', { model: 'DS-2CD' }),
      pieza('NVR 32 canales', { model: 'DS-7632' }),
      pieza('UPS 1000 VA'),
      pieza('Tubo conduit 1"', { unit: 'Metro' }),
    ]).map((b) => b.titulo);
    expect(titulos).toEqual([
      'Justificación tecnológica',
      'Beneficios de la canalización industrial',
      'Especificación funcional de las cámaras seleccionadas',
      'Centro de monitoreo, almacenamiento y respaldo eléctrico online',
    ]);
  });

  it('siempre son cuatro, pero una venta de licencias no promete cámaras, canalización ni monitoreo', () => {
    const bloques = puntosPorOmision([pieza('Licencia de software BioTime', { unit: 'Licencia' })]);
    expect(bloques).toHaveLength(4);
    const todo = JSON.stringify(bloques.map(({ titulo, texto, vinetas }) => ({ titulo, texto, vinetas })));
    expect(todo).not.toMatch(/cámaras|canalización|monitoreo|UPS|equipos/);
    expect(bloques[2]!.titulo).toBe('Especificación funcional de las licencias seleccionadas');
  });

  it('sin UPS no ofrece respaldo eléctrico', () => {
    const [, , , monitoreo] = puntosPorOmision([pieza('DVR 8 canales')]);
    expect(monitoreo!.titulo).toBe('Centro de monitoreo y almacenamiento');
    expect(JSON.stringify(monitoreo)).not.toContain('Respaldo');
  });

  it('la especificación sale de las partidas: los cinco equipos de más peso, con su modelo real', () => {
    const partidas = Array.from({ length: 7 }, (_, i) => pieza(`Equipo ${i + 1}`, { model: `M-${i + 1}`, unitPrice: 100 * (i + 1) }));
    const [, , especificacion] = puntosPorOmision([...partidas, pieza('Instalación', { unit: 'Servicio' })]);
    expect(especificacion!.vinetas).toEqual(['M-7: Equipo 7', 'M-6: Equipo 6', 'M-5: Equipo 5', 'M-4: Equipo 4', 'M-3: Equipo 3']);
  });

  it('sin partidas no inventa equipos', () => {
    const [, , especificacion] = puntosPorOmision([]);
    expect(especificacion!.vinetas).toEqual([]);
    expect(especificacion!.texto).toContain('se detallan en la propuesta económica');
    expect(puntosPorOmision(null)).toHaveLength(4);
  });

  it('un nombre muy largo se corta en una palabra completa', () => {
    const largo = `Domo IP ${'con muchas características '.repeat(10)}`;
    const [, , especificacion] = puntosPorOmision([pieza(largo)]);
    expect(especificacion!.vinetas[0]!.length).toBeLessThanOrEqual(111);
    expect(especificacion!.vinetas[0]).toMatch(/[a-záéíóúñ]…$/);
  });
});
