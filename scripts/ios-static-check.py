#!/usr/bin/env python3
"""
Verificacion estatica del codigo Swift sin Mac.

Por que existe: la app iOS se escribe desde Windows y `xcodebuild` solo corre en
el runner de macOS. Entre que se escribe el codigo y que CI lo compila puede
pasar un dia entero, y errores triviales --un tipo declarado dos veces, un
`extension` sobre algo que no existe-- tumban la compilacion completa. Esto los
caza en segundos, aqui, sin Mac.

El 08-09-2026 encontro cinco redeclaraciones a nivel de fichero en un arbol de
45.000 lineas que nunca habia pasado por `xcodebuild`.

NO sustituye a `xcodebuild`. Caza la clase de fallo que mas aparece cuando
varios agentes escriben en paralelo sobre el mismo arbol.

Uso:  python scripts/ios-static-check.py [--json]
Sale con codigo 1 si encuentra algo que rompe la compilacion.
"""
import re
import os
import sys
import json
import collections

ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'apps', 'mobile-native', 'ios')

# Declaraciones a nivel de fichero (columna 0). Las anidadas dentro de un tipo o
# de una funcion van indentadas y NO colisionan entre si: por eso el ancla `^`
# sin espacios es lo que separa un fallo real de decenas de falsos positivos
# (`Body`, `Empty`, `Coordinator` aparecen decenas de veces, todos anidados).
#
# El modificador se captura a proposito: a nivel de fichero, `private` y
# `fileprivate` significan "visible solo en este fichero", asi que DOS ficheros
# pueden declarar `private struct EmptyBody` sin colisionar. Sin esta distincion
# el chequeo denuncia codigo perfectamente valido --paso el 08-09-2026 con
# `EmptyBody`, declarado privado en cuatro repositorios a la vez.
TOP_DECL = re.compile(
    r'^((?:public |internal |private |fileprivate |final |@\w+\s+)*)'
    r'(struct|class|enum|protocol|actor)\s+([A-Z]\w*)', re.M)

# Un `extension X` sobre un tipo que no existe tampoco compila.
EXT = re.compile(r'^extension\s+([A-Z]\w*)', re.M)

# Tipos del sistema sobre los que si es legitimo extender.
SYSTEM_TYPES = {
    'String', 'Int', 'Double', 'Bool', 'Date', 'Data', 'URL', 'Array', 'Set',
    'Dictionary', 'View', 'Color', 'Font', 'Image', 'Text', 'Button', 'List',
    'ScrollView', 'VStack', 'HStack', 'ZStack', 'NavigationStack', 'Binding',
    'NavigationView', 'State', 'EnvironmentObject', 'ObservableObject',
    'Published', 'UIImage', 'UIColor', 'UIViewController', 'UIView', 'Locale',
    'Notification', 'UserDefaults', 'FileManager', 'JSONDecoder', 'JSONEncoder',
    'DateFormatter', 'NumberFormatter', 'Calendar', 'URLSession', 'URLRequest',
    'HTTPURLResponse', 'Error', 'Result', 'Optional', 'Sequence', 'Collection',
    'Comparable', 'Equatable', 'Hashable', 'Identifiable', 'Codable',
    'Decodable', 'Encodable', 'CLLocation', 'CLLocationCoordinate2D',
    'MKCoordinateRegion', 'AVCaptureSession', 'Task', 'Bundle', 'ProcessInfo',
    'NSAttributedString', 'CGFloat', 'CGPoint', 'CGSize', 'CGRect', 'Character',
    'AnyView', 'EdgeInsets', 'Animation', 'Alignment', 'UIApplication',
    'TimeInterval', 'UUID', 'Timer', 'DispatchQueue', 'Numeric', 'Text',
    'BinaryFloatingPoint', 'BinaryInteger', 'StringProtocol', 'RandomAccessCollection',
}


def sin_texto(src):
    """Devuelve el fuente con cadenas y comentarios sustituidos por espacios.

    Contar llaves sobre el fuente crudo no sirve: `"}"` dentro de una cadena, o
    una llave en un comentario, desbalancean la cuenta y llenan el informe de
    ruido. Tambien hay que respetar la interpolacion de Swift --`\\(algo)`--,
    donde SI vuelve a haber codigo dentro de la cadena.
    """
    salida = []
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        # comentario de linea
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            while i < n and src[i] != chr(10):
                salida.append(' ')
                i += 1
            continue
        # comentario de bloque, anidable en Swift
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            nivel = 0
            while i < n:
                if src[i] == '/' and i + 1 < n and src[i + 1] == '*':
                    nivel += 1
                    salida.append('  ')
                    i += 2
                    continue
                if src[i] == '*' and i + 1 < n and src[i + 1] == '/':
                    nivel -= 1
                    salida.append('  ')
                    i += 2
                    if nivel == 0:
                        break
                    continue
                salida.append(chr(10) if src[i] == chr(10) else ' ')
                i += 1
            continue
        # cadena multilinea
        if src.startswith('"""', i):
            salida.append('   ')
            i += 3
            while i < n and not src.startswith('"""', i):
                salida.append(chr(10) if src[i] == chr(10) else ' ')
                i += 1
            salida.append('   ')
            i += 3
            continue
        # cadena normal, con interpolacion
        if c == '"':
            salida.append(' ')
            i += 1
            while i < n and src[i] != '"':
                if src[i] == chr(92) and i + 1 < n:
                    if src[i + 1] == '(':
                        # la interpolacion lleva codigo: se conserva tal cual
                        profundidad = 0
                        salida.append('  ')
                        i += 2
                        profundidad = 1
                        while i < n and profundidad > 0:
                            if src[i] == '(':
                                profundidad += 1
                            elif src[i] == ')':
                                profundidad -= 1
                                if profundidad == 0:
                                    salida.append(' ')
                                    i += 1
                                    break
                            salida.append(src[i])
                            i += 1
                        continue
                    salida.append('  ')
                    i += 2
                    continue
                salida.append(' ')
                i += 1
            salida.append(' ')
            i += 1
            continue
        salida.append(c)
        i += 1
    return ''.join(salida)


def desbalance(src):
    """(sobran_cierres, faltan_cierres) por cada tipo de delimitador."""
    pares = {'}': '{', ')': '(', ']': '['}
    pila = []
    sobra = []
    for pos, ch in enumerate(src):
        if ch in '{([':
            pila.append((ch, pos))
        elif ch in pares:
            if pila and pila[-1][0] == pares[ch]:
                pila.pop()
            else:
                sobra.append((ch, pos))
    return sobra, pila


def linea_de(src, pos):
    return src.count(chr(10), 0, pos) + 1


def swift_files():
    for dirpath, _dirnames, filenames in os.walk(ROOT):
        if 'DerivedData' in dirpath or '.build' in dirpath:
            continue
        for name in sorted(filenames):
            if name.endswith('.swift'):
                yield os.path.join(dirpath, name)


def rel(path):
    return os.path.relpath(path, ROOT).replace(os.sep, '/')


def analyze():
    declared = collections.defaultdict(list)
    extensions = collections.defaultdict(list)
    files = list(swift_files())

    desbalanceados = []

    for path in files:
        with open(path, encoding='utf-8', errors='ignore') as handle:
            src = handle.read()

        limpio = sin_texto(src)
        sobra, faltan = desbalance(limpio)
        if sobra or faltan:
            detalle = []
            for ch, pos in sobra[:3]:
                detalle.append("sobra '%s' en la linea %d" % (ch, linea_de(src, pos)))
            for ch, pos in faltan[:3]:
                detalle.append("falta cerrar '%s' abierto en la linea %d"
                               % (ch, linea_de(src, pos)))
            desbalanceados.append((rel(path), detalle))

        for modifiers, _kind, name in TOP_DECL.findall(src):
            file_scoped = 'private' in modifiers or 'fileprivate' in modifiers
            declared[name].append((rel(path), file_scoped))
        for name in EXT.findall(src):
            extensions[name].append(rel(path))

    problems = []

    # Un delimitador de mas cierra el tipo antes de tiempo y deja los
    # modificadores siguientes colgando. Paso el 08-09-2026 en
    # `PortalScreens.swift`: una llave sobrante tras `.toolbar` dejaba `.task` y
    # `.refreshable` fuera del `struct`. El chequeo de tipos no lo veia.
    for path, detalle in desbalanceados:
        problems.append({
            'kind': 'delimitadores',
            'symbol': path,
            'files': [path],
            'msg': '%s: %s' % (path, '; '.join(detalle)),
        })

    for name, where in sorted(declared.items()):
        # Solo chocan entre si las declaraciones visibles fuera del fichero.
        visible = [path for path, file_scoped in where if not file_scoped]
        if len(visible) > 1:
            problems.append({
                'kind': 'redeclaracion',
                'symbol': name,
                'files': visible,
                'msg': "'%s' se declara a nivel de fichero en %d sitios"
                       % (name, len(visible)),
            })

    for name, where in sorted(extensions.items()):
        if name not in declared and name not in SYSTEM_TYPES:
            problems.append({
                'kind': 'extension-huerfana',
                'symbol': name,
                'files': where,
                'msg': "`extension %s` pero '%s' no se declara en el proyecto"
                       % (name, name),
            })

    problems.extend(modulos_huerfanos())

    return files, declared, problems


# Cada lista del catalogo se enruta bajo un `ModuleRoutingPortal` concreto.
PORTAL_DE_LISTA = {
    'console': 'console', 'tickets': 'tickets', 'ventas': 'ventas',
    'contabilidad': 'contabilidad', 'studio': 'studio', 'lab': 'lab',
    'integra': 'integra',
}


def modulos_huerfanos():
    """Claves del catalogo que el router no resuelve.

    Es el fallo mas caro que ha tenido este proyecto: en Android llegaron a
    existir 13.438 lineas de pantallas que nadie podia abrir porque la clave no
    estaba en el NavHost. El catalogo las anunciaba, el menu las pintaba, y al
    tocarlas salia un placeholder. Aqui la comprobacion es barata: si una clave
    no tiene caso, cae en `default:` y el usuario ve una pantalla vacia.
    """
    catalogo = os.path.join(ROOT, 'NexaraApp', 'Catalog', 'ModuleCatalog.swift')
    router = os.path.join(ROOT, 'NexaraApp', 'UI', 'Modules', 'ModuleRouter.swift')
    if not (os.path.exists(catalogo) and os.path.exists(router)):
        return []

    with open(catalogo, encoding='utf-8', errors='ignore') as handle:
        cat = handle.read()
    with open(router, encoding='utf-8', errors='ignore') as handle:
        rt = handle.read()

    casos = set(re.findall(r'\(\.(\w+), "([^"]+)"\)', rt))
    # `case (.integra, let key)` delega el portal entero a otro grafo.
    delegados = {p for p, _ in re.findall(r'case \(\.(\w+), let (\w+)\)', rt)}

    huerfanas = []
    for nombre, cuerpo in re.findall(
            r'static let (\w+): \[ModuleEntry\] = \[(.*?)\n    \]', cat, re.S):
        portal = PORTAL_DE_LISTA.get(nombre)
        if not portal or portal in delegados:
            continue
        for clave in re.findall(r'ModuleEntry\("([^"]+)"', cuerpo):
            if (portal, clave) not in casos:
                huerfanas.append('%s/%s' % (portal, clave))

    if not huerfanas:
        return []
    return [{
        'kind': 'modulo-huerfano',
        'symbol': ', '.join(huerfanas),
        'files': ['NexaraApp/Catalog/ModuleCatalog.swift'],
        'msg': '%d clave(s) del catalogo sin caso en ModuleRouter, caen al '
               'placeholder: %s' % (len(huerfanas), ', '.join(huerfanas)),
    }]


def main():
    files, declared, problems = analyze()

    if '--json' in sys.argv:
        print(json.dumps(problems, ensure_ascii=False, indent=2))
        return 1 if problems else 0

    print('Ficheros Swift analizados: %d' % len(files))
    print('Tipos a nivel de fichero : %d' % len(declared))

    if not problems:
        print('')
        print('Sin problemas estructurales.')
        return 0

    rompen = [p for p in problems if p['kind'] != 'modulo-huerfano']
    huerfanos = [p for p in problems if p['kind'] == 'modulo-huerfano']

    print('')
    if rompen:
        print('%d problema(s) que rompen la compilacion:' % len(rompen))
    if huerfanos:
        # No rompen el build: rompen la pantalla. El usuario toca el modulo y ve
        # un placeholder. Decirlo como si fuera un error de compilacion seria
        # mentir sobre la gravedad, en los dos sentidos.
        print('%d aviso(s) de modulo inalcanzable (compila, pero no se abre):'
              % len(huerfanos))
    print('')
    for problem in problems:
        print('  [%s] %s' % (problem['kind'], problem['msg']))
        for path in problem['files']:
            print('      %s' % path)
    return 1


if __name__ == '__main__':
    sys.exit(main())
