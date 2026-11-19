import { inferirAyudantes, inferirCupo, inferirHerramientas } from './inferencias-asignacion';

const personas = [
  { id: 1, nombre: 'Antonio Ruiz' },
  { id: 2, nombre: 'Juan Pérez' },
  { id: 3, nombre: 'Pedro López' },
  { id: 8, nombre: 'Carolina Pérez' },
];

describe('inferencias-asignacion', () => {
  describe('inferirAyudantes', () => {
    it('propone a Juan y Pedro cuando van con Antonio', () => {
      expect(inferirAyudantes('que Antonio vaya con Juan y Pedro a Tox', personas, 1)).toEqual([
        { id: 2, nombre: 'Juan Pérez' },
        { id: 3, nombre: 'Pedro López' },
      ]);
    });

    it('sin señal de acompañamiento no inventa ayudantes', () => {
      expect(inferirAyudantes('que Juan revise las cámaras', personas, 2)).toEqual([]);
    });
  });

  describe('inferirHerramientas', () => {
    it('lee escalera y taladro de la frase', () => {
      expect(inferirHerramientas('lleva la escalera y el taladro')).toEqual([
        { descripcion: 'Escalera', cantidad: 1 },
        { descripcion: 'Taladro con brocas', cantidad: 1 },
      ]);
    });

    it('respeta la cantidad dicha', () => {
      expect(inferirHerramientas('lleva 2 escaleras')).toEqual([{ descripcion: 'Escalera', cantidad: 2 }]);
    });

    it('empareja nombres del catálogo', () => {
      expect(inferirHerramientas('lleva la cortadora de tubo', [{ nombre: 'Cortadora de tubo' }])).toEqual([
        { descripcion: 'Cortadora de tubo', cantidad: 1 },
      ]);
    });
  });

  describe('inferirCupo', () => {
    it('lee cupo de personas, equipo y la palabra cupo', () => {
      expect(inferirCupo('despacho a Luis con 3 personas')).toBe(3);
      expect(inferirCupo('equipo de 4')).toBe(4);
      expect(inferirCupo('cupo 2')).toBe(2);
    });

    it('sin cifra de personas queda null', () => {
      expect(inferirCupo('revisar cámaras')).toBeNull();
    });
  });
});
