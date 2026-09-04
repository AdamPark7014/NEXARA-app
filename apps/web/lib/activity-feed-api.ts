import { apiRequest, parseResponseJson } from "@/lib/api-base";

export type ActivityFeedItem = {
  id: string;
  kind: "notification" | "audit" | "sales" | "ops" | "crm" | "procurement";
  at: string;
  title: string;
  subtitle?: string;
  actorName?: string;
  deepLink?: string;
  icon: string;
  priority?: "high" | "normal" | "low";
};

export async function fetchActivityFeed(token: string, limit = 40) {
  const res = await apiRequest(`activity-feed?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  const data = await parseResponseJson<{ items: ActivityFeedItem[]; total: number }>(res);
  return data ?? { items: [], total: 0 };
}
