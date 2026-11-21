#!/usr/bin/env bash
# Verifica que un commit compile ANTES de publicarlo o desplegarlo, sin tocar el checkout.
#
# Por qué existe (21-11-2026): en este checkout trabajan varias sesiones y el árbol local casi nunca es
# igual a origin/main. Un `tsc` local puede pasar con una función que solo existe en disco (sin publicar) y
# el build de producción fallar. Esto exporta el commit a una carpeta temporal y corre `tsc` ahí.
#
# Uso:  bash scripts/verificar-commit.sh <commit|rama> [api|web|todo] [base]   (por omisión: origin/main todo)
set -euo pipefail
COMMIT="${1:-origin/main}"
QUE="${2:-todo}"
RAIZ="$(git rev-parse --show-toplevel)"
TMP="$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}/verificar-$$")"
mkdir -p "$TMP"
limpiar() {
  # Primero los enlaces a node_modules (no se borra su contenido), luego la carpeta.
  for d in "$TMP/node_modules" "$TMP/apps/api/node_modules" "$TMP/apps/web/node_modules"; do
    [ -e "$d" ] && { cmd //c rmdir "$(cygpath -w "$d")" >/dev/null 2>&1 || rm -f "$d" 2>/dev/null || true; }
  done
  rm -rf "$TMP" 2>/dev/null || true
}
trap limpiar EXIT

enlazar() { # enlazar <origen> <destino>
  [ -d "$1" ] || return 0
  if command -v cygpath >/dev/null 2>&1; then
    cmd //c mklink //J "$(cygpath -w "$2")" "$(cygpath -w "$1")" >/dev/null
  else
    ln -s "$1" "$2"
  fi
}

echo "Verificando $(git rev-parse --short "$COMMIT") ($QUE) en $TMP"
git -C "$RAIZ" archive "$COMMIT" package.json tsconfig.base.json apps/api apps/web packages 2>/dev/null | tar -x -C "$TMP" \
  || git -C "$RAIZ" archive "$COMMIT" package.json apps/api apps/web | tar -x -C "$TMP"
enlazar "$RAIZ/node_modules" "$TMP/node_modules"
enlazar "$RAIZ/apps/api/node_modules" "$TMP/apps/api/node_modules"
enlazar "$RAIZ/apps/web/node_modules" "$TMP/apps/web/node_modules"

# Solo cuentan los errores en archivos que este commit cambia respecto a BASE (tercer argumento, por omisión
# el commit anterior). El cliente de Prisma que se usa es el generado en el checkout local: si el esquema del
# commit es distinto, saldrían errores falsos en archivos ajenos, y por eso se filtran.
BASE="${3:-$COMMIT~1}"
CAMBIADOS="$(git -C "$RAIZ" diff --name-only "$BASE" "$COMMIT" -- apps/api apps/web | sed 's#^apps/[a-z]*/##')"
revisar() { # revisar <carpeta> <tsconfig>
  local salida propios
  salida="$(cd "$TMP/apps/$1" && npx tsc --noEmit -p "$2" 2>&1 || true)"
  propios="$(printf '%s
' "$salida" | grep -F -f <(printf '%s
' "$CAMBIADOS" | sed '/^$/d') || true)"
  if [ -n "$propios" ]; then printf '%s
' "$propios"; return 1; fi
  echo "   sin errores en los $(printf '%s
' "$CAMBIADOS" | sed '/^$/d' | wc -l) archivos del commit ($(printf '%s
' "$salida" | grep -c 'error TS' || true) ajenos o de Prisma local, ignorados)"
}
falla=0
if [ -z "$CAMBIADOS" ]; then echo "El commit no toca apps/api ni apps/web"; exit 0; fi
if [ "$QUE" = "api" ] || [ "$QUE" = "todo" ]; then
  echo "== API: tsc"
  revisar api tsconfig.json || falla=1
fi
if [ "$QUE" = "web" ] || [ "$QUE" = "todo" ]; then
  echo "== Web: tsc"
  CFG=tsconfig.json; [ -f "$TMP/apps/web/tsconfig.build.json" ] && CFG=tsconfig.build.json
  revisar web "$CFG" || falla=1
fi
[ "$falla" = 0 ] && echo "OK: $(git rev-parse --short "$COMMIT") compila" || { echo "FALLA: $(git rev-parse --short "$COMMIT") no compila"; exit 1; }
