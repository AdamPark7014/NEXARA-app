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

    for path in files:
        with open(path, encoding='utf-8', errors='ignore') as handle:
            src = handle.read()
        for modifiers, _kind, name in TOP_DECL.findall(src):
            file_scoped = 'private' in modifiers or 'fileprivate' in modifiers
            declared[name].append((rel(path), file_scoped))
        for name in EXT.findall(src):
            extensions[name].append(rel(path))

    problems = []

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

    return files, declared, problems


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

    print('')
    print('%d problema(s) que rompen la compilacion:' % len(problems))
    print('')
    for problem in problems:
        print('  [%s] %s' % (problem['kind'], problem['msg']))
        for path in problem['files']:
            print('      %s' % path)
    return 1


if __name__ == '__main__':
    sys.exit(main())
