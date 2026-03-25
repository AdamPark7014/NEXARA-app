import { buildApiUrl } from "@/lib/api-base";

export type SalesLead = {
  id: number;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status: string;
  score: number;
  notes?: string | null;
};

export type SalesOpportunityNote = {
  id: number;
  message: string;
  createdAt: string;
};

export type SalesOpportunityEvidence = {
  id: number;
  fileUrl: string;
  fileName?: string | null;
  kind?: string | null;
};

export type SalesOpportunityQuote = {
  id: number;
  cotizacionId?: number | null;
  versionLabel?: string | null;
  pdfUrl?: string | null;
  createdAt: string;
};

export type SalesOpportunity = {
  id: number;
  title: string;
  description?: string | null;
  stage: string;
  value: number;
  probability: number;
  expectedCloseDate?: string | null;
  clientName?: string | null;
  clientId?: number | null;
  notes?: SalesOpportunityNote[];
  evidences?: SalesOpportunityEvidence[];
  quotes?: SalesOpportunityQuote[];
};

export type SalesProject = {
  id: number;
  name: string;
  status: string;
  margin: number;
};

export type SalesDashboardData = {
  leads: Array<{ id: number; name: string; company: string; score: number }>;
  opportunities: Array<{ id: number; title: string; stage: string; value: number }>;
  projects: Array<{ id: number; name: string; status: string; margin: number }>;
  stats: {
    pipelineValue: number;
    opportunityCount: number;
    projectCount: number;
    clientCount: number;
  };
};

export type SalesQuote = {
  id: number;
  quoteNumber: string;
  clientName?: string;
  clientCompany?: string;
  projectName?: string;
  total: string;
  status: string;
  issueDate: string;
  items: Array<{ id: number; name: string; qty: number }>;
};

export type SalesClientDocument = {
  id: number;
  type: string;
  fileUrl: string;
  fileName?: string | null;
  version: number;
  createdAt: string;
};

export type SalesClient = {
  id: number;
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  fiscalAddress?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
  industry?: string | null;
  website?: string | null;
  status?: string | null;
  notes?: string | null;
  documents?: SalesClientDocument[];
};

export type SalesProjectDetail = {
  id: number;
  name: string;
  budget: number;
  costProducts: number;
  costViáticos: number;
  costOperativo: number;
  margin: number;
  status: string;
  opportunity?: { id: number; title: string } | null;
};

export type SalesProjectOrder = {
  id: number;
  orderId: string;
  orderPdfUrl: string;
  status: string;
  createdAt: string;
};

export type SalesMetrics = {
  totalRevenue: number;
  opportunityCount: number;
  projectCount: number;
  averageMargin: number;
  conversionRate: number;
  pipelineValue: number;
  closedProjects: number;
  activeClients: number;
};

export type SalesVendorStats = {
  userId: number;
  userName: string;
  revenue: number;
  opportunities: number;
  projects: number;
  margin: number;
  conversionRate: number;
  performance: number;
  targetRevenue?: number;
  targetOpportunities?: number;
  attainmentRevenue?: number;
  attainmentOpportunities?: number;
  revenueGap?: number;
  status?: 'on-track' | 'risk' | 'off-track';
};

export type SalesQuotaPayload = {
  period: 'week' | 'month' | 'year';
  ownerId?: number;
  targetRevenue: number;
  targetOpportunities?: number;
};

export type SalesExecutiveInsights = {
  forecast: {
    weightedForecast: number;
    forecastCoverage: number;
    commitForecast: number;
    bestCaseForecast: number;
    worstCaseForecast: number;
  };
  efficiency: {
    avgCycleDays: number;
    conversionRate: number;
    averageMargin: number;
  };
  stageDistribution: Record<string, number>;
  pipelineAging: {
    byStage: Array<{ stage: string; count: number; avgDays: number }>;
    buckets: {
      bucket0to7: number;
      bucket8to30: number;
      bucket31to60: number;
      bucket60plus: number;
    };
  };
  nextActionCompliance: {
    activeOpportunities: number;
    opportunitiesWithActionPlan: number;
    actionPlanCoverage: number;
    overdueNextActions: number;
  };
  pipelineHygiene: {
    score: number;
    staleOpportunities14d: number;
    staleOpportunities30d: number;
    opportunitiesWithoutRecentActivity: number;
    highValueLowProbability: number;
  };
  cadenceExecution: {
    opportunitiesWithoutRecentActivity: number;
    avgTouchesPerOpportunity: number;
  };
  repRiskSummary: {
    onTrack: number;
    risk: number;
    offTrack: number;
  };
  vendorStatus: Array<{
    userId: number;
    userName: string;
    status: 'on-track' | 'risk' | 'off-track';
    attainmentRevenue: number;
    targetRevenue: number;
    revenue: number;
  }>;
  riskAlerts: Array<{ level: 'high' | 'medium' | 'low'; message: string }>;
  topActions: Array<{ action: string; count: number }>;
};

export type SalesManagerCockpit = {
  summary: {
    activeOpportunities: number;
    coachingQueue: number;
    overdueActions: number;
  };
  coachingPriorities: Array<{
    opportunityId: number;
    title: string;
    ownerId: number | null;
    ownerName: string;
    stage: string;
    value: number;
    riskScore: number;
    overdue: boolean;
    staleDays: number;
    withoutRecentActivity: boolean;
    recommendation: string;
  }>;
  capacityBySeller: Array<{
    ownerId: number;
    ownerName: string;
    activePipeline: number;
    targetCapacity: number;
    utilization: number;
  }>;
  leaderboard: Array<{
    userId: number;
    userName: string;
    performance: number;
    revenue: number;
    status: 'on-track' | 'risk' | 'off-track';
  }>;
};

export type SalesAuditEvent = {
  id: number;
  action: string;
  entityType: string;
  entityId?: number | null;
  actorId?: number | null;
  metadata?: unknown;
  createdAt: string;
  actor?: { id: number; nombre: string; email: string } | null;
};

type FetchInit = RequestInit & {
  token: string;
};

const getErrorMessage = (payload: unknown, fallback: string, status?: number) => {
  const serviceUnavailableMessage =
    "Servicio temporalmente no disponible (502/5xx). Intenta de nuevo en unos minutos.";

  if (typeof payload === "string" && payload.trim()) {
    const text = payload.trim();
    const isHtmlError = /<html|<!doctype/i.test(text);
    if (isHtmlError) {
      return status && status >= 500 ? serviceUnavailableMessage : fallback;
    }
    return text;
  }
  if (payload && typeof payload === "object") {
    const maybeMessage = (payload as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }
    if (Array.isArray(maybeMessage) && maybeMessage.length > 0) {
      return String(maybeMessage[0]);
    }
  }
  return fallback;
};

const parseResponsePayload = (text: string): unknown => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const apiRequest = async <T>(path: string, init: FetchInit, fallbackError = "Error en solicitud"): Promise<T> => {
  const { token, headers, ...rest } = init;
  const response = await fetch(buildApiUrl(path), {
    ...rest,
    headers: {
      ...(headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();
  const payload = parseResponsePayload(text);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, fallbackError, response.status));
  }

  return payload as T;
};

const safeDashboardFetch = async <T>(request: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await request;
  } catch {
    return fallback;
  }
};

export const listSalesLeads = async (token: string, filters?: { ownerId?: number }) => {
  const search = new URLSearchParams();
  if (filters?.ownerId) search.set("ownerId", String(filters.ownerId));
  const path = `ventas/leads${search.toString() ? `?${search.toString()}` : ""}`;
  const data = await apiRequest<unknown>(path, { token, method: "GET" }, "No se pudieron cargar los leads");
  return Array.isArray(data) ? (data as SalesLead[]) : [];
};

export const createSalesLead = async (
  token: string,
  payload: {
    name: string;
    company: string;
    email: string;
    phone: string;
    source: string;
    status: string;
    score: number;
    notes: string;
  },
) => {
  return apiRequest<SalesLead>(
    "ventas/leads",
    {
      token,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "No se pudo crear el lead",
  );
};

export const updateSalesLead = async (
  token: string,
  id: number,
  payload: Partial<{
    name: string;
    company: string;
    email: string;
    phone: string;
    source: string;
    status: string;
    score: number;
    notes: string;
  }>,
) => {
  return apiRequest<SalesLead>(
    `ventas/leads/${id}`,
    {
      token,
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "No se pudo actualizar el lead",
  );
};

export const listSalesOpportunities = async (token: string, filters?: { ownerId?: number }) => {
  const search = new URLSearchParams();
  if (filters?.ownerId) search.set("ownerId", String(filters.ownerId));
  const path = `ventas/oportunidades${search.toString() ? `?${search.toString()}` : ""}`;
  const data = await apiRequest<unknown>(path, { token, method: "GET" }, "No se pudieron cargar las oportunidades");
  return Array.isArray(data) ? (data as SalesOpportunity[]) : [];
};

export const getSalesOpportunity = async (token: string, id: number) => {
  return apiRequest<SalesOpportunity>(`ventas/oportunidades/${id}`, { token, method: "GET" }, "No se pudo cargar la oportunidad");
};

export const createSalesOpportunity = async (
  token: string,
  payload: {
    title: string;
    description: string;
    stage: string;
    value: number;
    probability: number;
    expectedCloseDate?: string;
  },
) => {
  return apiRequest<SalesOpportunity>(
    "ventas/oportunidades",
    {
      token,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "No se pudo crear la oportunidad",
  );
};

export const updateSalesOpportunityStage = async (token: string, opportunityId: number, stage: string) => {
  return apiRequest<SalesOpportunity>(
    `ventas/oportunidades/${opportunityId}`,
    {
      token,
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    },
    "Error al actualizar etapa",
  );
};

export const addSalesOpportunityNote = async (token: string, opportunityId: number, message: string) => {
  return apiRequest<SalesOpportunityNote>(
    `ventas/oportunidades/${opportunityId}/notas`,
    {
      token,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    },
    "Error al agregar nota",
  );
};

export const getSalesDashboardData = async (token: string, filters?: { ownerId?: number }): Promise<SalesDashboardData> => {
  const [leads, opportunities, projects] = await Promise.all([
    safeDashboardFetch(listSalesLeads(token, filters), [] as SalesLead[]),
    safeDashboardFetch(listSalesOpportunities(token, filters), [] as SalesOpportunity[]),
    safeDashboardFetch(
      apiRequest<unknown>(
        `ventas/proyectos${filters?.ownerId ? `?ownerId=${filters.ownerId}` : ""}`,
        { token, method: "GET" },
        "No se pudieron cargar los proyectos",
      ),
      [] as unknown,
    ),
  ]);

  const safeProjects = Array.isArray(projects) ? (projects as SalesProject[]) : [];
  const pipelineValue = opportunities.reduce((sum, opportunity) => sum + Number(opportunity.value || 0), 0);
  const clientCount = new Set(opportunities.map((opportunity) => opportunity.clientId).filter(Boolean)).size;

  return {
    leads: leads.slice(0, 5).map((lead) => ({
      id: lead.id,
      name: lead.name || "Sin nombre",
      company: lead.company || "Sin empresa",
      score: Number(lead.score || 0),
    })),
    opportunities: opportunities.slice(0, 5).map((opportunity) => ({
      id: opportunity.id,
      title: opportunity.title,
      stage: opportunity.stage,
      value: Number(opportunity.value || 0),
    })),
    projects: safeProjects.slice(0, 5).map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      margin: Number(project.margin || 0),
    })),
    stats: {
      pipelineValue,
      opportunityCount: opportunities.length,
      projectCount: safeProjects.length,
      clientCount,
    },
  };
};

export const listSalesQuotes = async (token: string, filters?: { clientName?: string; status?: string }) => {
  const search = new URLSearchParams();
  if (filters?.clientName) search.set("clientName", filters.clientName);
  if (filters?.status) search.set("status", filters.status);
  const path = `ventas/cotizaciones${search.toString() ? `?${search.toString()}` : ""}`;
  const data = await apiRequest<unknown>(path, { token, method: "GET" }, "No se pudieron cargar las cotizaciones");
  return Array.isArray(data) ? (data as SalesQuote[]) : [];
};

export const linkSalesQuoteToOpportunity = async (
  token: string,
  cotizacionId: number,
  opportunityId: number,
  versionLabel?: string,
) => {
  return apiRequest<unknown>(
    `ventas/cotizaciones/${cotizacionId}/link/${opportunityId}`,
    {
      token,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionLabel }),
    },
    "No se pudo vincular la cotización",
  );
};

export const listSalesClients = async (token: string, filters?: { ownerId?: number }) => {
  const search = new URLSearchParams();
  if (filters?.ownerId) search.set("ownerId", String(filters.ownerId));
  const path = `ventas/clientes${search.toString() ? `?${search.toString()}` : ""}`;
  const data = await apiRequest<unknown>(path, { token, method: "GET" }, "No se pudieron cargar los clientes");
  return Array.isArray(data) ? (data as SalesClient[]) : [];
};

export const createSalesClient = async (
  token: string,
  payload: {
    name: string;
    legalName: string;
    taxId: string;
    fiscalAddress: string;
    billingEmail: string;
    billingPhone: string;
    industry: string;
    website: string;
    status: string;
    notes: string;
  },
) => {
  return apiRequest<SalesClient>(
    "ventas/clientes",
    {
      token,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "No se pudo crear el cliente",
  );
};

export const uploadSalesClientDocuments = async (
  token: string,
  clientId: number,
  documentType: string,
  files: File[],
) => {
  const formData = new FormData();
  formData.append("type", documentType.trim());
  files.forEach((file) => formData.append("files", file));
  return apiRequest<unknown>(
    `ventas/clientes/${clientId}/documentos`,
    {
      token,
      method: "POST",
      body: formData,
    },
    "No se pudieron subir los documentos",
  );
};

export const listSalesProjects = async (token: string, filters?: { ownerId?: number }) => {
  const search = new URLSearchParams();
  if (filters?.ownerId) search.set("ownerId", String(filters.ownerId));
  const path = `ventas/proyectos${search.toString() ? `?${search.toString()}` : ""}`;
  const data = await apiRequest<unknown>(path, { token, method: "GET" }, "No se pudieron cargar los proyectos");
  return Array.isArray(data) ? (data as SalesProjectDetail[]) : [];
};

export const createSalesProject = async (
  token: string,
  payload: {
    opportunityId: number;
    name: string;
    budget: number;
    costProducts: number;
    costViáticos: number;
    costOperativo: number;
    status: string;
  },
) => {
  return apiRequest<SalesProjectDetail>(
    "ventas/proyectos",
    {
      token,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "No se pudo crear el proyecto",
  );
};

export const closeSalesProject = async (token: string, projectId: number) => {
  return apiRequest<SalesProjectOrder>(
    `ventas/proyectos/${projectId}/close`,
    {
      token,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    "No se pudo cerrar el proyecto",
  );
};

export const getSalesProjectOrder = async (token: string, projectId: number) => {
  return apiRequest<SalesProjectOrder>(
    `ventas/proyectos/${projectId}/orden`,
    { token, method: "GET" },
    "No se pudo cargar la orden del proyecto",
  );
};

export const getSalesMetrics = async (token: string, period: 'week' | 'month' | 'year') => {
  return apiRequest<SalesMetrics>(
    `ventas/reportes/metricas?period=${period}`,
    { token, method: 'GET' },
    'Error al cargar métricas',
  );
};

export const getSalesVendorStats = async (token: string, period: 'week' | 'month' | 'year') => {
  const data = await apiRequest<unknown>(
    `ventas/reportes/vendedores?period=${period}`,
    { token, method: 'GET' },
    'Error al cargar métricas por vendedor',
  );
  return Array.isArray(data) ? (data as SalesVendorStats[]) : [];
};

export const getSalesExecutiveInsights = async (token: string, period: 'week' | 'month' | 'year') => {
  return apiRequest<SalesExecutiveInsights>(
    `ventas/reportes/insights?period=${period}`,
    { token, method: 'GET' },
    'Error al cargar insights ejecutivos',
  );
};

export const getSalesManagerCockpit = async (token: string, period: 'week' | 'month' | 'year') => {
  return apiRequest<SalesManagerCockpit>(
    `ventas/reportes/cockpit?period=${period}`,
    { token, method: 'GET' },
    'Error al cargar cockpit comercial',
  );
};

export const getSalesAuditEvents = async (token: string, period: 'week' | 'month' | 'year', limit = 50) => {
  const data = await apiRequest<unknown>(
    `ventas/reportes/auditoria?period=${period}&limit=${limit}`,
    { token, method: 'GET' },
    'Error al cargar auditoría comercial',
  );
  return Array.isArray(data) ? (data as SalesAuditEvent[]) : [];
};

export const getSalesQuotaProgress = async (token: string, period: 'week' | 'month' | 'year') => {
  const data = await apiRequest<unknown>(
    `ventas/reportes/cuotas?period=${period}`,
    { token, method: 'GET' },
    'Error al cargar cuotas de ventas',
  );
  return Array.isArray(data) ? (data as SalesVendorStats[]) : [];
};

export const setSalesQuota = async (token: string, payload: SalesQuotaPayload) => {
  return apiRequest<unknown>(
    'ventas/reportes/cuotas',
    {
      token,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Error al configurar cuota de ventas',
  );
};

