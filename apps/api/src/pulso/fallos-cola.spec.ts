import {
  CLAVES_MAX,
  FALLOS_COLA_MAX,
  clavesDe,
  devolverFallos,
  drenarFallosCola,
  fallosRecientes,
  registrarFalloCola,
  reiniciarFallosCola,
  totalFallosCola,
} from './fallos-cola';

const fallo = (extra: Partial<Parameters<typeof registrarFalloCola>[0]> = {}) =>
  registrarFalloCola({ cola: 'supplier.ct.sync', jobId: 'ct-sync-PRIMARY', intentos: 1, error: new Error('falló'), ...extra });

describe('fallos-cola', () => {
  beforeEach(() => reiniciarFallosCola());

  it('guarda el fallo y lo devuelve el más nuevo primero', () => {
    fallo({ jobId: 'a', ahoraMs: 1000 });
    fallo({ jobId: 'b', ahoraMs: 2000 });

    expect(fallosRecientes().map((f) => f.jobId)).toEqual(['b', 'a']);
    expect(fallosRecientes()[0]).toEqual({
      cola: 'supplier.ct.sync',
      jobId: 'b',
      intentos: 1,
      error: 'falló',
      claves: [],
      ocurridoMs: 2000,
    });
    expect(totalFallosCola()).toBe(2);
  });

  it('el anillo no pasa de 200: se va el más viejo, pero el total sigue contando', () => {
    for (let i = 0; i < FALLOS_COLA_MAX + 25; i++) fallo({ jobId: `j${i}`, ahoraMs: i });

    const guardados = fallosRecientes();
    expect(guardados).toHaveLength(FALLOS_COLA_MAX);
    expect(guardados[0]!.jobId).toBe(`j${FALLOS_COLA_MAX + 24}`);
    expect(guardados[guardados.length - 1]!.jobId).toBe('j25');
    expect(totalFallosCola()).toBe(FALLOS_COLA_MAX + 25);
  });

  it('el error sale saneado: una línea, sin correos, tokens ni números largos', () => {
    fallo({ error: new Error('\nNo se pudo enviar a ana.lopez@ejemplo.com.mx cuenta 123456789012\n  args: { secreto: 1 }') });

    const { error } = fallosRecientes()[0]!;
    expect(error).toBe('No se pudo enviar a [correo] cuenta #');
    expect(error).not.toContain('secreto');
  });

  it('acepta cualquier valor lanzado sin fallar', () => {
    expect(() => fallo({ error: undefined })).not.toThrow();
    expect(() => fallo({ error: 'texto suelto' })).not.toThrow();
    expect(() => fallo({ error: { message: 'objeto' } })).not.toThrow();
    expect(fallosRecientes().map((f) => f.error)).toEqual(['objeto', 'texto suelto', 'error sin detalle']);
  });

  it('las claves del payload se guardan sin valores', () => {
    const payload = { companyId: 'empresa-123', correo: 'ana@ejemplo.com', telefono: '2221234567' };
    fallo({ claves: clavesDe(payload) });

    const [guardado] = fallosRecientes();
    expect(guardado!.claves).toEqual(['companyId', 'correo', 'telefono']);
    expect(JSON.stringify(guardado)).not.toContain('empresa-123');
    expect(JSON.stringify(guardado)).not.toContain('ana@ejemplo.com');
    expect(JSON.stringify(guardado)).not.toContain('2221234567');
  });

  it('una llave que no parece un identificador (un correo como llave) se oculta', () => {
    expect(clavesDe({ 'ana@ejemplo.com': 1, ok: 2, 'con espacio': 3 })).toEqual(['[clave]', 'ok']);
    fallo({ claves: ['ana@ejemplo.com', 'ok', 42 as never] });
    expect(fallosRecientes()[0]!.claves).toEqual(['[clave]', 'ok']);
  });

  it('clavesDe topa el número de llaves y tolera lo que no es objeto', () => {
    const muchas = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, i]));
    expect(clavesDe(muchas)).toHaveLength(CLAVES_MAX);
    expect(clavesDe(null)).toEqual([]);
    expect(clavesDe(undefined)).toEqual([]);
    expect(clavesDe('texto')).toEqual([]);
    expect(clavesDe([1, 2, 3])).toEqual([]);
    const hostil = new Proxy({}, { ownKeys: () => { throw new Error('no'); } });
    expect(clavesDe(hostil)).toEqual([]);
  });

  it('drenar devuelve lo pendiente, la más vieja primero, y la segunda vez no devuelve nada', () => {
    fallo({ jobId: 'a', ahoraMs: 1 });
    fallo({ jobId: 'b', ahoraMs: 2 });

    expect(drenarFallosCola().map((f) => f.jobId)).toEqual(['a', 'b']);
    expect(drenarFallosCola()).toEqual([]);
    // Siguen visibles para quien solo lee.
    expect(fallosRecientes()).toHaveLength(2);

    fallo({ jobId: 'c', ahoraMs: 3 });
    expect(drenarFallosCola().map((f) => f.jobId)).toEqual(['c']);
  });

  it('si el volcado falla, devolver deja los fallos pendientes otra vez', () => {
    fallo({ jobId: 'a', ahoraMs: 1 });
    fallo({ jobId: 'b', ahoraMs: 2 });
    const entregados = drenarFallosCola();

    devolverFallos(entregados);

    expect(drenarFallosCola().map((f) => f.jobId)).toEqual(['a', 'b']);
  });

  it('lo que devuelve son copias: modificarlas no cambia el anillo', () => {
    fallo({ claves: ['uno'] });
    const [copia] = fallosRecientes();
    copia!.error = 'cambiado';
    copia!.claves.push('otra');

    expect(fallosRecientes()[0]!.error).toBe('falló');
    expect(fallosRecientes()[0]!.claves).toEqual(['uno']);
  });

  it('nunca lanza, ni con una entrada rota', () => {
    expect(() => registrarFalloCola(undefined as never)).not.toThrow();
    expect(registrarFalloCola(undefined as never)).toBeNull();
    const rara = registrarFalloCola({ cola: 'x', jobId: undefined, intentos: Number.NaN, error: null });
    expect(rara).toMatchObject({ cola: 'x', jobId: '', intentos: 0, error: 'error sin detalle' });
  });
});
