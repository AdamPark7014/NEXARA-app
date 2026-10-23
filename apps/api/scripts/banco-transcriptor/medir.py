#!/usr/bin/env python3
"""Mide un whisper-server ya levantado como lo usa NEXARA: la junta en partes de N s (opus 32 kbps,
como las graba el navegador), una petición por parte, en orden. Reporta WER, factor de tiempo
real y bucles.

Uso: python3 medir.py <etiqueta> <url> <segundos> [--cola] [--beam 5] [--inc 0.2]
"""
import json, os, re, subprocess, sys, time, unicodedata, glob

BASE = "/root/bench-whisper"
etiqueta, url, segundos = sys.argv[1], sys.argv[2], int(sys.argv[3])
args = sys.argv[4:]
cola = "--cola" in args
beam = args[args.index("--beam") + 1] if "--beam" in args else None
inc = args[args.index("--inc") + 1] if "--inc" in args else None
ac = args[args.index("--ac") + 1] if "--ac" in args else None
bo = args[args.index("--bo") + 1] if "--bo" in args else None
solo = args[args.index("--solo") + 1] if "--solo" in args else None
NOMBRES = " Grupo Tox, Hospital San Rafael, Bodegas Luna, Colegio Andes, Hotel Real, Universidad del Valle, Luis, Carolina, Roberto, Jorge, Diana, Adriana, Ricardo, Alejandra, Antonio, Patricia, Christian, Daniela, Mario, Fernanda." if "--nombres" in args else ""

VOCAB = ("Junta de trabajo de NEXARA, integrador de seguridad en México. Se habla de actividades, "
         "cotizaciones, clientes y sucursales: CCTV, cámaras Hikvision, NVR, DVR, control de acceso, "
         "cableado, fibra, Syscom, Banorte, IPADE, Integra.")

def plano(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9ñ ]+", " ", s)
    return s.split()

def wer(ref, hip):
    r, h = plano(ref), plano(hip)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev = cur
    return d[len(h)] / max(1, len(r))

def bucles(texto):
    """Frases de 4+ palabras que se repiten seguidas 3 veces o más."""
    p = plano(texto)
    n = 0
    for k in range(4, 9):
        i = 0
        while i + 3 * k <= len(p):
            if p[i:i + k] == p[i + k:i + 2 * k] == p[i + 2 * k:i + 3 * k]:
                n += 1
                i += 3 * k
            else:
                i += 1
    return n

ref = open(f"{BASE}/audio/referencia.txt", encoding="utf-8").read()
salida = []
for version in ((solo,) if solo else ("limpia", "sala")):
    dir_partes = f"{BASE}/partes/{version}-{segundos}"
    if not os.path.isdir(dir_partes):
        os.makedirs(dir_partes)
        subprocess.run([
            "docker", "run", "--rm", "--user", "root", "-v", f"{BASE}:/b", "--entrypoint", "ffmpeg", "nexara-transcriptor:latest",
            "-hide_banner", "-loglevel", "error", "-y", "-i", f"/b/audio/junta-{version}.wav", "-c:a", "libopus", "-b:a", "32k",
            "-f", "segment", "-segment_time", str(segundos), f"/b/partes/{version}-{segundos}/p%03d.webm",
        ], check=True)
    partes = sorted(glob.glob(f"{dir_partes}/p*.webm"))
    dur = float(subprocess.run(["docker", "run", "--rm", "-v", f"{BASE}:/b", "--entrypoint", "ffprobe", "nexara-transcriptor:latest",
                                "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"/b/audio/junta-{version}.wav"],
                               capture_output=True, text=True).stdout.strip())
    textos, t0 = [], time.time()
    for p in partes:
        prompt = VOCAB + NOMBRES
        if cola and textos:
            prompt = VOCAB + " " + " ".join(" ".join(textos).split()[-30:])
        cmd = ["curl", "-s", "-m", "300", url, "-F", f"file=@{p}", "-F", "response_format=json", "-F", "language=es",
               "-F", "temperature=0", "-F", f"prompt={prompt}"]
        if beam:
            cmd += ["-F", f"beam_size={beam}"]
        if inc is not None:
            cmd += ["-F", f"temperature_inc={inc}"]
        if ac:
            cmd += ["-F", f"audio_ctx={ac}"]
        if bo:
            cmd += ["-F", f"best_of={bo}"]
        r = subprocess.run(cmd, capture_output=True, text=True)
        try:
            textos.append(json.loads(r.stdout).get("text", "").strip())
        except Exception:
            textos.append("")
    t = time.time() - t0
    hip = " ".join(textos)
    salida.append({"etiqueta": etiqueta, "version": version, "segundos": segundos, "partes": len(partes), "audio_s": round(dur, 1),
                   "proceso_s": round(t, 1), "rtf": round(t / dur, 3), "wer": round(wer(ref, hip), 4), "bucles": bucles(hip)})
    with open(f"{BASE}/resultados/{etiqueta}-{version}.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(textos))
    print(json.dumps(salida[-1], ensure_ascii=False), flush=True)

with open(f"{BASE}/resultados/tabla.jsonl", "a", encoding="utf-8") as f:
    for s in salida:
        f.write(json.dumps(s, ensure_ascii=False) + "\n")
