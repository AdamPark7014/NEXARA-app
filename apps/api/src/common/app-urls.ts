/**
 * Rutas canónicas del panel web (apps/web/app/(panels)).
 * Usar en relatedUrl de notificaciones, calendario y alertas.
 */

export const appUrls = {
  crmOpportunity: (id: number) => `/crm/opportunities/${id}`,
  crmLead: (id: number) => `/crm/leads?highlight=${id}`,
  crmClient: (id: number) => `/crm/clients/${id}`,
  crmQuote: (id: number) => `/crm/quotes/${id}`,
  crmProject: (id: number) => `/crm/projects/${id}`,
  crmTender: (id: number) => `/crm/tenders?highlight=${id}`,

  opsActivity: (id: number) => `/ops/activities/${id}`,
  opsActivityEvidences: (id: number) => `/ops/activities/${id}/evidences`,
  opsMyEvidences: (activityId?: number) =>
    activityId ? `/ops/my-evidences?activityId=${activityId}` : `/ops/my-evidences`,
  opsEvidencesReview: (activityId: number) => `/ops/evidences?activityId=${activityId}`,
  opsViatic: (id: number) => `/ops/viatics?highlight=${id}`,
  opsMyViatics: (id?: number) => (id ? `/ops/my-viatics?highlight=${id}` : `/ops/my-viatics`),
  opsMyVehicles: (id?: number) => (id ? `/ops/my-vehicles?highlight=${id}` : `/ops/my-vehicles`),
  opsProject: (id: number) => `/ops/projects/${id}`,
  opsMaintenance: (woId?: number) => (woId ? `/ops/maintenance?woId=${woId}` : `/ops/maintenance`),
  opsTools: (id?: number) => (id ? `/ops/tools?highlight=${id}` : `/ops/tools`),
  opsVehicles: (id?: number) => (id ? `/ops/vehicles?highlight=${id}` : `/ops/vehicles`),
  opsActivities: () => `/ops/activities`,

  erpAttendance: (tab?: string, highlightId?: number) => {
    if (tab === "lunch") return `/erp/hr/lunch-breaks`;
    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);
    if (highlightId != null) params.set("highlight", String(highlightId));
    const qs = params.toString();
    return qs ? `/erp/hr/attendance?${qs}` : `/erp/hr/attendance`;
  },
  erpExpenses: (highlightId?: number) =>
    highlightId ? `/erp/finance/expenses?highlight=${highlightId}` : `/erp/finance/expenses`,
  opsSupport: (id?: number) => (id ? `/ops/support/${id}` : `/ops/support`),
  opsSupportNew: (params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(params).toString() : "";
    return qs ? `/ops/support/new?${qs}` : `/ops/support/new`;
  },
  erpUsers: (id?: number) => (id ? `/erp/users?highlight=${id}` : `/erp/users`),
  erpProcurement: (tab: string, id?: number) =>
    id ? `/erp/procurement?tab=${tab}&id=${id}` : `/erp/procurement?tab=${tab}`,
  erpProcurementReceipt: (poId: number) => `/erp/procurement?tab=receipts&poId=${poId}`,
  erpWarehouse: (productId?: number) =>
    productId ? `/erp/warehouse?productId=${productId}` : `/erp/warehouse`,
  erpAccounting: (entryId?: number) =>
    entryId ? `/erp/accounting?highlight=${entryId}` : `/erp/accounting`,
  erpInvoicing: (invoiceId?: number, invoiceRef?: string) => {
    if (invoiceId) return `/erp/invoicing?highlight=${invoiceId}`;
    if (invoiceRef) return `/erp/invoicing?invoiceRef=${encodeURIComponent(invoiceRef)}`;
    return `/erp/invoicing`;
  },
  erpApprovals: (instanceId: number) => `/erp/approvals?highlight=${instanceId}`,
  erpFinanceViatics: (id?: number) =>
    id ? `/erp/finance/viatics?highlight=${id}` : `/erp/finance/viatics`,
  erpLunchBreaks: (highlightId?: number) =>
    highlightId ? `/erp/hr/lunch-breaks?highlight=${highlightId}` : `/erp/hr/lunch-breaks`,
};
