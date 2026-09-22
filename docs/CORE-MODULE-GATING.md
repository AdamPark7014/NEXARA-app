# NEXARA Core — inserting a role‑gated ERP module (brief)

Commercial/ERP modules in Core follow three layers plus the Core filter:

- PAGE_MATRIX (apps/web/lib/rbac/page-matrix.ts): whitelist of pages per role
- shouldShowModuleInSidebar (apps/web/lib/section-views.ts): menu visibility per role
- URL_MATRIX → /me/navigation (apps/api/src/common/rbac/url-matrix.ts): server clip of allowed URLs
- Core-only filter (apps/web/lib/core-surface.ts): sidebar shows only CORE_OLA1_MODULE_IDS

Recipe (keep the three layers in sync):

1) access-matrix.ts — add/update the `MODULES[...]` entry with a narrow `allowedRoles` set. Avoid `ANY_INTERNAL` for commercial modules.
2) page-matrix.ts — DO NOT add the route to `CORE_OLA1_PAGE_PATHS` if it’s commercial; create `XYZ_CORE_PATHS` and include it only for the intended roles (e.g., CEO, sales managers, sales rep).
3) url-matrix.ts — mirror with `XYZ_CORE_URL_RULES` (pages + APIs) and include them only for those roles so `/me/navigation` does not reintroduce clipped modules.
4) core-surface.ts — if the module should appear in Core-only production, add its id to `CORE_OLA1_MODULE_IDS`.
5) role-modules.spec.ts — if the visible catalog changes for a role, update `EXPECTED_MODULES` in the same commit.

Tip: run `npm run test:web` — `role-modules.spec.ts` ensures the three layers agree.

