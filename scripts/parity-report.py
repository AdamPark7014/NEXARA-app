#!/usr/bin/env python3
"""
Paridad medida, no declarada: web vs Android vs iOS.

`docs/native-parity-matrix.md` se escribe a mano y ha mentido varias veces --el
31-08 marcaba 68 modulos en verde con 13 de solo lectura y 3 inalcanzables--.
Esto no pregunta al documento: cuenta que endpoints de la API consume de verdad
cada cliente, leyendo el codigo fuente.

Un endpoint que solo aparece en la web es una funcion que el usuario tiene en el
navegador y no tiene en el telefono. Esa es la unidad de medida.

Limitaciones, dichas de frente:
  - Mide superficie de API consumida, no calidad de la pantalla. Una pantalla
    que solo lista y no deja editar consume el mismo GET.
  - **Solo ve la ruta cuando es un literal pegado al helper.** Si el codigo hace
    `let ruta = esSucursal ? "branch-portal/tickets" : "client-portal/tickets"`
    y luego llama `get(ruta)`, este informe dice que ese endpoint NO existe. Paso
    de verdad: `TicketsRepository` armaba asi 20 rutas y el informe las daba por
    ausentes, inventando un hueco de 26 endpoints donde solo habia 8. Si un
    hueco te sorprende, comprueba a mano antes de mandar a nadie a taparlo.
  - La lista de helpers de arriba tiene que estar completa. Cuando faltaban
    `postJSON` y `getBinary`, el informe afirmaba que la app iOS no tenia
    `auth/login`.
  - Normaliza los identificadores a `:id`, asi que `users/1` y `users/2` cuentan
    como el mismo endpoint.

Uso:
  python scripts/parity-report.py                 # resumen por familia
  python scripts/parity-report.py --falta ios     # que tiene Android y no iOS
  python scripts/parity-report.py --falta apps    # que tiene la web y ninguna app
  python scripts/parity-report.py --json
"""
import re
import os
import sys
import json
import collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Cada cliente llama a la API con su propia convencion.
#
# La primera version de esto solo miraba `get(`/`post(` en Swift y se dejaba
# fuera `postJSON(`, `patchJSON(`, `postMap(`... Resultado: decia que iOS no
# tenia `auth/login`, en una app que obviamente inicia sesion. Si esta lista se
# queda corta, el informe inventa huecos que no existen.
PATRONES = {
    'web': (
        ('apps/web', ('.ts', '.tsx')),
        [r'apiFetch\(\s*[`"\']([^`"\']+)'],
    ),
    'android': (
        ('apps/mobile-native/android/app/src/main', ('.kt',)),
        [r'@(?:GET|POST|PATCH|PUT|DELETE)\("([^"]+)"'],
    ),
    'ios': (
        ('apps/mobile-native/ios', ('.swift',)),
        [r'\b(?:get|post|patch|put|delete|getJSON|postJSON|patchJSON|putJSON'
         r'|deleteJSON|postMap|postEmpty|postVoid|patchVoid|deleteVoid|send'
         r'|sendJSON|request|upload|download|load|getBinary|uploadMultipart'
         r'|uploadMultipartFiles)\(\s*"([^"]+)"'],
    ),
}

IGNORAR_DIR = ('node_modules', 'DerivedData', '.next', 'dist')

# Un `${...}` PRECEDIDO de barra es un identificador de ruta: `users/${id}/hr`.
# Pegado a la palabra anterior no lo es: `newsletter${qs}` es la lista con su
# cadena de consulta. Meterlos en el mismo saco fabricaba endpoints fantasma
# --`newsletter:id`, `procurement/goods-receipts:id`,
# `client-ticket-requests:id`-- que luego figuraban como huecos de las apps.
INTERPOLACION_JS = re.compile(r'(?<=/)\$\{[^}]*\}')
SUFIJO_JS = re.compile(r'\$\{[^}]*\}')
INTERPOLACION_SWIFT = re.compile(re.escape(chr(92)) + r'\([^)]*\)')
PARAM_RETROFIT = re.compile(r'\{[A-Za-z_]+\}')
NUMERO_EN_RUTA = re.compile(r'/\d+(?=/|$)')
RUTA_VALIDA = re.compile(r'^[a-z][a-z0-9/:._-]*$')


def ficheros(rel, extensiones):
    base = os.path.join(ROOT, rel)
    for dirpath, _dirnames, filenames in os.walk(base):
        partes = dirpath.split(os.sep)
        if any(x in dirpath for x in IGNORAR_DIR) or 'build' in partes:
            continue
        for name in sorted(filenames):
            if name.endswith(extensiones):
                yield os.path.join(dirpath, name)


def normalizar(ruta):
    ruta = INTERPOLACION_JS.sub(':id', ruta)
    ruta = SUFIJO_JS.sub('', ruta)
    ruta = INTERPOLACION_SWIFT.sub(':id', ruta)
    ruta = PARAM_RETROFIT.sub(':id', ruta)
    ruta = ruta.split('?')[0].strip('/')
    return NUMERO_EN_RUTA.sub('/:id', ruta)


def recolectar(rel, extensiones, patrones):
    encontrados = set()
    for path in ficheros(rel, extensiones):
        with open(path, encoding='utf-8', errors='ignore') as handle:
            src = handle.read()
        for patron in patrones:
            for match in re.finditer(patron, src):
                ruta = normalizar(match.group(1))
                if RUTA_VALIDA.match(ruta):
                    encontrados.add(ruta)
    return encontrados


def medir():
    return {
        nombre: recolectar(rel, exts, pats)
        for nombre, ((rel, exts), pats) in PATRONES.items()
    }


def familia(ruta):
    return ruta.split('/')[0]


def main():
    datos = medir()
    web, android, ios = datos['web'], datos['android'], datos['ios']

    falta_ios = android - ios
    falta_android = ios - android
    falta_apps = web - android - ios

    if '--json' in sys.argv:
        print(json.dumps({
            'totales': {k: len(v) for k, v in datos.items()},
            'android_sin_ios': sorted(falta_ios),
            'ios_sin_android': sorted(falta_android),
            'web_sin_apps': sorted(falta_apps),
        }, ensure_ascii=False, indent=2))
        return 0

    if '--falta' in sys.argv:
        cual = sys.argv[sys.argv.index('--falta') + 1]
        objetivo = {'ios': falta_ios, 'android': falta_android,
                    'apps': falta_apps}[cual]
        porfam = collections.defaultdict(list)
        for ruta in sorted(objetivo):
            porfam[familia(ruta)].append(ruta)
        for fam in sorted(porfam, key=lambda f: -len(porfam[f])):
            print('%s (%d)' % (fam, len(porfam[fam])))
            for ruta in porfam[fam]:
                print('    %s' % ruta)
        return 0

    print('Endpoints distintos consumidos por cada cliente')
    print('  web      %4d' % len(web))
    print('  android  %4d' % len(android))
    print('  ios      %4d' % len(ios))
    print()
    print('Huecos')
    print('  la web tiene y NINGUNA app          %4d' % len(falta_apps))
    print('  Android tiene y iOS no              %4d' % len(falta_ios))
    print('  iOS tiene y Android no              %4d' % len(falta_android))
    print()

    familias = sorted(set(map(familia, web | android | ios)))
    filas = []
    for fam in familias:
        w = len([r for r in web if familia(r) == fam])
        a = len([r for r in android if familia(r) == fam])
        i = len([r for r in ios if familia(r) == fam])
        filas.append((fam, w, a, i))

    print('%-26s %5s %5s %5s   %s' % ('familia', 'web', 'and', 'ios', 'hueco'))
    for fam, w, a, i in sorted(filas, key=lambda f: -(f[1] - min(f[2], f[3]))):
        hueco = w - min(a, i)
        if hueco > 0:
            print('%-26s %5d %5d %5d   +%d' % (fam, w, a, i, hueco))
    return 0


if __name__ == '__main__':
    sys.exit(main())
