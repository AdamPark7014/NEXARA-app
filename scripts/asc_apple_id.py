#!/usr/bin/env python3
"""Imprime el Apple ID numérico de la app en App Store Connect.

Usa la misma llave .p8 que altool (ASC_KEY_PATH, ASC_KEY_ID, ASC_ISSUER_ID)
y filtra por BUNDLE_ID. Solo depende de la biblioteca estándar y de openssl.
"""

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def der_ecdsa_to_raw(der: bytes) -> bytes:
    """Pasa una firma ECDSA en DER (openssl) a R||S de 32+32 bytes (JWT ES256)."""
    if len(der) < 8 or der[0] != 0x30:
        raise SystemExit("firma openssl no es un SEQUENCE DER")
    i = 2
    if der[1] & 0x80:
        n = der[1] & 0x7F
        i = 2 + n

    def read_int(buf: bytes, pos: int) -> tuple[bytes, int]:
        if pos >= len(buf) or buf[pos] != 0x02:
            raise SystemExit("firma DER sin INTEGER")
        ln = buf[pos + 1]
        pos += 2
        if ln & 0x80:
            raise SystemExit("longitud de INTEGER no soportada")
        raw = buf[pos : pos + ln]
        pos += ln
        if len(raw) > 32:
            raw = raw[-32:]
        return raw.rjust(32, b"\x00"), pos

    r, i = read_int(der, i)
    s, i = read_int(der, i)
    return r + s


def make_jwt(key_path: str, key_id: str, issuer_id: str) -> str:
    now = int(time.time())
    header = b64url(
        json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"}, separators=(",", ":")).encode()
    )
    payload = b64url(
        json.dumps(
            {"iss": issuer_id, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
            separators=(",", ":"),
        ).encode()
    )
    signing_input = f"{header}.{payload}".encode()
    der = subprocess.check_output(
        ["openssl", "dgst", "-sha256", "-sign", key_path],
        input=signing_input,
    )
    return f"{header}.{payload}.{b64url(der_ecdsa_to_raw(der))}"


def main() -> None:
    key_path = os.environ.get("ASC_KEY_PATH", "")
    key_id = os.environ.get("ASC_KEY_ID", "")
    issuer_id = os.environ.get("ASC_ISSUER_ID", "")
    bundle_id = os.environ.get("BUNDLE_ID", "")
    missing = [
        name
        for name, value in (
            ("ASC_KEY_PATH", key_path),
            ("ASC_KEY_ID", key_id),
            ("ASC_ISSUER_ID", issuer_id),
            ("BUNDLE_ID", bundle_id),
        )
        if not value
    ]
    if missing:
        raise SystemExit("faltan variables: " + ", ".join(missing))
    if not os.path.isfile(key_path):
        raise SystemExit(f"no está la llave en {key_path}")

    token = make_jwt(key_path, key_id, issuer_id)
    query = urllib.parse.urlencode(
        {"filter[bundleId]": bundle_id, "limit": "5", "fields[apps]": "bundleId,name"}
    )
    url = "https://api.appstoreconnect.apple.com/v1/apps?" + query
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise SystemExit(f"App Store Connect HTTP {exc.code}: {detail}") from exc

    data = json.loads(body).get("data") or []
    match = next(
        (app for app in data if (app.get("attributes") or {}).get("bundleId") == bundle_id),
        None,
    )
    if match is None and len(data) == 1:
        match = data[0]
    if not match or not str(match.get("id", "")).isdigit():
        raise SystemExit(f"no hay app con bundle id {bundle_id}: {body}")
    print(match["id"])


if __name__ == "__main__":
    main()
