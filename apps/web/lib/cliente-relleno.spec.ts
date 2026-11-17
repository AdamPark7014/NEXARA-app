import { esNombreDeRelleno, mensajeAlertaClienteRelleno, atencionPorOmision } from './cliente-relleno'

describe('esNombreDeRelleno', () => {
    const casosVerdaderos = ['N/a', 'A QUIEN CORRESPONDA', 'aqc', 'no aplica', 'publico en general', 'sin cliente', '']
    
    test('devuelve true para nombres de relleno válidos', () => {
        for (const nombre of casosVerdaderos) {
            expect(esNombreDeRelleno(nombre)).toBe(true)
        }
    })

    const casosFalsos = ['BUAP', 'IPADE', 'Administración de BUAP', 'La Comer']
    
    test('devuelve false para nombres de empresa específicos', () => {
        for (const nombre of casosFalsos) {
            expect(esNombreDeRelleno(nombre)).toBe(false)
        }
    })
})

describe('mensajeAlertaClienteRelleno', () => {
    test('genera mensaje correcto para "no aplica"', () => {
        const mensaje = mensajeAlertaClienteRelleno('no aplica')
        expect(mensaje).toContain('No se puede poner "no aplica"')
        expect(mensaje).toMatch(/Administración de <empresa>/)
    })
})

describe('atencionPorOmision', () => {
    test('obtiene nombre administrativo correcto para BUAP', () => {
        expect(atencionPorOmision('BUAP')).toBe('Administración de BUAP')
    })

    test('devuelve cadena vacía para entrada vacía con espacios', () => {
        expect(atencionPorOmision('  ')).toBe('')
    })
})