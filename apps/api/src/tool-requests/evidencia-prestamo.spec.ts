import {
  MAX_FOTOS_EVIDENCIA,
  normalizarCondicion,
  normalizarFotosEvidencia,
  resolverDevolucion,
  resumenEvidencia,
} from './evidencia-prestamo.js';

const FOTO = [{ url: '/uploads/tools/evidencia/a.jpg' }];

describe('evidencia de un préstamo de herramienta', () => {
  describe('condición de la devolución', () => {
    it('acepta la condición con o sin acento y en minúsculas', () => {
      expect(normalizarCondicion('dañada')).toBe('DANADA');
      expect(normalizarCondicion(' bien ')).toBe('BIEN');
      expect(normalizarCondicion('rota')).toBeNull();
    });

    it('una app anterior sin condición ni daño devuelve en buen estado, sin exigir foto', () => {
      const r = resolverDevolucion({ fotos: [] });
      expect(r).toMatchObject({ condicion: 'BIEN', estatusPrestamo: 'RETURNED', estatusPieza: 'AVAILABLE' });
    });

    it('una app anterior con descripción de daño la deja dañada y en reparación', () => {
      const r = resolverDevolucion({ descripcion: 'Pantalla rota', fotos: [] });
      expect(r).toMatchObject({ condicion: 'DANADA', estatusPrestamo: 'DAMAGED', estatusPieza: 'IN_REPAIR' });
      expect(r.descripcion).toBe('Pantalla rota');
    });

    it('con condición explícita, sin foto no se recibe', () => {
      expect(() => resolverDevolucion({ condicion: 'BIEN', fotos: [] })).toThrow(/foto de cómo vuelve/);
    });

    it('lo que no vuelve bien se explica', () => {
      expect(() => resolverDevolucion({ condicion: 'DANADA', fotos: FOTO })).toThrow(/Describe qué le pasó/);
      expect(() => resolverDevolucion({ condicion: 'INCOMPLETA', fotos: FOTO })).toThrow(/Describe qué le pasó/);
    });

    it('el desgaste normal vuelve disponible y no pide explicación', () => {
      const r = resolverDevolucion({ condicion: 'DESGASTE', fotos: FOTO });
      expect(r).toMatchObject({ estatusPrestamo: 'RETURNED', estatusPieza: 'AVAILABLE', descripcion: null });
    });

    it('incompleta queda fuera de servicio hasta revisarla', () => {
      const r = resolverDevolucion({ condicion: 'INCOMPLETA', descripcion: 'Falta la punta roja', fotos: FOTO });
      expect(r).toMatchObject({ estatusPrestamo: 'DAMAGED', estatusPieza: 'IN_REPAIR' });
    });

    it('la extraviada no pide foto, se da de baja y guarda el motivo', () => {
      const r = resolverDevolucion({ condicion: 'EXTRAVIADA', descripcion: 'Se quedó en la obra', fotos: [] });
      expect(r).toMatchObject({ estatusPrestamo: 'DAMAGED', estatusPieza: 'RETIRED' });
      expect(r.motivoBaja).toBe('Extraviada en préstamo: Se quedó en la obra');
    });

    it('la extraviada sin explicación no pasa', () => {
      expect(() => resolverDevolucion({ condicion: 'EXTRAVIADA', fotos: [] })).toThrow(/Describe qué le pasó/);
    });

    it('una condición que no existe no se guarda como buena', () => {
      expect(() => resolverDevolucion({ condicion: 'MAS_O_MENOS', fotos: FOTO })).toThrow(/en qué estado vuelve/);
    });
  });

  describe('fotos', () => {
    it('descarta base64 y respeta el tope', () => {
      const muchas = Array.from({ length: 10 }, (_, i) => ({ url: `/uploads/tools/evidencia/${i}.jpg` }));
      expect(normalizarFotosEvidencia(muchas)).toHaveLength(MAX_FOTOS_EVIDENCIA);
      expect(normalizarFotosEvidencia([{ url: 'data:image/png;base64,AAAA' }])).toEqual([]);
      expect(normalizarFotosEvidencia('no es lista')).toEqual([]);
    });
  });

  describe('resumen para las listas', () => {
    it('marca la entrega sin foto solo cuando ya se entregó', () => {
      expect(resumenEvidencia({ status: 'APPROVED' }).faltaFotoEntrega).toBe(false);
      expect(resumenEvidencia({ status: 'IN_USE' }).faltaFotoEntrega).toBe(true);
      expect(resumenEvidencia({ status: 'IN_USE', deliveryPhotos: FOTO })).toMatchObject({
        fotosEntrega: 1,
        faltaFotoEntrega: false,
        faltaFotoDevolucion: false,
      });
    });

    it('marca la devolución sin foto cuando ya volvió', () => {
      const r = resumenEvidencia({ status: 'RETURNED', deliveryPhotos: FOTO });
      expect(r.faltaFotoDevolucion).toBe(true);
      expect(resumenEvidencia({ status: 'DAMAGED', deliveryPhotos: FOTO, returnPhotos: FOTO }).faltaFotoDevolucion).toBe(false);
    });
  });
});
