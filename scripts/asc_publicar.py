#!/usr/bin/env python3
"""Publica una versión de NEXARA iOS en App Store Connect por la API (sin abrir la consola).

Uso (py -3.12):
  scripts/asc_publicar.py estado                       versiones y su estado
  scripts/asc_publicar.py builds                       últimos builds subidos
  scripts/asc_publicar.py preparar 1.4.1 17 "Novedades"  crea la versión, liga el build, pone novedades
  scripts/asc_publicar.py enviar 1.4.1                 la manda a revisión (sale sola al aprobarse)

La versión nueva hereda ficha, capturas y datos de revisión de la anterior. Antes de enviar,
revisar la lista de `docs/store/IOS-RESPUESTA-APPLE.md`.

Llave: la `.p8` y el Issuer ID de ASC_SECRETS (por omisión C:/dev/secrets/arta-ios, que ve el equipo
de NEXARA). Nunca se imprimen. Un 403 `REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED` significa que el titular
debe aceptar el contrato nuevo en developer.apple.com/account (no en Negocio de ASC); tras aceptarlo,
la API tardó ~30 min en abrirse (14-11-2026).
"""
from __future__ import annotations

import glob
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_apple_id import make_jwt  # noqa: E402

APP_ID = "6814597698"
SEC = os.environ.get("ASC_SECRETS", r"C:/dev/secrets/arta-ios")


def _token() -> str:
    p8 = glob.glob(os.path.join(SEC, "*.p8"))[0]
    kid = os.path.basename(p8).split("_", 1)[1].rsplit(".", 1)[0]
    iss_file = [f for f in glob.glob(os.path.join(SEC, "*.txt")) if "iss" in os.path.basename(f).lower()][0]
    with open(iss_file, encoding="utf-8") as fh:
        iss = fh.read().strip()
    return make_jwt(p8, kid, iss)


_TOK: str | None = None


def call(method: str, path: str, body: dict | None = None) -> dict:
    global _TOK
    _TOK = _TOK or _token()
    url = path if path.startswith("http") else "https://api.appstoreconnect.apple.com" + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + _TOK)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}: {e.read().decode()[:800]}")


def versiones() -> list[tuple[str, str, str]]:
    d = call("GET", f"/v1/apps/{APP_ID}/appStoreVersions?filter[platform]=IOS&limit=5")
    return [(v["id"], v["attributes"]["versionString"], v["attributes"]["appStoreState"]) for v in d["data"]]


def builds() -> list[tuple[str, str | None, str, str, str]]:
    d = call("GET", f"/v1/builds?filter[app]={APP_ID}&sort=-uploadedDate&limit=5&include=preReleaseVersion")
    pre = {i["id"]: i["attributes"]["version"] for i in d.get("included", []) if i["type"] == "preReleaseVersions"}
    out = []
    for b in d["data"]:
        pv = b["relationships"]["preReleaseVersion"]["data"]["id"]
        a = b["attributes"]
        out.append((b["id"], pre.get(pv), a["version"], a["processingState"], a["uploadedDate"]))
    return out


def preparar(version: str, build: str, novedades: str) -> None:
    b = [x for x in builds() if x[1] == version and x[2] == build]
    if not b or b[0][3] != "VALID":
        raise SystemExit(f"build {version} ({build}) aún no está VALID: {b}")
    existentes = {vs: vid for vid, vs, _ in versiones()}
    vid = existentes.get(version) or call("POST", "/v1/appStoreVersions", {"data": {
        "type": "appStoreVersions",
        "attributes": {"platform": "IOS", "versionString": version, "releaseType": "AFTER_APPROVAL"},
        "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}}}})["data"]["id"]
    call("PATCH", f"/v1/appStoreVersions/{vid}", {"data": {"type": "appStoreVersions", "id": vid,
        "attributes": {"releaseType": "AFTER_APPROVAL"},
        "relationships": {"build": {"data": {"type": "builds", "id": b[0][0]}}}}})
    locs = call("GET", f"/v1/appStoreVersions/{vid}/appStoreVersionLocalizations")["data"]
    for loc in locs:
        call("PATCH", f"/v1/appStoreVersionLocalizations/{loc['id']}", {"data": {
            "type": "appStoreVersionLocalizations", "id": loc["id"], "attributes": {"whatsNew": novedades}}})
    print("versión", version, "lista con build", build, "y novedades en", [l["attributes"]["locale"] for l in locs])


def enviar(version: str) -> None:
    vid = {vs: v for v, vs, _ in versiones()}[version]
    sub = call("POST", "/v1/reviewSubmissions", {"data": {"type": "reviewSubmissions",
        "attributes": {"platform": "IOS"},
        "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}}}})["data"]["id"]
    call("POST", "/v1/reviewSubmissionItems", {"data": {"type": "reviewSubmissionItems", "relationships": {
        "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub}},
        "appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}})
    r = call("PATCH", f"/v1/reviewSubmissions/{sub}", {"data": {"type": "reviewSubmissions", "id": sub,
        "attributes": {"submitted": True}}})
    print("enviada:", r["data"]["attributes"].get("state"))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "estado"
    if cmd == "estado":
        for _, vs, st in versiones():
            print(vs, st)
    elif cmd == "builds":
        for _, v, n, st, up in builds():
            print(v, f"({n})", st, up)
    elif cmd == "preparar":
        preparar(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == "enviar":
        enviar(sys.argv[2])
    else:
        raise SystemExit(__doc__)
