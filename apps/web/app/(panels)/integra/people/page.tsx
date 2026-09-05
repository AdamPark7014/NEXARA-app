"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import BadgeRounded from "@mui/icons-material/BadgeRounded";
import DeleteForeverRounded from "@mui/icons-material/DeleteForeverRounded";
import EventBusyRounded from "@mui/icons-material/EventBusyRounded";
import FingerprintRounded from "@mui/icons-material/FingerprintRounded";
import LinkOffRounded from "@mui/icons-material/LinkOffRounded";
import LinkRounded from "@mui/icons-material/LinkRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import PersonAddAlt1Rounded from "@mui/icons-material/PersonAddAlt1Rounded";
import PhotoCameraRounded from "@mui/icons-material/PhotoCameraRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import ScheduleRounded from "@mui/icons-material/ScheduleRounded";
import SyncRounded from "@mui/icons-material/SyncRounded";
import {
  IgBadge,
  IgBtn,
  IgError,
  IgField,
  IgFilters,
  IgPage,
  IgPanel,
  IgSplit,
  IgToolbar,
} from "../_Console";
import { getCachedProvider, subscribeProvider } from "../_caps";
import { PersonFaceThumb, invalidatePersonFaceCache, prefetchPersonFace } from "../_PersonFace";
import { inputStyle, integraApi, selectStyle } from "../_lib";
import { toast } from "@/components/Toast";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import styles from "../integra.module.css";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { listUsers, type ApiUserRow } from "@/lib/users-api";
import { withTenantHeaders } from "@/lib/tenant";
import {
  asList,
  buildErpByKey,
  findErpForPerson,
  generateTempPassword,
  type AltaMode,
} from "../_personIdentity";
import people$ from "./_people.module.css";
import {
  ActionGroup,
  CredentialList,
  DetailFacts,
  DetailSkeleton,
  DirectorySkeleton,
  SuspendedFlag,
  ValidityPill,
  ViewBar,
} from "./_PeopleBits";
import { PeopleDirectory } from "./_PeopleDirectory";
import { PersonAccessPanel } from "./_PersonAccessPanel";
import {
  VALIDITY_FILTER_OPTIONS,
  credentialScore,
  describeError,
  describeValidity,
  faceOn,
  formatWhen,
  genderLabel,
  sortPeople,
  userTypeLabel,
  type Person,
  type SortKey,
} from "./_peopleView";
import { usePeopleQuery, type ViewMode } from "./_usePeopleQuery";

type Org = { id: string; name: string; parentId?: string };
type AcsDev = { id: string; name: string; kind: string; ip?: string | null; deviceType?: string | null };
type OpResult = { deviceIp: string; ok: boolean; error?: string; attempts?: number };
type ValidityFilter = "" | "ok" | "warn" | "expired" | "off" | "face" | "noface" | "erp" | "noerp";
type MutKind = "save" | "photo" | "faceDel" | "delete" | "create" | "fp" | null;
type AltaStep = 1 | 2 | 3 | 4;
type ErpRole = { id: number; nombre: string };
type ErpDept = { id: number; nombre: string };

async function erpApiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(
    withTenantHeaders({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    }),
  );
  const res = await fetch(buildApiUrl(path), { ...init, credentials: "include", headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

function validityOf(p: Person): {
  key: "ok" | "warn" | "expired" | "off" | "unknown";
  label: string;
  tone: "ok" | "warn" | "danger" | "neutral";
} {
  if (p.validEnable === false) return { key: "off", label: "Deshabilitada", tone: "danger" };
  if (!p.validTo) return { key: "unknown", label: "Sin vigencia", tone: "neutral" };
  const end = Date.parse(p.validTo);
  if (!Number.isFinite(end)) return { key: "unknown", label: p.validTo, tone: "neutral" };
  const days = (end - Date.now()) / 86_400_000;
  if (days < 0) return { key: "expired", label: "Vencida", tone: "danger" };
  if (days < 30) return { key: "warn", label: "Por vencer", tone: "warn" };
  return { key: "ok", label: "Vigente", tone: "ok" };
}

function fileToJpegBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const m = /^data:image\/(\w+);base64,(.+)$/i.exec(dataUrl);
      if (!m) {
        reject(new Error("Archivo no es imagen"));
        return;
      }
      const kind = m[1].toLowerCase();
      if (kind !== "jpeg" && kind !== "jpg") {
        reject(new Error("Usa JPEG (.jpg). PNG no lo aceptan bien los DS-K1T."));
        return;
      }
      resolve(m[2]);
    };
    reader.readAsDataURL(file);
  });
}

function CredChips({ person }: { person: Person }) {
  const faceOn = (person.numOfFace ?? 0) > 0 || person.hasFace || person.hasLocalFace;
  return (
    <div className={styles.personChips}>
      <span className={styles.personChip} data-on={faceOn ? "1" : undefined}>
        Face {person.hasLocalFace ? "NEXARA" : person.numOfFace ?? (faceOn ? "·" : "0")}
      </span>
      <span className={styles.personChip} data-on={(person.numOfFP ?? 0) > 0 ? "1" : undefined}>
        Huella {person.numOfFP ?? 0}
        {person.localFpIds?.length ? ` · ${person.localFpIds.length} dig.` : ""}
      </span>
      <span className={styles.personChip} data-on={(person.numOfCard ?? 0) > 0 ? "1" : undefined}>
        Tarjeta {person.numOfCard ?? 0}
      </span>
    </div>
  );
}

function IdentityStatusBadges({
  person,
  erp,
}: {
  person: Person;
  erp: ApiUserRow | null;
}) {
  const faceOn = (person.numOfFace ?? 0) > 0 || person.hasFace || person.hasLocalFace;
  const roleLabel = erp?.role?.nombre || null;
  return (
    <div className={styles.personStatusRow}>
      <span className={styles.personStatusChip} data-on={erp ? "1" : undefined} data-tone={erp ? "ok" : "off"}>
        {erp ? "En ERP" : "Sin ERP"}
      </span>
      <span className={styles.personStatusChip} data-on="1" data-tone="ok">
        En terminales
      </span>
      <span className={styles.personStatusChip} data-on={faceOn ? "1" : undefined} data-tone={faceOn ? "ok" : "off"}>
        {faceOn ? "Foto" : "Sin foto"}
      </span>
      <span className={styles.personStatusChip} data-on={roleLabel ? "1" : undefined} data-tone={roleLabel ? "ok" : "off"}>
        {roleLabel ? `Rol · ${roleLabel}` : "Sin rol"}
      </span>
    </div>
  );
}

function OpFanout({ results }: { results: OpResult[] | null }) {
  if (!results?.length) return null;
  return (
    <ul className={styles.personOpList}>
      {results.map((r) => (
        <li key={r.deviceIp} data-ok={r.ok ? "1" : "0"}>
          {r.deviceIp}: {r.ok ? "OK" : r.error || "falló"}
          {r.attempts != null && r.attempts > 1 ? ` · ${r.attempts} intentos` : ""}
        </li>
      ))}
    </ul>
  );
}

function WizardSteps({ step, mode }: { step: AltaStep; mode: AltaMode }) {
  const items: { n: AltaStep; label: string }[] =
    mode === "link"
      ? [
          { n: 1, label: "Usuario ERP" },
          { n: 2, label: "Código" },
          { n: 3, label: "Foto" },
          { n: 4, label: "Guardar" },
        ]
      : mode === "unified"
        ? [
            { n: 1, label: "Identidad" },
            { n: 2, label: "Código" },
            { n: 3, label: "Foto" },
            { n: 4, label: "Crear" },
          ]
        : [
            { n: 1, label: "Nombre" },
            { n: 2, label: "Código" },
            { n: 3, label: "Foto" },
            { n: 4, label: "Guardar" },
          ];
  return (
    <ol className={styles.personWizard}>
      {items.map((it) => (
        <li key={it.n} data-on={step >= it.n ? "1" : undefined} data-current={step === it.n ? "1" : undefined}>
          <span>{it.n}</span>
          {it.label}
        </li>
      ))}
    </ol>
  );
}

export default function IntegraPeoplePage() {
  const router = useRouter();
  const { user: currentUser } = useUser();
  const token = currentUser?.token ?? "";
  const [people, setPeople] = useState<Person[]>([]);
  const [erpUsers, setErpUsers] = useState<ApiUserRow[]>([]);
  const [erpRoles, setErpRoles] = useState<ErpRole[]>([]);
  const [erpDepts, setErpDepts] = useState<ErpDept[]>([]);
  const [erpLoading, setErpLoading] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [acsDevices, setAcsDevices] = useState<AcsDev[]>([]);
  const [forceDelete, setForceDelete] = useState(false);
  const [selected, setSelected] = useState<Person | null>(null);
  const [detail, setDetail] = useState<unknown>(null);
  const [faceBust, setFaceBust] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [linkUserId, setLinkUserId] = useState("");
  const [altaMode, setAltaMode] = useState<AltaMode>("unified");
  const [tempPassword, setTempPassword] = useState("");
  const [code, setCode] = useState("");
  const [autoCode, setAutoCode] = useState(true);
  const [altaStep, setAltaStep] = useState<AltaStep>(1);
  const [altaJpegB64, setAltaJpegB64] = useState<string | null>(null);
  const [altaPreview, setAltaPreview] = useState<string | null>(null);
  const [orgId, setOrgId] = useState("");
  const [editName, setEditName] = useState("");
  const [editValidFrom, setEditValidFrom] = useState("");
  const [editValidTo, setEditValidTo] = useState("");
  const [editValidEnable, setEditValidEnable] = useState(true);
  const [fpDeviceIp, setFpDeviceIp] = useState("");
  const [opNote, setOpNote] = useState<string | null>(null);
  const [opOk, setOpOk] = useState<boolean | null>(null);
  const [opResults, setOpResults] = useState<OpResult[] | null>(null);
  const [mutKind, setMutKind] = useState<MutKind>(null);
  const [orgFilter, setOrgFilter] = useState("");
  const [validityFilter, setValidityFilter] = useState<ValidityFilter>("");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [provider, setProvider] = useState<string | null>(() => getCachedProvider());
  const [mode, setMode] = useState<"alta" | "ficha">("alta");
  const isArtemis = !provider || provider === "ARTEMIS";
  const isIsapi = provider === "ISAPI";
  const mutating = mutKind != null;

  useEffect(() => subscribeProvider(setProvider), []);

  useEffect(() => {
    if (!selected) return;
    setEditName(selected.name);
    setEditValidFrom(selected.validFrom?.slice(0, 19) || "");
    setEditValidTo(selected.validTo?.slice(0, 19) || "");
    setEditValidEnable(selected.validEnable !== false);
    setOpNote(null);
    setOpOk(null);
    setOpResults(null);
    setMode("ficha");
  }, [selected?.id]);

  const loadErpDirectory = useCallback(async () => {
    if (!token) {
      setErpUsers([]);
      return;
    }
    setErpLoading(true);
    try {
      const [users, rolesRaw, deptsRaw] = await Promise.all([
        listUsers(token),
        erpApiFetch<unknown>("users/roles", token).catch(() => []),
        erpApiFetch<unknown>("users/departments", token).catch(() => []),
      ]);
      setErpUsers(users.filter((u) => u.isActive !== false));
      const roles = asList<ErpRole>(rolesRaw);
      const depts = asList<ErpDept>(deptsRaw);
      setErpRoles(roles);
      setErpDepts(depts);
      setRoleId((prev) => {
        if (prev) return prev;
        const preferred =
          roles.find((r: ErpRole) => /empleado|staff|operador/i.test(r.nombre))?.id ?? roles[0]?.id;
        return preferred != null ? String(preferred) : "";
      });
      setDepartmentId((prev) => prev || (depts[0] ? String(depts[0].id) : ""));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cargar el directorio ERP"));
    } finally {
      setErpLoading(false);
    }
  }, [token]);

  const load = useCallback(async () => {
    setError(null);
    setLoadingPeople(true);
    try {
      const [p, o, d] = await Promise.all([
        integraApi<{ items: Person[] }>(live ? "integra/people?live=1" : "integra/people"),
        integraApi<{ items: Org[] }>("integra/orgs").catch(() => ({ items: [] })),
        isIsapi
          ? integraApi<{ items: AcsDev[] }>("integra/devices").catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] as AcsDev[] }),
      ]);
      setPeople(p.items);
      setOrgs(o.items);
      setOrgId((prev) => prev || o.items[0]?.id || "");
      const acs = (d.items || []).filter((x) => x.kind === "ACS" && x.ip);
      setAcsDevices(acs);
      setFpDeviceIp((prev) => prev || acs.find((x) => /341|FP|huella/i.test(`${x.deviceType || ""}${x.name || ""}`))?.ip || acs[0]?.ip || "");
      // Prefetch faces en paralelo limitado — evita N+1 bloqueante en UI.
      const ids = p.items
        .filter((x) => x.hasFace || x.hasLocalFace || (x.numOfFace ?? 0) > 0 || x.faceUrl)
        .slice(0, 40)
        .map((x) => x.id);
      let i = 0;
      const workers = Array.from({ length: Math.min(6, ids.length) }, async () => {
        while (i < ids.length) {
          const id = ids[i++];
          prefetchPersonFace(id);
        }
      });
      void Promise.all(workers);
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar Personas"));
    } finally {
      setLoadingPeople(false);
    }
  }, [live, isIsapi]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadErpDirectory();
  }, [loadErpDirectory]);

  const erpByKey = useMemo(() => buildErpByKey(erpUsers), [erpUsers]);

  const acsKeySet = useMemo(() => {
    const s = new Set<string>();
    for (const p of people) {
      for (const k of [p.id, p.code]) {
        const n = String(k || "").trim().toLowerCase();
        if (n) s.add(n);
      }
    }
    return s;
  }, [people]);

  const erpOnlyUsers = useMemo(
    () =>
      erpUsers.filter((u) => {
        const emp = String(u.employeeNumber || "").trim().toLowerCase();
        if (!emp) return true;
        return !acsKeySet.has(emp);
      }),
    [erpUsers, acsKeySet],
  );

  const filtered = useMemo(
    () =>
      people.filter((p) => {
        if (orgFilter && p.orgId !== orgFilter) return false;
        const erp = findErpForPerson(p, erpByKey);
        if (validityFilter === "face") {
          if (!p.hasFace && !p.hasLocalFace && !(p.numOfFace && p.numOfFace > 0)) return false;
        } else if (validityFilter === "noface") {
          if (p.hasFace || p.hasLocalFace || (p.numOfFace && p.numOfFace > 0)) return false;
        } else if (validityFilter === "erp") {
          if (!erp) return false;
        } else if (validityFilter === "noerp") {
          if (erp) return false;
        } else if (validityFilter) {
          if (validityOf(p).key !== validityFilter) return false;
        }
        if (!q) return true;
        const qq = q.toLowerCase();
        return (
          p.name.toLowerCase().includes(qq) ||
          (p.code || "").toLowerCase().includes(qq) ||
          p.id.toLowerCase().includes(qq) ||
          (erp?.nombre || "").toLowerCase().includes(qq) ||
          (erp?.email || "").toLowerCase().includes(qq) ||
          (erp?.role?.nombre || "").toLowerCase().includes(qq)
        );
      }),
    [people, q, orgFilter, validityFilter, erpByKey],
  );

  const openDetail = async (p: Person) => {
    setSelected(p);
    setDetail(null);
    setMode("ficha");
    setBusy(true);
    prefetchPersonFace(p.id);
    try {
      setDetail(await integraApi(`integra/people/${encodeURIComponent(p.id)}`));
    } catch (e) {
      if (!isArtemis) {
        setDetail({
          source: provider || "ISAPI",
          note: "Detalle desde el listado (espejo local).",
          person: p,
        });
      } else {
        setDetail({ error: formatApiError(e, "Sin detalle") });
      }
    } finally {
      setBusy(false);
    }
  };

  const resetAlta = () => {
    setName("");
    setEmail("");
    setLinkUserId("");
    setTempPassword(generateTempPassword());
    setCode("");
    setAutoCode(true);
    setAltaStep(1);
    setAltaJpegB64(null);
    if (altaPreview) URL.revokeObjectURL(altaPreview);
    setAltaPreview(null);
  };

  const startAlta = (preferredMode: AltaMode = "unified") => {
    setSelected(null);
    setDetail(null);
    setMode("alta");
    setAltaMode(preferredMode);
    setOpNote(null);
    setOpOk(null);
    setOpResults(null);
    setError(null);
    resetAlta();
    void loadErpDirectory();
  };

  const startLinkFromErp = (u: ApiUserRow) => {
    startAlta("link");
    setLinkUserId(String(u.id));
    setName(u.nombre);
    setEmail(u.email);
    setCode(u.employeeNumber || "");
    setAutoCode(!u.employeeNumber);
    setAltaStep(u.employeeNumber ? 3 : 2);
  };

  const syncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      // Sync no bloquea el listado más de lo necesario: fire + refresh.
      await integraApi("integra/sync", { method: "POST" });
      await load();
      toast.success("Directorio reconciliado (recuperación). Los cambios van en vivo a terminales.");
    } catch (e) {
      const msg = formatApiError(e, "Error al sincronizar personas");
      setError(msg);
      toast.error(msg);
    } finally {
      setSyncing(false);
    }
  };

  const detailPerson: Person | null = useMemo(() => {
    if (!detail || typeof detail !== "object") return selected;
    const d = detail as { person?: Person };
    return d.person || selected;
  }, [detail, selected]);

  const selectedErp = selected ? findErpForPerson(selected, erpByKey) : null;
  const withFace = people.filter((p) => p.hasFace || p.hasLocalFace || (p.numOfFace ?? 0) > 0).length;
  const linkedCount = people.filter((p) => findErpForPerson(p, erpByKey)).length;

  const applyOp = (r: { success?: boolean; note?: string; results?: OpResult[] }) => {
    setOpResults(r.results || null);
    setOpNote(r.note || (r.success ? "Listo" : "No se completó"));
    setOpOk(r.success === true);
    if (!r.success) setError(r.note || "Revisa el resultado por terminal.");
  };

  const uploadFaceFor = async (personId: string, imageBase64: string) => {
    return integraApi<{ success?: boolean; note?: string; results?: OpResult[]; hasLocalFace?: boolean }>(
      `integra/people/${encodeURIComponent(personId)}/face`,
      { method: "POST", body: JSON.stringify({ imageBase64 }) },
    );
  };

  const createAcsWithFace = async (personName: string, employeeNo: string | null, useAuto: boolean) => {
    const r = await integraApi<{
      success?: boolean;
      note?: string;
      employeeNo?: string;
      results?: OpResult[];
    }>("integra/people", {
      method: "POST",
      body: JSON.stringify({
        personName,
        autoCode: useAuto,
        ...(useAuto || !employeeNo
          ? {}
          : { employeeNo, personCode: employeeNo }),
      }),
    });
    if (!r.success || !r.employeeNo) {
      applyOp(r);
      return null;
    }
    if (!altaJpegB64) {
      applyOp({ success: false, note: "Falta la foto JPEG", results: r.results });
      return null;
    }
    const face = await uploadFaceFor(r.employeeNo, altaJpegB64);
    invalidatePersonFaceCache(r.employeeNo);
    setFaceBust((n) => n + 1);
    applyOp({
      success: Boolean(r.success && face.success !== false),
      note: `${r.note || "Alta ACS OK"} · ${face.note || "Foto empujada."}`,
      results: [...(r.results || []), ...(face.results || [])],
    });
    return r.employeeNo;
  };

  const runAlta = async () => {
    if (altaMode === "unified") {
      if (!name.trim() || !email.trim() || !roleId) {
        setError("Nombre, correo y rol ERP son obligatorios.");
        setAltaStep(1);
        return;
      }
      if (!departmentId) {
        setError("Falta departamento ERP. Crea uno en Usuarios o recarga.");
        setAltaStep(1);
        return;
      }
      if (!token) {
        setError("Sesión requerida para crear usuario ERP.");
        return;
      }
    } else if (altaMode === "link") {
      if (!linkUserId) {
        setError("Elige un usuario ERP para vincular.");
        setAltaStep(1);
        return;
      }
    } else if (!name.trim()) {
      setError("Nombre requerido");
      setAltaStep(1);
      return;
    }

    if (!autoCode && !code.trim()) {
      setError("Código requerido o activa automático");
      setAltaStep(2);
      return;
    }
    if (!altaJpegB64) {
      setError("La foto JPEG es obligatoria (Face ID en terminales).");
      setAltaStep(3);
      return;
    }

    setMutKind("create");
    setError(null);
    setOpOk(null);
    try {
      let employeeNo: string | null = autoCode ? null : code.trim();
      let useAuto = autoCode;
      let notePrefix = "";
      let erpUserIdToLink: number | null = null;

      if (altaMode === "unified") {
        const password = tempPassword || generateTempPassword();
        const created = await erpApiFetch<ApiUserRow>("users", token, {
          method: "POST",
          body: JSON.stringify({
            nombre: name.trim(),
            email: email.trim(),
            password,
            roleId: Number(roleId),
            departmentId: Number(departmentId),
            ...(!autoCode && code.trim() ? { employeeNumber: code.trim() } : {}),
          }),
        });
        employeeNo = created.employeeNumber || code.trim() || null;
        useAuto = !employeeNo;
        erpUserIdToLink = created.id;
        notePrefix = `ERP OK (${created.email}${created.employeeNumber ? ` · ${created.employeeNumber}` : ""}). Contraseña temporal: ${password}. `;
        setTempPassword(password);
        toast.success(`Usuario ERP creado · ${created.employeeNumber || created.email}`);
        await loadErpDirectory();
      } else if (altaMode === "link") {
        const linked = erpUsers.find((u) => String(u.id) === linkUserId);
        if (!linked) throw new Error("Usuario ERP no encontrado");
        employeeNo = linked.employeeNumber || code.trim() || null;
        erpUserIdToLink = linked.id;
        if (!employeeNo) {
          if (!token) throw new Error("Sesión requerida para asignar nº de empleado");
          const patched = await erpApiFetch<ApiUserRow>(`users/${linked.id}`, token, {
            method: "PATCH",
            body: JSON.stringify({
              employeeNumber: code.trim() || undefined,
            }),
          });
          employeeNo = patched.employeeNumber || code.trim() || null;
        }
        if (!employeeNo) {
          setError("El usuario ERP no tiene nº de empleado. Indica uno manual.");
          setAltaStep(2);
          return;
        }
        useAuto = false;
        setName(linked.nombre);
        notePrefix = `Vinculado a ERP · ${linked.nombre}. `;
      }

      const createdId = await createAcsWithFace(
        name.trim() || erpUsers.find((u) => String(u.id) === linkUserId)?.nombre || "",
        employeeNo,
        useAuto,
      );
      if (!createdId) return;

      // Garantiza clave canónica: User.employeeNumber = ACS personId.
      if (erpUserIdToLink) {
        try {
          await integraApi(`integra/people/${encodeURIComponent(createdId)}/link`, {
            method: "POST",
            body: JSON.stringify({ userId: erpUserIdToLink }),
          });
        } catch {
          // Si ya coincidían los códigos, el link puede ser no-op / conflicto benigno.
        }
      }

      if (notePrefix) {
        setOpNote((prev) => `${notePrefix}${prev || ""}`);
      }
      resetAlta();
      await load();
      await loadErpDirectory();
      const created = (await integraApi<{ items: Person[] }>("integra/people")).items.find(
        (p) => p.id === createdId,
      );
      if (created) void openDetail(created);
      toast.success("Persona unificada lista");
    } catch (e) {
      const msg = formatApiError(e, "Error al dar de alta");
      setError(msg);
      setOpOk(false);
      toast.error(msg);
    } finally {
      setMutKind(null);
    }
  };

  return (
    <IgPage>
      <IgToolbar
        title="Personas"
        meta={`${filtered.length}/${people.length}${linkedCount ? ` · ${linkedCount} en ERP` : ""}${
          withFace ? ` · ${withFace} con Face` : ""
        }${erpOnlyUsers.length ? ` · ${erpOnlyUsers.length} solo ERP` : ""} · ${
          live ? "consulta live" : "espejo"
        }${erpLoading || loadingPeople ? " · cargando…" : ""}`}
        actions={
          <>
            {(isIsapi || isArtemis) && (
              <IgBtn variant="primary" onClick={() => startAlta("unified")}>
                + Alta unificada
              </IgBtn>
            )}
            <IgBtn onClick={() => router.push("/erp/users")} title="Directorio IAM ERP">
              Usuarios ERP
            </IgBtn>
            <IgBtn onClick={() => router.push("/integra/events")} title="Timeline ACS con foto">
              Eventos Face
            </IgBtn>
            <IgBtn
              onClick={() => setLive((v) => !v)}
              title={
                live
                  ? "Consultando terminales en vivo (más lento)"
                  : "Listado del espejo sincronizado"
              }
            >
              {live ? "Live ACS ON" : "Espejo"}
            </IgBtn>
            {isIsapi && (
              <IgBtn
                disabled={syncing}
                onClick={() => void syncNow()}
                title="Solo si el espejo se desfasó — los cambios ya van en vivo a los terminales"
              >
                {syncing ? "Reconciliando…" : "Reconciliar"}
              </IgBtn>
            )}
            <IgBtn
              onClick={() => {
                void load();
                void loadErpDirectory();
              }}
            >
              Actualizar
            </IgBtn>
          </>
        }
      />
      <IgError>{error}</IgError>
      <p className={styles.personLead}>
        <strong>Cambios en vivo a terminales.</strong> Alta, edición, Face ID y baja se empujan
        al instante a todos los ACS; «Reconciliar» solo si el espejo se desfasó. Una persona ={" "}
        <strong>usuario ERP</strong> (rol + correo) + <strong>código ACS</strong> (mismo nº de
        empleado / employeeNumber) + <strong>foto Face ID</strong>. El alta unificada crea ambos;
        «Vincular» enrola en terminales a alguien que ya está en ERP.
      </p>

      <IgFilters>
        {isArtemis && (
          <IgField label="Org">
            <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} style={selectStyle}>
              <option value="">Todas</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </IgField>
        )}
        {isIsapi && (
          <IgField label="Filtro">
            <select
              value={validityFilter}
              onChange={(e) => setValidityFilter(e.target.value as ValidityFilter)}
              style={selectStyle}
            >
              <option value="">Todas</option>
              <option value="erp">En ERP</option>
              <option value="noerp">Sin ERP</option>
              <option value="ok">Vigentes</option>
              <option value="warn">Por vencer</option>
              <option value="expired">Vencidas</option>
              <option value="off">Deshabilitadas</option>
              <option value="face">Con Face ID</option>
              <option value="noface">Sin Face ID</option>
            </select>
          </IgField>
        )}
        <IgField label="Buscar">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={inputStyle}
            placeholder="nombre / código / rol / correo"
          />
        </IgField>
      </IgFilters>

      <IgSplit
        leftWidth="52%"
        left={
          <IgPanel title="Directorio" count={filtered.length} flush>
            <div className={styles.personDirectory}>
              {loadingPeople && filtered.length === 0 && (
                <div className={styles.personEmptyBox}>
                  <strong>Cargando personas…</strong>
                  <p>Espejo ACS y enlace ERP.</p>
                </div>
              )}
              {filtered.map((p) => {
                const v = validityOf(p);
                const erp = findErpForPerson(p, erpByKey);
                const sel = selected?.id === p.id && mode === "ficha";
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={styles.personRow}
                    data-selected={sel ? "1" : undefined}
                    onClick={() => void openDetail(p)}
                  >
                    <PersonFaceThumb
                      className={styles.personAvatar}
                      size="md"
                      personId={
                        p.hasFace || p.hasLocalFace || (p.numOfFace ?? 0) > 0 || p.faceUrl
                          ? p.id
                          : null
                      }
                      personName={p.name}
                      bust={faceBust}
                    />
                    <div className={styles.personRowMain}>
                      <div className={styles.personRowTop}>
                        <strong>{p.name}</strong>
                        <IgBadge tone={v.tone}>{v.label}</IgBadge>
                      </div>
                      <div className={styles.personRowMeta}>
                        <span className={styles.personMono}>{p.code || p.id}</span>
                        {erp?.email && <span>{erp.email}</span>}
                        {!erp && (p.userType || p.orgName) && <span>{p.userType || p.orgName}</span>}
                        {genderLabel(p.gender) && <span>{genderLabel(p.gender)}</span>}
                      </div>
                      <IdentityStatusBadges person={p} erp={erp} />
                      {isIsapi && <CredChips person={p} />}
                    </div>
                  </button>
                );
              })}
              {erpOnlyUsers.length > 0 && isIsapi && (
                <div className={styles.personErpOnly}>
                  <header>
                    <strong>En ERP · sin terminales</strong>
                    <span>{erpOnlyUsers.length}</span>
                  </header>
                  {erpOnlyUsers.slice(0, 12).map((u) => (
                    <div key={u.id} className={styles.personErpOnlyRow}>
                      <div>
                        <strong>{u.nombre}</strong>
                        <span>
                          {u.employeeNumber || "sin nº"} · {u.role?.nombre || "sin rol"}
                        </span>
                      </div>
                      <IgBtn onClick={() => startLinkFromErp(u)}>Enrolar ACS</IgBtn>
                    </div>
                  ))}
                </div>
              )}
              {!loadingPeople && filtered.length === 0 && (
                <div className={styles.personEmptyBox}>
                  <strong>Sin personas</strong>
                  <p>
                    {isArtemis
                      ? "No hay coincidencias en el directorio."
                      : "El espejo está vacío o el filtro no deja nada. Da de alta unificada o reconciliá."}
                  </p>
                  {(isIsapi || isArtemis) && (
                    <IgBtn variant="primary" onClick={() => startAlta("unified")}>
                      + Alta unificada
                    </IgBtn>
                  )}
                </div>
              )}
            </div>
          </IgPanel>
        }
        right={
          <IgPanel
            title={
              mode === "alta"
                ? altaMode === "unified"
                  ? "Alta unificada ERP + ACS"
                  : altaMode === "link"
                    ? "Enrolar usuario ERP en ACS"
                    : "Alta solo ACS"
                : selected
                  ? "Ficha"
                  : "Selecciona o da de alta"
            }
            count={
              mode === "ficha"
                ? selected?.name || "—"
                : altaMode === "unified"
                  ? "ERP + terminales"
                  : altaMode === "link"
                    ? "vincular"
                    : "solo ACS"
            }
          >
            {mode === "alta" && isIsapi && (
              <div className={styles.personCrud}>
                <div className={styles.personModeTabs} role="tablist">
                  {(
                    [
                      ["unified", "Unificada"],
                      ["link", "Vincular ERP"],
                      ["acs", "Solo ACS"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      className={styles.personModeTab}
                      data-on={altaMode === key ? "1" : undefined}
                      onClick={() => {
                        setAltaMode(key);
                        setAltaStep(1);
                        setError(null);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <WizardSteps step={altaStep} mode={altaMode} />

                {altaStep === 1 && altaMode === "unified" && (
                  <section className={styles.personSection} data-tone="accent">
                    <header className={styles.personSectionHead}>
                      <strong>1 · Identidad ERP</strong>
                      <span>nombre · correo · rol</span>
                    </header>
                    <IgField label="Nombre completo">
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        style={{ ...inputStyle, maxWidth: "100%" }}
                        placeholder="Ej. Ariadna Sierra"
                        autoFocus
                      />
                    </IgField>
                    <IgField label="Correo">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{ ...inputStyle, maxWidth: "100%" }}
                        placeholder="nombre@empresa.com"
                      />
                    </IgField>
                    <IgField label="Rol ERP">
                      <select
                        value={roleId}
                        onChange={(e) => setRoleId(e.target.value)}
                        style={{ ...selectStyle, maxWidth: "100%" }}
                        disabled={erpRoles.length === 0}
                      >
                        <option value="">— Seleccionar —</option>
                        {erpRoles.map((r) => (
                          <option key={r.id} value={String(r.id)}>
                            {r.nombre}
                          </option>
                        ))}
                      </select>
                    </IgField>
                    {erpDepts.length > 1 && (
                      <IgField label="Departamento">
                        <select
                          value={departmentId}
                          onChange={(e) => setDepartmentId(e.target.value)}
                          style={{ ...selectStyle, maxWidth: "100%" }}
                        >
                          {erpDepts.map((d) => (
                            <option key={d.id} value={String(d.id)}>
                              {d.nombre}
                            </option>
                          ))}
                        </select>
                      </IgField>
                    )}
                    <p className={styles.personNote}>
                      Se crea el usuario ERP con contraseña temporal y el mismo nº irá a los
                      terminales ACS.
                    </p>
                    <IgBtn
                      variant="primary"
                      disabled={!name.trim() || !email.trim() || !roleId || !departmentId}
                      onClick={() => setAltaStep(2)}
                    >
                      Continuar →
                    </IgBtn>
                  </section>
                )}

                {altaStep === 1 && altaMode === "link" && (
                  <section className={styles.personSection} data-tone="accent">
                    <header className={styles.personSectionHead}>
                      <strong>1 · Usuario ERP</strong>
                      <span>ya existe en NEXARA</span>
                    </header>
                    <IgField label="Elegir usuario">
                      <select
                        value={linkUserId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setLinkUserId(id);
                          const u = erpUsers.find((x) => String(x.id) === id);
                          if (u) {
                            setName(u.nombre);
                            setEmail(u.email);
                            setCode(u.employeeNumber || "");
                            setAutoCode(!u.employeeNumber);
                          }
                        }}
                        style={{ ...selectStyle, maxWidth: "100%" }}
                      >
                        <option value="">— Seleccionar —</option>
                        {erpOnlyUsers.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.nombre} · {u.role?.nombre || "sin rol"}
                            {u.employeeNumber ? ` · ${u.employeeNumber}` : ""}
                          </option>
                        ))}
                        {erpUsers
                          .filter((u) => !erpOnlyUsers.some((o) => o.id === u.id))
                          .slice(0, 30)
                          .map((u) => (
                            <option key={`all-${u.id}`} value={String(u.id)}>
                              {u.nombre} (ya en ACS?) · {u.employeeNumber || "sin nº"}
                            </option>
                          ))}
                      </select>
                    </IgField>
                    {erpLoading && <p className={styles.personNote}>Cargando usuarios ERP…</p>}
                    <IgBtn
                      variant="primary"
                      disabled={!linkUserId}
                      onClick={() => setAltaStep(2)}
                    >
                      Continuar →
                    </IgBtn>
                  </section>
                )}

                {altaStep === 1 && altaMode === "acs" && (
                  <section className={styles.personSection} data-tone="accent">
                    <header className={styles.personSectionHead}>
                      <strong>1 · Nombre</strong>
                      <span>solo terminales (sin ERP)</span>
                    </header>
                    <IgField label="Nombre completo">
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        style={{ ...inputStyle, maxWidth: "100%" }}
                        placeholder="Ej. Ariadna Sierra"
                        autoFocus
                      />
                    </IgField>
                    <IgBtn
                      variant="primary"
                      disabled={!name.trim()}
                      onClick={() => setAltaStep(2)}
                    >
                      Continuar →
                    </IgBtn>
                  </section>
                )}

                {altaStep === 2 && (
                  <section className={styles.personSection} data-tone="accent">
                    <header className={styles.personSectionHead}>
                      <strong>2 · Código empleado</strong>
                      <span>enlace ERP ↔ ACS · máx. 32</span>
                    </header>
                    <label className={styles.personCheck}>
                      <input
                        type="checkbox"
                        checked={autoCode}
                        onChange={(e) => {
                          setAutoCode(e.target.checked);
                          if (e.target.checked) setCode("");
                        }}
                      />
                      {altaMode === "unified"
                        ? "Generar nº automático (NXR25SYS… en ERP)"
                        : "Generar código automáticamente"}
                    </label>
                    {!autoCode && (
                      <IgField label="Código manual">
                        <input
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          style={{ ...inputStyle, maxWidth: "100%" }}
                          placeholder="ej. NXR25SYS042"
                        />
                      </IgField>
                    )}
                    {autoCode && (
                      <p className={styles.personNote}>
                        {altaMode === "unified"
                          ? "El ERP asigna el siguiente libre del tenant; ese mismo código se usa en ACS."
                          : "Siguiente número libre del espejo ACS, o marca de tiempo."}
                      </p>
                    )}
                    <div className={styles.personBtnRow}>
                      <IgBtn onClick={() => setAltaStep(1)}>← Atrás</IgBtn>
                      <IgBtn
                        variant="primary"
                        disabled={!autoCode && !code.trim()}
                        onClick={() => setAltaStep(3)}
                      >
                        Continuar →
                      </IgBtn>
                    </div>
                  </section>
                )}

                {altaStep === 3 && (
                  <section className={styles.personSection} data-tone="accent">
                    <header className={styles.personSectionHead}>
                      <strong>3 · Foto Face ID</strong>
                      <span>JPEG obligatorio</span>
                    </header>
                    <p className={styles.personNote}>
                      Se guarda en NEXARA y se empuja a cada terminal. JPEG frontal, buena luz
                      (~480–720 px, ~50–400 KB). PNG no sirve.
                    </p>
                    {altaPreview && (
                      <div className={styles.personAltaPreview}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={altaPreview} alt="Vista previa" />
                      </div>
                    )}
                    <label className={styles.personFileBtn}>
                      {altaJpegB64 ? "Cambiar JPEG" : "Elegir foto JPEG"}
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg"
                        hidden
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          try {
                            const b64 = await fileToJpegBase64(file);
                            setAltaJpegB64(b64);
                            if (altaPreview) URL.revokeObjectURL(altaPreview);
                            setAltaPreview(URL.createObjectURL(file));
                            setError(null);
                          } catch (err) {
                            setError(formatApiError(err, "Foto inválida"));
                            setAltaJpegB64(null);
                          }
                        }}
                      />
                    </label>
                    <div className={styles.personBtnRow}>
                      <IgBtn onClick={() => setAltaStep(2)}>← Atrás</IgBtn>
                      <IgBtn
                        variant="primary"
                        disabled={!altaJpegB64}
                        onClick={() => setAltaStep(4)}
                      >
                        Continuar →
                      </IgBtn>
                    </div>
                  </section>
                )}

                {altaStep === 4 && (
                  <section className={styles.personSection} data-tone="accent">
                    <header className={styles.personSectionHead}>
                      <strong>4 · Confirmar</strong>
                      <span>
                        {altaMode === "unified"
                          ? "ERP + ACS + foto"
                          : altaMode === "link"
                            ? "ACS + foto"
                            : "solo ACS + foto"}
                      </span>
                    </header>
                    <dl className={styles.personFacts}>
                      <div>
                        <dt>Nombre</dt>
                        <dd>{name || "—"}</dd>
                      </div>
                      {altaMode === "unified" && (
                        <div>
                          <dt>Correo / rol</dt>
                          <dd>
                            {email}
                            <span className={styles.personFactSub}>
                              {erpRoles.find((r) => String(r.id) === roleId)?.nombre || "—"}
                            </span>
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>Código</dt>
                        <dd>{autoCode ? "automático" : code}</dd>
                      </div>
                      <div>
                        <dt>Foto</dt>
                        <dd>{altaJpegB64 ? "JPEG listo" : "falta"}</dd>
                      </div>
                    </dl>
                    {altaPreview && (
                      <div className={styles.personAltaPreview}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={altaPreview} alt="" />
                      </div>
                    )}
                    <div className={styles.personBtnRow}>
                      <IgBtn onClick={() => setAltaStep(3)} disabled={mutating}>
                        ← Atrás
                      </IgBtn>
                      <IgBtn variant="primary" disabled={mutating} onClick={() => void runAlta()}>
                        {mutKind === "create"
                          ? "Guardando…"
                          : altaMode === "unified"
                            ? "Crear persona unificada"
                            : "Dar de alta + empujar foto"}
                      </IgBtn>
                    </div>
                    {opNote && (
                      <p className={styles.personNote} data-tone={opOk ? "ok" : "warn"}>
                        {opNote}
                      </p>
                    )}
                    <OpFanout results={opResults} />
                  </section>
                )}
              </div>
            )}

            {mode === "alta" && isArtemis && (
              <div className={styles.personCrud}>
                <section className={styles.personSection}>
                  <IgField label="Nombre">
                    <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
                  </IgField>
                  <IgField label="Código">
                    <input value={code} onChange={(e) => setCode(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
                  </IgField>
                  <IgField label="Org">
                    <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={{ ...selectStyle, maxWidth: "100%" }}>
                      {orgs.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </IgField>
                  <IgBtn
                    variant="primary"
                    disabled={!name || !orgId || mutating}
                    onClick={async () => {
                      setMutKind("create");
                      try {
                        await integraApi("integra/people", {
                          method: "POST",
                          body: JSON.stringify({
                            personName: name,
                            personCode: code || undefined,
                            orgIndexCode: orgId,
                          }),
                        });
                        setName("");
                        setCode("");
                        await load();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Error");
                      } finally {
                        setMutKind(null);
                      }
                    }}
                  >
                    Alta persona
                  </IgBtn>
                </section>
              </div>
            )}

            {mode === "ficha" && detailPerson && selected ? (
              <div className={styles.personCrud}>
                <div className={styles.personCardHead}>
                  <PersonFaceThumb
                    className={styles.personAvatarLg}
                    size="xl"
                    personId={detailPerson.id}
                    personName={detailPerson.name}
                    bust={faceBust}
                  />
                  <div>
                    <h3 className={styles.personCardName}>{detailPerson.name}</h3>
                    <p className={styles.personCardCode}>{detailPerson.code || detailPerson.id}</p>
                    <div className={styles.personChips}>
                      <IgBadge tone={validityOf(detailPerson).tone}>
                        {validityOf(detailPerson).label}
                      </IgBadge>
                      {(detailPerson.userType || detailPerson.orgName) && (
                        <IgBadge>{detailPerson.userType || detailPerson.orgName}</IgBadge>
                      )}
                    </div>
                    <IdentityStatusBadges person={detailPerson} erp={selectedErp} />
                  </div>
                </div>

                {busy && <IgBadge>Cargando detalle…</IgBadge>}

                <section className={styles.personSection} data-tone="accent">
                  <header className={styles.personSectionHead}>
                    <strong>Identidad ERP</strong>
                    <span>User.employeeNumber ↔ ACS</span>
                  </header>
                  {selectedErp ? (
                    <>
                      <dl className={styles.personFacts}>
                        <div>
                          <dt>Usuario</dt>
                          <dd>
                            {selectedErp.nombre}
                            <span className={styles.personFactSub}>{selectedErp.email}</span>
                          </dd>
                        </div>
                        <div>
                          <dt>Rol</dt>
                          <dd>{selectedErp.role?.nombre || "—"}</dd>
                        </div>
                        <div>
                          <dt>Nº empleado</dt>
                          <dd className={styles.personMono}>
                            {selectedErp.employeeNumber || detailPerson.id}
                          </dd>
                        </div>
                      </dl>
                      <div className={styles.personBtnRow}>
                        <IgBtn onClick={() => router.push(`/erp/users?highlight=${selectedErp.id}`)}>
                          Abrir en ERP
                        </IgBtn>
                        <IgBtn
                          disabled={mutating}
                          onClick={async () => {
                            if (
                              !confirm(
                                `¿Desvincular ${detailPerson.name} del usuario ERP? El terminal no se modifica.`,
                              )
                            ) {
                              return;
                            }
                            setMutKind("save");
                            try {
                              const r = await integraApi<{ note?: string }>(
                                `integra/people/${encodeURIComponent(selected.id)}/link`,
                                { method: "DELETE" },
                              );
                              setOpNote(r.note || "Desvinculado del ERP.");
                              setOpOk(true);
                              await loadErpDirectory();
                              await load();
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "No se pudo desvincular");
                              setOpOk(false);
                            } finally {
                              setMutKind(null);
                            }
                          }}
                        >
                          Desvincular
                        </IgBtn>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className={styles.personNote}>
                        Sin usuario ERP. Vincula para que asistencia híbrida y actividades
                        resuelvan a la misma persona (mismo código ACS).
                      </p>
                      <IgField label="Usuario ERP">
                        <select
                          value={linkUserId}
                          onChange={(e) => setLinkUserId(e.target.value)}
                          style={{ ...selectStyle, maxWidth: "100%" }}
                        >
                          <option value="">— Elegir —</option>
                          {erpOnlyUsers.map((u) => (
                            <option key={u.id} value={String(u.id)}>
                              {u.nombre} · {u.role?.nombre || "sin rol"}
                              {u.employeeNumber ? ` · ${u.employeeNumber}` : ""}
                            </option>
                          ))}
                        </select>
                      </IgField>
                      <div className={styles.personBtnRow}>
                        <IgBtn
                          variant="primary"
                          disabled={mutating || !linkUserId}
                          onClick={async () => {
                            setMutKind("save");
                            try {
                              const r = await integraApi<{ note?: string }>(
                                `integra/people/${encodeURIComponent(selected.id)}/link`,
                                {
                                  method: "POST",
                                  body: JSON.stringify({ userId: Number(linkUserId) }),
                                },
                              );
                              setOpNote(r.note || "Vinculado al ERP.");
                              setOpOk(true);
                              setLinkUserId("");
                              await loadErpDirectory();
                              await load();
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "No se pudo vincular");
                              setOpOk(false);
                            } finally {
                              setMutKind(null);
                            }
                          }}
                        >
                          Vincular a ERP
                        </IgBtn>
                        <IgBtn onClick={() => startAlta("link")}>Alta / vínculo guiado</IgBtn>
                      </div>
                    </>
                  )}
                </section>

                {isIsapi && (
                  <>
                    <dl className={styles.personFacts}>
                      <div>
                        <dt>Vigencia</dt>
                        <dd>
                          {formatWhen(detailPerson.validFrom)} → {formatWhen(detailPerson.validTo)}
                        </dd>
                      </div>
                      <div>
                        <dt>Puertas</dt>
                        <dd>
                          {detailPerson.doorNames?.length
                            ? detailPerson.doorNames.join(" · ")
                            : detailPerson.doorRight || "—"}
                        </dd>
                      </div>
                      {(detailPerson.sourceName || detailPerson.sourceIp) && (
                        <div>
                          <dt>Terminal</dt>
                          <dd>
                            {detailPerson.sourceName || detailPerson.sourceIp}
                            {detailPerson.sourceName && detailPerson.sourceIp && (
                              <span className={styles.personFactSub}>{detailPerson.sourceIp}</span>
                            )}
                          </dd>
                        </div>
                      )}
                    </dl>
                    <CredChips person={detailPerson} />

                    {!detailPerson.hasLocalFace &&
                      ((detailPerson.numOfFace ?? 0) > 0 || detailPerson.hasFace) && (
                        <p className={styles.personNote} data-tone="warn">
                          Face ID enrolado en terminal, pero sin JPEG en NEXARA (modelo biométrico).
                          Sube una foto para verla en ficha, listado y eventos.
                        </p>
                      )}

                    <section className={styles.personSection}>
                      <header className={styles.personSectionHead}>
                        <strong>Editar ficha</strong>
                        <span>UserInfo/Modify</span>
                      </header>
                      <IgField label="Nombre">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{ ...inputStyle, maxWidth: "100%" }}
                        />
                      </IgField>
                      <IgField label="Vigencia desde">
                        <input
                          value={editValidFrom}
                          onChange={(e) => setEditValidFrom(e.target.value)}
                          style={{ ...inputStyle, maxWidth: "100%" }}
                          placeholder="2020-01-01T00:00:00"
                        />
                      </IgField>
                      <IgField label="Vigencia hasta">
                        <input
                          value={editValidTo}
                          onChange={(e) => setEditValidTo(e.target.value)}
                          style={{ ...inputStyle, maxWidth: "100%" }}
                          placeholder="2037-12-31T23:59:59"
                        />
                      </IgField>
                      <label className={styles.personCheck}>
                        <input
                          type="checkbox"
                          checked={editValidEnable}
                          onChange={(e) => setEditValidEnable(e.target.checked)}
                        />
                        Vigencia activa
                      </label>
                      <IgBtn
                        variant="primary"
                        disabled={mutating || !editName.trim()}
                        onClick={async () => {
                          setMutKind("save");
                          setError(null);
                          try {
                            const r = await integraApi<{
                              success?: boolean;
                              note?: string;
                              results?: OpResult[];
                            }>(`integra/people/${encodeURIComponent(selected.id)}`, {
                              method: "PATCH",
                              body: JSON.stringify({
                                personName: editName.trim(),
                                validFrom: editValidFrom || undefined,
                                validTo: editValidTo || undefined,
                                validEnable: editValidEnable,
                              }),
                            });
                            applyOp({
                              ...r,
                              note: r.success
                                ? "Ficha guardada en todos los terminales."
                                : r.note || "Guardado incompleto.",
                            });
                            await load();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Error al guardar");
                            setOpOk(false);
                          } finally {
                            setMutKind(null);
                          }
                        }}
                      >
                        {mutKind === "save" ? "Guardando…" : "Guardar en terminales"}
                      </IgBtn>
                    </section>

                    <section className={styles.personSection} data-tone="accent">
                      <header className={styles.personSectionHead}>
                        <strong>Horarios y puertas</strong>
                        <span>Valid · RightPlan</span>
                      </header>
                      <p className={styles.personNote}>
                        Define vigencia (incl. indefinido), presets (24/7, oficina, visita…)
                        y qué plantilla aplica en cada puerta del sitio.
                      </p>
                      <IgBtn
                        variant="primary"
                        onClick={() =>
                          router.push(
                            `/integra/schedules?person=${encodeURIComponent(selected.id)}&view=person`,
                          )
                        }
                      >
                        Abrir editor de horarios
                      </IgBtn>
                    </section>

                    <section className={styles.personSection}>
                      <header className={styles.personSectionHead}>
                        <strong>Face ID · foto</strong>
                        <span>NEXARA + FaceDataRecord</span>
                      </header>
                      <p className={styles.personNote}>
                        JPEG se guarda en uploads y se empuja a cada ACS (FaceDataRecord +
                        verificación FDSearch). Ideal: frontal 50–400 KB. El terminal puede
                        no re-entregar la imagen (solo modelo).
                      </p>
                      <div className={styles.personBtnRow}>
                        <label
                          className={styles.personFileBtn}
                          data-busy={mutKind === "photo" ? "1" : undefined}
                        >
                          {mutKind === "photo" ? "Subiendo…" : "Subir / actualizar JPEG"}
                          <input
                            type="file"
                            accept="image/jpeg,image/jpg"
                            hidden
                            disabled={mutating}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (!file) return;
                              setMutKind("photo");
                              setError(null);
                              try {
                                const imageBase64 = await fileToJpegBase64(file);
                                const r = await uploadFaceFor(selected.id, imageBase64);
                                invalidatePersonFaceCache(selected.id);
                                setFaceBust((n) => n + 1);
                                applyOp(r);
                                await load();
                                await openDetail(selected);
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Error foto");
                                setOpOk(false);
                              } finally {
                                setMutKind(null);
                              }
                            }}
                          />
                        </label>
                        <IgBtn
                          disabled={mutating}
                          onClick={async () => {
                            if (
                              !confirm(
                                `¿Quitar Face ID de ${selected.name} en todos los terminales y la copia NEXARA?`,
                              )
                            ) {
                              return;
                            }
                            setMutKind("faceDel");
                            try {
                              const r = await integraApi<{
                                success?: boolean;
                                note?: string;
                                results?: OpResult[];
                              }>(`integra/people/${encodeURIComponent(selected.id)}/face`, {
                                method: "DELETE",
                              });
                              invalidatePersonFaceCache(selected.id);
                              setFaceBust((n) => n + 1);
                              applyOp({
                                ...r,
                                note: r.success ? "Face ID quitado." : r.note || "No se quitó del todo.",
                              });
                              await load();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Error");
                              setOpOk(false);
                            } finally {
                              setMutKind(null);
                            }
                          }}
                        >
                          {mutKind === "faceDel" ? "Quitando…" : "Quitar Face ID"}
                        </IgBtn>
                      </div>
                    </section>

                    <section className={styles.personSection}>
                      <header className={styles.personSectionHead}>
                        <strong>Huella</strong>
                        <span>CaptureFingerPrint → FingerPrintDownload</span>
                      </header>
                      <p className={styles.personNote}>
                        Pon el dedo en el terminal con sensor (p. ej. .162 / .163). Se captura,
                        se guarda plantilla en NEXARA si el ACS la entrega, y se aplica a todos
                        los ACS. Terminales solo-rostro pueden rechazarla.
                      </p>
                      <IgField label="Terminal de captura">
                        <select
                          value={fpDeviceIp}
                          onChange={(e) => setFpDeviceIp(e.target.value)}
                          style={{ ...selectStyle, maxWidth: "100%" }}
                        >
                          {acsDevices.map((d) => (
                            <option key={d.ip || d.id} value={d.ip || ""}>
                              {d.name} ({d.ip})
                            </option>
                          ))}
                        </select>
                      </IgField>
                      <div className={styles.personBtnRow}>
                        <IgBtn
                          variant="primary"
                          disabled={mutating || !fpDeviceIp}
                          onClick={async () => {
                            setMutKind("fp");
                            setError(null);
                            try {
                              const r = await integraApi<{
                                success?: boolean;
                                note?: string;
                                results?: OpResult[];
                              }>(`integra/people/${encodeURIComponent(selected.id)}/fingerprint`, {
                                method: "POST",
                                body: JSON.stringify({
                                  deviceIp: fpDeviceIp,
                                  fingerPrintID: 1,
                                }),
                              });
                              applyOp(r);
                              await load();
                              await openDetail(selected);
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : "Error huella — ¿dedo en el sensor?",
                              );
                              setOpOk(false);
                            } finally {
                              setMutKind(null);
                            }
                          }}
                        >
                          {mutKind === "fp" ? "Esperando dedo…" : "Capturar y enrolar huella"}
                        </IgBtn>
                      </div>
                    </section>

                    <section className={styles.personDangerZone} id="person-danger-zone">
                      <header className={styles.personSectionHead}>
                        <strong>Eliminar persona</strong>
                        <span>zona de peligro</span>
                      </header>
                      <p className={styles.personNote}>
                        Borra rostro, huella y ficha en cada ACS (.160–.163), verifica UserInfo y
                        limpia el espejo NEXARA. Si un terminal falla, por defecto la persona se
                        queda (parece que «no se guardó»). Marca force para sacarla de NEXARA y
                        reintentar el Delete en las IPs caídas — el sync no la reimporta.
                      </p>
                      <label
                        className={styles.personForceBox}
                        data-on={forceDelete ? "1" : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={forceDelete}
                          onChange={(e) => setForceDelete(e.target.checked)}
                          disabled={mutating}
                        />
                        <span>
                          <strong>Forzar baja en NEXARA (force)</strong>
                          Aunque un ACS falle: sale del espejo, queda tombstone + reintento en cola
                          para IPs offline. Sin esto, un solo fallo deja a la persona en la lista.
                        </span>
                      </label>
                      <IgBtn
                        variant="danger"
                        disabled={mutating}
                        onClick={async () => {
                          if (
                            !confirm(
                              forceDelete
                                ? `¿ELIMINAR a ${selected.name} (${selected.code || selected.id})?\n\nFORCE: sale del espejo aunque algún ACS falle. Se reintentará el Delete en IPs caídas.`
                                : `¿ELIMINAR a ${selected.name} (${selected.code || selected.id}) de TODOS los terminales?\n\nSi uno falla, se conserva en NEXARA (marca «Forzar baja» para insistir).`,
                            )
                          ) {
                            return;
                          }
                          setMutKind("delete");
                          setError(null);
                          try {
                            const qs = forceDelete ? "?force=1" : "";
                            const r = await integraApi<{
                              success?: boolean;
                              partial?: boolean;
                              forced?: boolean;
                              note?: string;
                              results?: OpResult[];
                              pendingIps?: string[];
                            }>(`integra/people/${encodeURIComponent(selected.id)}${qs}`, {
                              method: "DELETE",
                            });
                            applyOp(r);
                            if (r.success || r.forced) {
                              const gone = selected.id;
                              invalidatePersonFaceCache(gone);
                              setPeople((prev) => prev.filter((p) => p.id !== gone));
                              setSelected(null);
                              setDetail(null);
                              setMode("alta");
                              setForceDelete(false);
                              setOpNote(r.note || "Eliminado.");
                              setOpOk(true);
                              setError(null);
                              toast.success(
                                r.forced
                                  ? "Baja forzada en NEXARA. Reintento ACS en cola."
                                  : "Eliminado en terminales y NEXARA.",
                              );
                            } else {
                              const fails = (r.results || [])
                                .filter((x) => !x.ok)
                                .map((x) => `${x.deviceIp}: ${x.error || "falló"}`)
                                .join("\n");
                              const msg = fails
                                ? `${r.note || "Borrado incompleto"}\n${fails}\n\nMarca «Forzar baja en NEXARA» e inténtalo de nuevo.`
                                : r.note || "Borrado incompleto — revisa por IP abajo.";
                              setError(msg);
                              setForceDelete(true);
                              toast.error(
                                fails
                                  ? `Borrado incompleto. Fallos:\n${fails}`
                                  : msg,
                              );
                              requestAnimationFrame(() => {
                                document
                                  .getElementById("person-danger-zone")
                                  ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                              });
                            }
                          } catch (err) {
                            const msg =
                              err instanceof Error ? err.message : "Error al eliminar";
                            setError(msg);
                            setOpOk(false);
                            setForceDelete(true);
                            toast.error(msg);
                          } finally {
                            setMutKind(null);
                          }
                        }}
                      >
                        {mutKind === "delete"
                          ? "Eliminando (esperando terminales)…"
                          : forceDelete
                            ? "Eliminar (force) de NEXARA + ACS"
                            : "Eliminar de todos los terminales"}
                      </IgBtn>
                      {error && mode === "ficha" && (
                        <p className={styles.personDangerError} role="alert">
                          {error}
                        </p>
                      )}
                      {opNote && mode === "ficha" && (
                        <p className={styles.personNote} data-tone={opOk ? "ok" : "warn"}>
                          {opNote}
                        </p>
                      )}
                      {mode === "ficha" && <OpFanout results={opResults} />}
                    </section>
                  </>
                )}

                {isArtemis && detail != null && (
                  <pre className={styles.personRawPre}>{JSON.stringify(detail, null, 2)}</pre>
                )}
                {isArtemis && (
                  <IgBtn
                    variant="danger"
                    onClick={async () => {
                      if (!confirm("¿Eliminar esta persona del directorio?")) return;
                      await integraApi(`integra/people/${encodeURIComponent(selected.id)}`, {
                        method: "DELETE",
                      });
                      setSelected(null);
                      setDetail(null);
                      await load();
                    }}
                  >
                    Eliminar
                  </IgBtn>
                )}
              </div>
            ) : null}

            {mode === "ficha" && !selected && (
              <div className={styles.personEmptyBox}>
                <strong>Ninguna ficha abierta</strong>
                <p>Elige a alguien del directorio o da de alta a una persona nueva.</p>
                <IgBtn variant="primary" onClick={() => startAlta("unified")}>
                  + Nueva persona
                </IgBtn>
              </div>
            )}
          </IgPanel>
        }
      />
    </IgPage>
  );
}
