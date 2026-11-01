import {
  TOPE_CANDIDATOS_IA,
  candidatosParaIa,
  limpiarLiga,
  peticionLiga,
  sugerirPorReglas,
  type Candidato,
} from './sugerir-liga';

const CANDIDATOS: Candidato[] = [
  { tipo: 'PROYECTO', id: 1, nombre: 'CCTV Bodega Norte', clientId: 10, cliente: 'Bodegas Luna' },
  { tipo: 'PROYECTO', id: 2, nombre: 'Red Plaza Sur', clientId: 11, cliente: 'Hospital San Rafael' },
  { tipo: 'COTIZACION', id: 42, nombre: 'NEX-0042 Control de acceso', clientId: 12, cliente: 'Colegio Andes' },
];

describe('sugerencia por reglas', () => {
  it('la actividad comercial de una cotización va a esa cotización', () => {
    const s = sugerirPorReglas({ titulo: 'Armar propuesta', cotizacionId: 42 }, CANDIDATOS);
    expect(s).toMatchObject({ tipo: 'COTIZACION', id: 42, fuente: 'REGLA' });
  });

  it('mismo cliente con un solo candidato', () => {
    const s = sugerirPorReglas({ titulo: 'Revisar cámaras', clientId: 10 }, CANDIDATOS);
    expect(s).toMatchObject({ tipo: 'PROYECTO', id: 1, motivo: 'Es del mismo cliente' });
  });

  it('el título nombra al cliente, sin acentos ni mayúsculas', () => {
    const s = sugerirPorReglas({ titulo: 'Tender fibra en HOSPITAL san rafael' }, CANDIDATOS);
    expect(s).toMatchObject({ tipo: 'PROYECTO', id: 2 });
  });

  it('dos proyectos del mismo cliente no se resuelven por regla', () => {
    const dos: Candidato[] = [
      { tipo: 'PROYECTO', id: 1, nombre: 'CCTV Norte', clientId: 10 },
      { tipo: 'PROYECTO', id: 2, nombre: 'Red Sur', clientId: 10 },
    ];
    expect(sugerirPorReglas({ titulo: 'Revisar equipo', clientId: 10 }, dos)).toBeNull();
  });

  it('ordenar la bodega es interno', () => {
    expect(sugerirPorReglas({ titulo: 'Ordenar la bodega' }, [])).toMatchObject({ tipo: 'INTERNA', id: null });
  });

  it('instalar cámaras en la bodega de alguien no es interno', () => {
    expect(sugerirPorReglas({ titulo: 'Instalar cámaras en la bodega' }, [])).toBeNull();
  });

  it('con cliente no se manda a interno', () => {
    expect(sugerirPorReglas({ titulo: 'Capacitación al personal', clientId: 99 }, [])).toBeNull();
  });

  it('el vocabulario del giro no liga: una guía de cableado no es la cotización de cableado', () => {
    const lista: Candidato[] = [{ tipo: 'COTIZACION', id: 19, nombre: 'NEX-0019 · Propuesta técnica cableado estructurado', cliente: 'Colegio Andes' }];
    expect(sugerirPorReglas({ titulo: 'Guía mejores prácticas cableado estructurado' }, lista)).toBeNull();
  });

  it('el nombre propio del trabajo sí liga, aunque el resto sea del giro', () => {
    const lista: Candidato[] = [{ tipo: 'PROYECTO', id: 7, nombre: 'Renovación CCTV Bodega Ipade', cliente: 'Ipade' }];
    expect(sugerirPorReglas({ titulo: 'Dibujo de cámaras IPADE nivel 3' }, lista)).toMatchObject({ tipo: 'PROYECTO', id: 7 });
  });

  it('compartir un cliente de relleno no dice nada', () => {
    const lista: Candidato[] = [{ tipo: 'COTIZACION', id: 3, nombre: 'NEX-0003 · Suministro', clientId: 5, cliente: 'A QUIEN CORRESPONDA' }];
    const s = sugerirPorReglas(
      { titulo: 'Configurar equipos', clientId: 5, cliente: 'A QUIEN CORRESPONDA', lugar: 'A QUIEN CORRESPONDA' },
      lista,
    );
    expect(s).toBeNull();
  });

  it('con cliente de relleno sí puede ser interno', () => {
    const s = sugerirPorReglas(
      { titulo: 'Descarga de CFDI de ingresos', clientId: 5, cliente: 'A quien corresponda', lugar: 'A quien corresponda' },
      [],
    );
    expect(s).toMatchObject({ tipo: 'INTERNA' });
  });

  it('sin señales no adivina', () => {
    expect(sugerirPorReglas({ titulo: 'Revisar pendiente' }, CANDIDATOS)).toBeNull();
  });
});

describe('lo que responde la IA', () => {
  it('acepta un candidato real', () => {
    expect(limpiarLiga({ tipo: 'PROYECTO', id: 2, motivo: 'dice plaza sur' }, CANDIDATOS)).toMatchObject({
      tipo: 'PROYECTO',
      id: 2,
      nombre: 'Red Plaza Sur',
      fuente: 'IA',
    });
  });

  it('un id inventado no pasa', () => {
    expect(limpiarLiga({ tipo: 'PROYECTO', id: 999, motivo: 'x' }, CANDIDATOS)).toBeNull();
  });

  it('un id de otro tipo no pasa', () => {
    expect(limpiarLiga({ tipo: 'COTIZACION', id: 1, motivo: 'x' }, CANDIDATOS)).toBeNull();
  });

  it('NINGUNA no es sugerencia', () => {
    expect(limpiarLiga({ tipo: 'NINGUNA', id: null, motivo: 'no se sabe' }, CANDIDATOS)).toBeNull();
    expect(limpiarLiga(null, CANDIDATOS)).toBeNull();
  });

  it('INTERNA no necesita id', () => {
    expect(limpiarLiga({ tipo: 'INTERNA', id: 5, motivo: 'admin' }, CANDIDATOS)).toMatchObject({ tipo: 'INTERNA', id: null });
  });
});

describe('petición a la IA', () => {
  it('manda los candidatos con su tipo e id', () => {
    const p = peticionLiga({ titulo: 'Revisar', lugar: 'Puebla' }, CANDIDATOS);
    expect(p.usuario).toContain('PROYECTO 1: CCTV Bodega Norte (cliente: Bodegas Luna)');
    expect(p.usuario).toContain('Lugar o cliente: Puebla');
    expect(p.modelo).toBe('claude-haiku-5-5');
  });

  it('no manda de más: los candidatos más parecidos primero, con tope', () => {
    const muchos: Candidato[] = Array.from({ length: 40 }, (_, i) => ({
      tipo: 'PROYECTO' as const,
      id: i + 1,
      nombre: i === 30 ? 'Fibra Hospital' : `Proyecto ${i}`,
    }));
    const r = candidatosParaIa({ titulo: 'Tender fibra en el hospital' }, muchos);
    expect(r).toHaveLength(TOPE_CANDIDATOS_IA);
    expect(r[0].id).toBe(31);
  });
});
