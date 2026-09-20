import { erpFetch } from "@/lib/erp-api";

export type PeerRequestStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export type PeerRequestUser = {
  id: number;
  nombre: string;
  email?: string | null;
  avatarUrl: string | null;
  puesto: string | null;
  roleKey?: string | null;
};

export type PeerRequestItem = {
  id: number;
  title: string;
  description: string | null;
  status: PeerRequestStatus;
  rejectReason: string | null;
  activityId: number | null;
  createdAt: string;
  updatedAt: string;
  fromUser: PeerRequestUser;
  toUser: PeerRequestUser;
  activity: { id: number; anNumber: string; titulo: string } | null;
};

export type PeerRequestsResponse = {
  sent: PeerRequestItem[];
  received: PeerRequestItem[];
};

/** API: GET/POST/PATCH /me/activity-requests (solicitudes entre pares). */
export function fetchPeerRequests(token: string) {
  return erpFetch<PeerRequestsResponse>("me/activity-requests", token);
}

export function createPeerRequest(
  token: string,
  body: { toUserId: number; title: string; description?: string },
) {
  return erpFetch<PeerRequestItem>("me/activity-requests", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function acceptPeerRequest(token: string, id: number) {
  return erpFetch<PeerRequestItem>(`me/activity-requests/${id}/accept`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

export function rejectPeerRequest(token: string, id: number, reason: string) {
  return erpFetch<PeerRequestItem>(`me/activity-requests/${id}/reject`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}
