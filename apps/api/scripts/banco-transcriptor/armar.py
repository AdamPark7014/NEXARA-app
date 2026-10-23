#!/usr/bin/env python3
"""Arma la «junta» de prueba con FLEURS es_419 (dev): frases de varias personas seguidas, con
pausas, más su versión «de sala» (eco, voz lejana, ruido) y el texto de referencia.

Uso (en el servidor): python3 armar.py /root/bench-whisper
"""
import csv, random, subprocess, sys, tarfile, wave, os

BASE = sys.argv[1]
DESC = f"{BASE}/descargas"
OUT = f"{BASE}/audio"
os.makedirs(OUT, exist_ok=True)
random.seed(7)

filas = []
with open(f"{DESC}/dev.tsv", encoding="utf-8") as f:
    for r in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
        # id, archivo, texto crudo, texto normalizado, fonemas, muestras, género
        if len(r) >= 7:
            filas.append({"id": r[0], "archivo": r[1], "texto": r[3], "muestras": int(r[5]), "genero": r[6]})

# Una frase por id (cada id es una oración leída por una persona distinta); mezcla de géneros.
vistos, elegidas = set(), []
random.shuffle(filas)
for r in filas:
    if r["id"] in vistos or not (4 * 16000 < r["muestras"] < 14 * 16000):
        continue
    vistos.add(r["id"])
    elegidas.append(r)
    if sum(x["muestras"] for x in elegidas) / 16000 > 200:  # ~3.3 min de voz
        break

nombres = {e["archivo"] for e in elegidas}
with tarfile.open(f"{DESC}/dev.tar.gz") as t:
    for m in t:
        base = os.path.basename(m.name)
        if base in nombres:
            m.name = base
            t.extract(m, f"{OUT}/frases")

# FLEURS viene en WAV de punto flotante: a PCM de 16 bits para unirlas.
os.makedirs(f"{OUT}/frases16", exist_ok=True)
subprocess.run([
    "docker", "run", "--rm", "--user", "root", "-v", f"{OUT}:/a", "--entrypoint", "sh", "nexara-transcriptor:latest", "-c",
    "for f in /a/frases/*.wav; do ffmpeg -hide_banner -loglevel error -y -i \"$f\" -ar 16000 -ac 1 -c:a pcm_s16le /a/frases16/$(basename \"$f\"); done",
], check=True)

# Junta limpia: frases con pausas de 0.4–1.5 s (WAV 16 kHz mono).
with wave.open(f"{OUT}/junta-limpia.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
    for e in elegidas:
        with wave.open(f"{OUT}/frases16/{e['archivo']}") as r:
            assert r.getframerate() == 16000 and r.getnchannels() == 1, e["archivo"]
            w.writeframes(r.readframes(r.getnframes()))
        w.writeframes(b"\x00\x00" * int(16000 * random.uniform(0.4, 1.5)))

with open(f"{OUT}/referencia.txt", "w", encoding="utf-8") as f:
    f.write(" ".join(e["texto"] for e in elegidas))

# Sala: voz lejana (paso bajo, -10 dB), eco de cuarto y ruido rosa + café (SNR ~12 dB).
subprocess.run([
    "docker", "run", "--rm", "--user", "root", "-v", f"{OUT}:/a", "--entrypoint", "ffmpeg", "nexara-transcriptor:latest",
    "-hide_banner", "-loglevel", "error", "-y", "-i", "/a/junta-limpia.wav",
    "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.035:sample_rate=16000",
    "-f", "lavfi", "-i", "anoisesrc=color=brown:amplitude=0.05:sample_rate=16000",
    "-filter_complex",
    "[0:a]highpass=f=120,lowpass=f=3800,volume=-10dB,aecho=0.8:0.55:35|73|121:0.32|0.22|0.14[v];"
    "[v][1:a][2:a]amix=inputs=3:duration=first:normalize=0[m]",
    "-map", "[m]", "-ar", "16000", "-ac", "1", "/a/junta-sala.wav",
], check=True)

seg = sum(e["muestras"] for e in elegidas) / 16000
print(f"{len(elegidas)} frases · {seg:.0f} s de voz · {len(open(f'{OUT}/referencia.txt', encoding='utf-8').read().split())} palabras")
