import { buildApiUrl } from "@/lib/api-base";
import { withTenantHeaders } from "@/lib/tenant";

export const EXPENSE_CATEGORIES = [
  "Renta",
  "Servicios",
  "Suscripciones",
  "Material",
  "Publicidad",
  "Equipo",
  "Nómina",
  "Impuestos",
  "Otro",
] as const;

export type ExpenseAdminFields = {
  concepto: string;
  monto: number;
  categoria?: string;
  esRecurrente?: boolean;
  fecha?: string;
  ticketEvidenciaUrl?: string;
  usuarioId?: number;
};

export type EmployeePaymentFields = {
  userId: number;
  concepto?: string;
  periodFrom: string;
  periodTo: string;
  amount: number;
  note?: string;
  status?: string;
  totalMinutes?: number;
};

export type FinanceAnalyticsBucket = { name: string; total: number; count: number };

export type ExpensesAnalytics = {
  periodLabel: string;
  totalSolicitado: number;
  totalAprobado: number;
  totalPagado: number;
  count: number;
  pendientes: number;
  byCategory: FinanceAnalyticsBucket[];
  byPerson: FinanceAnalyticsBucket[];
};

export type EmployeePaymentsAnalytics = {
  periodLabel: string;
  totalPagado: number;
  totalBorrador: number;
  count: number;
  employees: number;
  byEmployee: FinanceAnalyticsBucket[];
};

async function parseError(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return `HTTP ${res.status}`;
  try {
    const json = JSON.parse(text);
    return Array.isArray(json?.message) ? json.message.join(", ") : json?.message || text;
  } catch {
    return text;
  }
}

export async function financeFetch(path: string, token: string, opts?: RequestInit) {
  const headers = withTenantHeaders({
    Authorization: `Bearer ${token}`,
    ...(opts?.headers as Record<string, string> | undefined),
  }) as Record<string, string>;
  const isForm = typeof FormData !== "undefined" && opts?.body instanceof FormData;
  if (!isForm && !headers["Content-Type"] && opts?.body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(buildApiUrl(path), { ...opts, headers });
  if (!res.ok) throw new Error(await parseError(res));
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function appendExpenseFields(form: FormData, fields: Partial<ExpenseAdminFields>) {
  if (fields.concepto !== undefined) form.append("concepto", fields.concepto);
  if (fields.monto !== undefined) form.append("monto", String(fields.monto));
  if (fields.categoria !== undefined) form.append("categoria", fields.categoria);
  if (fields.esRecurrente !== undefined) form.append("esRecurrente", String(fields.esRecurrente));
  if (fields.fecha !== undefined) form.append("fecha", fields.fecha);
  if (fields.ticketEvidenciaUrl) form.append("ticketEvidenciaUrl", fields.ticketEvidenciaUrl);
  if (fields.usuarioId !== undefined) form.append("usuarioId", String(fields.usuarioId));
}

export async function postExpenseAdmin(
  token: string,
  fields: ExpenseAdminFields,
  file?: File | null,
) {
  const form = new FormData();
  appendExpenseFields(form, fields);
  if (file) form.append("ticketEvidencia", file);
  return financeFetch("expenses", token, { method: "POST", body: form });
}

export async function patchExpenseAdmin(
  token: string,
  id: number,
  fields: Partial<ExpenseAdminFields>,
  file?: File | null,
) {
  const form = new FormData();
  appendExpenseFields(form, fields);
  if (file) form.append("ticketEvidencia", file);
  return financeFetch(`expenses/${id}`, token, { method: "PATCH", body: form });
}

export async function approveExpense(
  token: string,
  id: number,
  action: "approve" | "reject",
  note?: string,
) {
  return financeFetch(`expenses/${id}/approve`, token, {
    method: "PATCH",
    body: JSON.stringify({ action, note }),
  });
}

export async function markExpensePagado(token: string, id: number) {
  return financeFetch(`expenses/${id}/pagado`, token, { method: "PATCH", body: "{}" });
}

export async function deleteExpense(token: string, id: number) {
  return financeFetch(`expenses/${id}`, token, { method: "DELETE" });
}

export async function fetchExpensesAnalytics(
  token: string,
  filters: { from?: string; to?: string } = {},
): Promise<ExpensesAnalytics> {
  const qs = new URLSearchParams();
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  return financeFetch(`expenses/analytics?${qs}`, token);
}

export async function downloadExpensesReportPdf(
  token: string,
  filters: { from?: string; to?: string } = {},
) {
  const qs = new URLSearchParams();
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  const res = await fetch(buildApiUrl(`expenses/report.pdf?${qs}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gastos-${filters.from || "inicio"}-${filters.to || "hoy"}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function appendPaymentFields(form: FormData, fields: Partial<EmployeePaymentFields>) {
  if (fields.userId !== undefined) form.append("userId", String(fields.userId));
  if (fields.concepto !== undefined) form.append("concepto", fields.concepto);
  if (fields.periodFrom !== undefined) form.append("periodFrom", fields.periodFrom);
  if (fields.periodTo !== undefined) form.append("periodTo", fields.periodTo);
  if (fields.amount !== undefined) form.append("amount", String(fields.amount));
  if (fields.note !== undefined) form.append("note", fields.note);
  if (fields.status !== undefined) form.append("status", fields.status);
  if (fields.totalMinutes !== undefined) form.append("totalMinutes", String(fields.totalMinutes));
}

export async function postEmployeePayment(
  token: string,
  fields: EmployeePaymentFields,
  files?: File[],
) {
  const form = new FormData();
  appendPaymentFields(form, fields);
  (files ?? []).forEach((file) => form.append("files", file));
  return financeFetch("employee-payments", token, { method: "POST", body: form });
}

export async function patchEmployeePayment(
  token: string,
  id: number,
  fields: Partial<EmployeePaymentFields>,
  files?: File[],
) {
  const hasFiles = Boolean(files?.length);
  if (hasFiles) {
    const form = new FormData();
    appendPaymentFields(form, fields);
    files!.forEach((file) => form.append("files", file));
    return financeFetch(`employee-payments/${id}`, token, { method: "PATCH", body: form });
  }
  return financeFetch(`employee-payments/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

export async function markEmployeePaymentPagado(token: string, id: number) {
  return financeFetch(`employee-payments/${id}/pagado`, token, { method: "PATCH", body: "{}" });
}

export async function deleteEmployeePayment(token: string, id: number) {
  return financeFetch(`employee-payments/${id}`, token, { method: "DELETE" });
}

export async function fetchEmployeePaymentsAnalytics(
  token: string,
  filters: { from?: string; to?: string; userId?: number } = {},
): Promise<EmployeePaymentsAnalytics> {
  const qs = new URLSearchParams();
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  if (filters.userId) qs.set("userId", String(filters.userId));
  return financeFetch(`employee-payments/analytics?${qs}`, token);
}

export async function downloadEmployeePaymentsReportPdf(
  token: string,
  filters: { from?: string; to?: string; userId?: number } = {},
) {
  const qs = new URLSearchParams();
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  if (filters.userId) qs.set("userId", String(filters.userId));
  const res = await fetch(buildApiUrl(`employee-payments/report.pdf?${qs}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pagos-${filters.from || "inicio"}-${filters.to || "hoy"}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
