import { isSalesManagerUser } from "@/lib/panel-user";
import type { User } from "@/components/UserContext";

export type SalesScope = {
  ownerId?: number;
  canManageSellers: boolean;
};

const toOwnerId = (value: unknown): number | undefined => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
};

export function getSalesScope(user: User | null | undefined, search?: string): SalesScope {
  const canManageSellers = isSalesManagerUser(user);

  const ownerFromQuery = (() => {
    if (!search) return undefined;
    try {
      const params = new URLSearchParams(search);
      return toOwnerId(params.get("ownerId"));
    } catch {
      return undefined;
    }
  })();

  if (canManageSellers) {
    return { canManageSellers, ownerId: ownerFromQuery };
  }

  return { canManageSellers: false, ownerId: toOwnerId(user?.id) };
}

