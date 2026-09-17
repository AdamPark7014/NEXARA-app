"""Datos ficticios para las capturas de Google Play (app Android, variante debug).

Genera `apps/mobile-native/android/app/src/debug/assets/store-demo/*.json`, que
`StoreDemoInterceptor` sirve en lugar de la API cuando existe `files/store_demo/serve`.
Todas las personas, clientes y conversaciones son inventadas: la ficha pública de la
tienda no debe mostrar a empleados ni clientes reales.

Las horas se calculan contra `--ahora` (UTC, por defecto el momento actual) para que
«entró hace 2 h» y las barras de avance se vean creíbles el día que se toman las capturas.

    python scripts/store-demo/generar-fixtures.py
    python scripts/store-demo/generar-fixtures.py --ahora 2026-09-17T16:30:00Z
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DESTINO = RAIZ / "apps/mobile-native/android/app/src/debug/assets/store-demo"

# Quien toma las capturas (sesión real de la app) es el id 1: sus mensajes salen como propios.
YO = 1

PERSONAS = [
    # id, nombre, correo, puesto, departamento
    (901, "Mariana López Herrera", "mariana.lopez@demo.nexara.mx", "Coordinadora de Operaciones", "Operaciones"),
    (902, "Diego Ramírez Soto", "diego.ramirez@demo.nexara.mx", "Ingeniero de Campo", "Ingeniería"),
    (903, "Fernanda Cruz Molina", "fernanda.cruz@demo.nexara.mx", "Ingeniera de Soporte", "Ingeniería"),
    (904, "Javier Morales Ortega", "javier.morales@demo.nexara.mx", "Técnico Instalador", "Operaciones"),
    (905, "Sofía Martínez Ruiz", "sofia.martinez@demo.nexara.mx", "Diseñadora de Proyectos", "Diseño"),
    (906, "Ricardo Hernández Vega", "ricardo.hernandez@demo.nexara.mx", "Técnico de Servicio", "Operaciones"),
    (907, "Paola Jiménez Castro", "paola.jimenez@demo.nexara.mx", "Coordinadora Administrativa", "Administración"),
    (908, "Luis Fernando Torres", "luis.torres@demo.nexara.mx", "Ingeniero de Redes", "Ingeniería"),
]


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def persona(pid: int) -> tuple:
    return next(p for p in PERSONAS if p[0] == pid)


def autor(pid: int) -> dict:
    if pid == YO:
        return {"id": YO, "nombre": "Tú", "email": "direccion@demo.nexara.mx", "avatarUrl": None}
    p = persona(pid)
    return {"id": p[0], "nombre": p[1], "email": p[2], "avatarUrl": None}


def generar(ahora: datetime) -> dict[str, object]:
    h = lambda horas, minutos=0: ahora - timedelta(hours=horas, minutes=minutos)  # noqa: E731
    hoy = ahora.date().isoformat()
    manana = (ahora.date() + timedelta(days=1)).isoformat()

    # ── Pizarra de actividades ──────────────────────────────────────────────
    actividades = {
        901: dict(id=5142, anNumber="AN-0142", titulo="Instalación de 8 cámaras IP · Corporativo Atlixco", coreKind="proyecto",
                  inicio=h(2, 10), avance=65, paso="EVIDENCE_PHOTOS", maxima=ahora + timedelta(hours=3)),
        902: dict(id=5143, anNumber="AN-0143", titulo="Mantenimiento preventivo CCTV · Hotel Casa Azul", coreKind="servicio",
                  inicio=h(1, 35), avance=40, paso="EVIDENCE_PHOTOS", maxima=ahora + timedelta(hours=2)),
        904: dict(id=5145, anNumber="AN-0145", titulo="Cableado estructurado · Bodega Norte", coreKind="obra",
                  inicio=h(3, 50), avance=80, paso="SERVICE_SHEET_DATA", maxima=h(0, 45)),
        905: dict(id=5146, anNumber="AN-0146", titulo="Levantamiento de sitio · Colegio Montebello", coreKind="proyecto",
                  inicio=h(0, 55), avance=25, paso="EVIDENCE_PHOTOS", maxima=ahora + timedelta(hours=4)),
        908: dict(id=5148, anNumber="AN-0148", titulo="Configuración de red y NVR · Grupo Textil del Valle", coreKind="servicio",
                  inicio=h(1, 5), avance=50, paso="SERVICE_SHEET_PDF", maxima=ahora + timedelta(hours=5)),
    }
    terminadas = {
        903: dict(id=5144, anNumber="AN-0144", titulo="Soporte remoto de videovigilancia · Parque Industrial San José", fin=h(0, 40)),
        907: dict(id=5147, anNumber="AN-0147", titulo="Alta de expediente · Colegio Montebello", fin=h(1, 15)),
    }
    entradas = {901: h(3, 2), 902: h(2, 48), 903: h(3, 15), 904: h(4, 5), 905: h(2, 30), 907: h(3, 40), 908: h(2, 55)}

    usuarios = []
    for pid, nombre, correo, puesto, _depto in PERSONAS:
        act = actividades.get(pid)
        fin = terminadas.get(pid)
        entrada = entradas.get(pid)
        estado = "sin_actividad"
        if act:
            estado = "atrasado" if act["maxima"] < ahora else "activo"
        elif fin:
            estado = "libre"
        usuario = {
            "id": pid, "nombre": nombre, "email": correo, "avatarUrl": None, "puesto": puesto,
            "status": estado,
            "currentActivity": None, "openActivities": [],
            "clockInAt": iso(entrada) if entrada else None,
            "workedMinutes": round((ahora - entrada).total_seconds() / 60) if entrada else None,
            "activityStartedAt": None, "activityElapsedMinutes": None, "currentLateMinutes": None,
            "idleSinceAt": None, "lastFinished": None,
            "enEsperaAprobacion": 1 if pid in (903, 907) else 0, "enCorreccion": 0,
        }
        if act:
            usuario["currentActivity"] = {
                "id": act["id"], "anNumber": act["anNumber"], "titulo": act["titulo"], "estatus": "En Proceso",
                "fechaMaxima": iso(act["maxima"]), "bucket": "projects" if act["coreKind"] != "servicio" else "services",
            }
            usuario["openActivities"] = [{
                "id": act["id"], "anNumber": act["anNumber"], "titulo": act["titulo"], "estatus": "En Proceso",
                "evidenceStatus": act["paso"], "progressPct": act["avance"], "coreKind": act["coreKind"],
                "assignmentCharge": "ejecucion", "fechaFinalizacion": None,
                "indicaciones": "Tomar fotos de cada punto instalado y llenar la hoja de servicio.",
                "teamEmails": [correo], "reparte": False, "fechaInicio": iso(act["inicio"]),
            }]
            usuario["activityStartedAt"] = iso(act["inicio"])
            usuario["activityElapsedMinutes"] = round((ahora - act["inicio"]).total_seconds() / 60)
            if estado == "atrasado":
                usuario["currentLateMinutes"] = round((ahora - act["maxima"]).total_seconds() / 60)
        if fin:
            usuario["lastFinished"] = {"id": fin["id"], "anNumber": fin["anNumber"], "titulo": fin["titulo"],
                                       "finishedAt": iso(fin["fin"]), "lateMinutes": None}
            usuario["idleSinceAt"] = iso(fin["fin"])
        usuarios.append(usuario)

    orden = {"activo": 0, "atrasado": 1, "libre": 2, "sin_actividad": 3}
    usuarios.sort(key=lambda u: (orden[u["status"]], u["nombre"]))
    archivos: dict[str, object] = {"me__board": {"scope": "company", "users": usuarios}}
    for u in usuarios:
        for bloque in [u["currentActivity"], u["lastFinished"], *u["openActivities"]]:
            if bloque:
                bloque["anNumber"] = None

    for u in usuarios:
        archivos[f"me__board__{u['id']}"] = u
        historial = []
        fin = terminadas.get(u["id"])
        if fin:
            historial.append({
                "id": fin["id"], "anNumber": None, "titulo": fin["titulo"], "estatus": "Por Validar",
                "coreKind": "servicio", "ticketTypeCustom": None, "assignmentCharge": "ejecucion",
                "fechaAsignacion": iso(h(26)), "fechaFinalizacion": iso(fin["fin"]),
                "evidence": {"status": "COMPLETED", "progressPct": 100, "entryPhotoUrl": None,
                             "evidencePhotos": [], "exitPhotoUrl": None, "serviceSheetPdfUrl": None, "serviceSheetData": None},
            })
        historial.append({
            "id": 5100 + u["id"] % 100, "anNumber": None, "titulo": "Revisión mensual de equipos · Hotel Casa Azul",
            "estatus": "Finalizada", "coreKind": "servicio", "ticketTypeCustom": None, "assignmentCharge": "ejecucion",
            "fechaAsignacion": iso(h(74)), "fechaFinalizacion": iso(h(50)),
            "evidence": {"status": "COMPLETED", "progressPct": 100, "entryPhotoUrl": None,
                         "evidencePhotos": [], "exitPhotoUrl": None, "serviceSheetPdfUrl": None, "serviceSheetData": None},
        })
        archivos[f"me__board__{u['id']}__history"] = historial

    # ── Asistencias del día ─────────────────────────────────────────────────
    salidas = {907: h(0, 20)}
    asistencia_usuarios = []
    for pid, nombre, correo, puesto, depto in PERSONAS:
        entrada = entradas.get(pid)
        eventos = []
        if entrada:
            eventos.append({"type": "entrada", "timestamp": iso(entrada), "deviceInfo": "Móvil · Android · NEXARA App",
                            "photoUrl": None, "entryLatitude": 19.0414, "entryLongitude": -98.2063})
        if pid in salidas:
            eventos.append({"type": "salida", "timestamp": iso(salidas[pid]), "deviceInfo": "Móvil · Android · NEXARA App",
                            "photoUrl": None, "exitLatitude": 19.0431, "exitLongitude": -98.1981})
        abierta = bool(entrada) and pid not in salidas
        minutos = round((((salidas.get(pid) or ahora) - entrada).total_seconds() / 60)) if entrada else 0
        asistencia_usuarios.append({
            "userId": pid, "userName": nombre, "email": correo, "department": depto, "roleName": puesto,
            "totalMinutes": minutos,
            "days": [{"date": hoy, "totalMinutes": minutos, "isOpen": abierta}] if entrada else [],
            "attendances": eventos,
        })
    archivos["attendance__hierarchy__range"] = {
        "rangeStart": hoy, "rangeEnd": manana, "totalUsers": len(asistencia_usuarios),
        "totalMinutesAll": sum(u["totalMinutes"] for u in asistencia_usuarios),
        "avgMinutesPerUser": 0, "users": asistencia_usuarios,
    }
    archivos["lunch-breaks__equipo"] = {
        "fecha": f"{hoy}T00:00:00.000Z", "alcance": "todo",
        "filas": [{"userId": p[0], "nombre": p[1], "puesto": p[3], "avatarUrl": None, "registro": None, "puedoRevisar": True}
                  for p in PERSONAS],
        "resumen": {"total": len(PERSONAS), "registraron": 0, "enComida": 0, "aDestiempo": 0, "pendientes": 0},
    }

    # ── Chat ────────────────────────────────────────────────────────────────
    def canal(cid, kind, name, topic, preview, hace, unread, peer=None, members=12):
        return {
            "id": cid, "kind": kind, "slug": None if kind == "DIRECT" else name, "name": name, "topic": topic,
            "description": None, "peer": autor(peer) if peer else None, "memberCount": members,
            "lastMessageAt": iso(hace), "lastMessagePreview": preview, "unread": unread > 0, "unreadCount": unread,
            "lastReadAt": iso(h(5)), "muted": False, "mutedUntil": None, "supervised": False, "readOnly": False,
        }

    archivos["chat__channels"] = [
        canal(201, "PUBLIC", "operaciones", "Coordinación del trabajo en campo",
              "Mariana López: Listo, ya quedó la cámara del acceso principal", h(0, 6), 3),
        canal(202, "DIRECT", "Diego Ramírez Soto", "Mensaje directo",
              "Te comparto la hoja de servicio del Hotel Casa Azul", h(0, 22), 1, peer=902, members=2),
        canal(203, "PUBLIC", "general", "Conversación del equipo",
              "Paola Jiménez: Recuerden subir sus comprobantes antes del viernes", h(1, 10), 0),
        canal(204, "DIRECT", "Fernanda Cruz Molina", "Mensaje directo",
              "Gracias, ya lo reviso", h(2, 5), 0, peer=903, members=2),
        canal(205, "PUBLIC", "anuncios", "Avisos importantes del equipo",
              "Nueva política de evidencias a partir del lunes", h(20), 0),
    ]
    archivos["chat__channels__201"] = {
        **{k: v for k, v in archivos["chat__channels"][0].items() if k not in ("lastMessagePreview", "unread", "unreadCount", "lastReadAt")},
        "members": [dict(autor(p[0]), role="member", lastReadAt=iso(h(0, 5))) for p in PERSONAS[:6]],
    }
    archivos["chat__channels__201__pins"] = {"messages": []}

    def mensaje(mid, pid, cuerpo, hace, reacciones=()):
        grupos = []
        for emoji, quienes in reacciones:
            grupos.append({
                "emoji": emoji, "count": len(quienes), "userIds": [q for q, _ in quienes],
                "users": [{"id": q, "nombre": autor(q)["nombre"], "avatarUrl": None, "reactedAt": iso(h(0, m))} for q, m in quienes],
            })
        return {
            "id": mid, "channelId": 201, "authorId": pid, "parentId": None, "kind": "TEXT", "body": cuerpo,
            "attachmentUrl": None, "attachmentName": None, "pinnedAt": None, "editedAt": None,
            "createdAt": iso(hace), "author": autor(pid), "replyCount": 0, "reactions": grupos,
        }

    archivos["chat__channels__201__messages"] = {"messages": [
        mensaje(7001, YO, "Buenos días equipo. Hoy la prioridad es el Corporativo Atlixco y la bodega norte.", h(3, 5),
                [("👍", [(901, 184), (902, 183), (904, 180)])]),
        mensaje(7002, 901, "Enterada. Ya estoy en sitio con Diego, empezamos por el estacionamiento.", h(2, 58)),
        mensaje(7003, 904, "Voy retrasado con el cableado de la bodega, falta material para el rack. ¿Alguien tiene 2 patch panel?", h(1, 20)),
        mensaje(7004, 908, "Yo llevo dos en la camioneta, te los paso a las 12.", h(1, 12), [("🙌", [(904, 70)])]),
        mensaje(7005, 905, "Terminé el levantamiento del Colegio Montebello, subo fotos en un momento.", h(0, 30),
                [("👏", [(901, 28), (907, 25)])]),
        mensaje(7006, 901, "Listo, ya quedó la cámara del acceso principal. Van 5 de 8.", h(0, 6),
                [("🔥", [(YO, 5), (902, 4), (905, 3)]), ("👍", [(908, 2)])]),
    ], "hasMore": False}

    # ── Clientes ────────────────────────────────────────────────────────────
    clientes = [
        (3101, "Corporativo Atlixco", "Corporativo Atlixco S.A. de C.V.", ["PROYECTO", "CORPORATIVO"], 901),
        (3102, "Hotel Casa Azul", "Operadora Hotelera Casa Azul S.A. de C.V.", ["PROYECTO", "COMERCIAL"], 902),
        (3103, "Colegio Montebello", "Educación Montebello A.C.", ["PROYECTO"], 905),
        (3104, "Grupo Textil del Valle", "Textiles del Valle de Puebla S.A. de C.V.", ["PROYECTO", "CORPORATIVO"], 908),
        (3105, "Parque Industrial San José", "Desarrollos Industriales San José S.A.P.I.", ["PROYECTO"], None),
    ]
    archivos["ventas__clientes"] = [{
        "id": cid, "name": nombre, "legalName": razon, "taxId": None, "fiscalAddress": "Puebla, Pue.",
        "fiscalZipCode": None, "fiscalRegime": None, "billingEmail": None, "billingPhone": None, "industry": None,
        "website": None, "status": "Activo", "notes": None, "ownerId": owner, "serviceClientId": cid + 1000,
        "companyId": 1, "createdAt": iso(h(24 * 30)), "updatedAt": iso(h(24 * 2)), "documents": [], "opportunities": [],
        "sectors": [{"id": cid * 10 + i, "salesClientId": cid, "sector": s, "companyId": 1, "createdAt": iso(h(24 * 30))}
                    for i, s in enumerate(sectores)],
        "owner": ({"id": owner, "nombre": persona(owner)[1], "email": persona(owner)[2]} if owner else None),
        "serviceClient": {"id": cid + 1000, "name": nombre, "isActive": True, "accountCode": None},
    } for cid, nombre, razon, sectores, owner in clientes]

    # ── Avisos ──────────────────────────────────────────────────────────────
    def aviso(nid, tipo, categoria, titulo, texto, hace, leido, disparo=None, url="/erp/actividades"):
        return {
            "id": nid, "userId": YO, "type": tipo, "category": categoria, "title": titulo, "message": texto,
            "triggerUserId": disparo, "relatedEntityId": None, "entityType": None, "relatedUrl": url,
            "priority": "normal", "isRead": leido, "readAt": iso(hace) if leido else None, "companyId": 1,
            "createdAt": iso(hace), "triggerUser": autor(disparo) if disparo else None,
        }

    avisos = [
        aviso(9101, "ACTIVITY_STATUS_CHANGED", "activities", "Mariana avanzó en su actividad",
              "Instalación de 8 cámaras IP · Corporativo Atlixco: subió 5 fotos de evidencia.", h(0, 6), False, 901),
        aviso(9102, "ACTIVITY_STATUS_CHANGED", "evidence", "Fernanda envió evidencias para revisar",
              "Soporte remoto de videovigilancia · Parque Industrial San José está lista para aprobarse.", h(0, 40), False, 903),
        aviso(9103, "SLA_BREACH", "activities", "Javier va atrasado",
              "Cableado estructurado · Bodega Norte pasó su hora máxima hace 45 min.", h(0, 45), False, 904),
        aviso(9104, "ATTENDANCE_CHECKIN", "attendance", "Sofía entró a trabajar",
              "Checó entrada con foto y ubicación a las 8:15 a. m.", h(2, 30), False, 905, url="/erp/asistencias"),
        aviso(9105, "ACTIVITY_STATUS_CHANGED", "activities", "Diego inició una actividad",
              "Mantenimiento preventivo CCTV · Hotel Casa Azul.", h(1, 35), True, 902),
        aviso(9106, "ATTENDANCE_CHECKIN", "attendance", "Mariana entró a trabajar",
              "Checó entrada con foto y ubicación.", h(3, 2), True, 901, url="/erp/asistencias"),
        aviso(9107, "ATTENDANCE_CHECKIN", "security", "Nuevo inicio de sesión en Galaxy S24 Ultra",
              "Iniciaste sesión desde Galaxy S24 Ultra (Android 15) · app NEXARA. Si no fuiste tú, cambia tu contraseña.",
              h(4), True, None, url="/erp/my-profile"),
    ]
    archivos["notifications"] = avisos
    archivos["notifications__count__unread"] = {"unreadCount": sum(1 for a in avisos if not a["isRead"])}
    return archivos


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--ahora", help="Instante de referencia en UTC (ISO 8601). Por defecto, ahora.")
    args = parser.parse_args()
    ahora = datetime.fromisoformat(args.ahora.replace("Z", "+00:00")) if args.ahora else datetime.now(timezone.utc)

    DESTINO.mkdir(parents=True, exist_ok=True)
    for viejo in DESTINO.glob("*.json"):
        viejo.unlink()
    archivos = generar(ahora)
    for clave, contenido in archivos.items():
        (DESTINO / f"{clave}.json").write_text(json.dumps(contenido, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(archivos)} fixtures en {DESTINO.relative_to(RAIZ)} (referencia {iso(ahora)})")


if __name__ == "__main__":
    main()
