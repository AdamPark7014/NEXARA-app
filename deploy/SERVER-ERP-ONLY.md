ERP-only production deploy
==========================

This repository includes reusable panels and components (studio, ops, crm, etc.) that are helpful during development. The production web surface is ERP Core only: `apps/web/app/(panels)/erp/**`.

What ships to production
- ERP web app: `apps/web/app/(panels)/erp/**`
- Shared UI and ERP-required libraries under `apps/web/components/**` (e.g. `finance`, `hr`, `ops` where ERP uses them)

What is intentionally excluded from the production image
- Non-ERP panels under `apps/web/app/(panels)/`:
  - `finance/**` (top-level panel app)
  - `hr/**` (top-level panel app)
  - `integra/**`
- Component libraries not used by ERP:
  - `apps/web/components/studio/**`
  - `apps/web/components/crm/**`

How it’s enforced
- `.dockerignore` excludes the folders above so they aren’t copied into the Docker build context. The web Dockerfile (`deploy/docker/Dockerfile.web`) uses `COPY . .`, so the ignore list drives what makes it into the image.
- ERP code no longer imports from `components/crm/*` (Procurement page now uses `components/erp/erp-chrome.module.css`), so excluding `components/crm/**` does not break the build.

Notes and risks
- Do NOT exclude `apps/web/components/ops/**`: ERP uses these components (actividades, evidencias, asistencia). Excluding that folder would break the web build.
- If future ERP routes reference any excluded folders, the Next.js build will fail. Repoint styles/assets to ERP/shared modules before excluding new paths.

Optional server cleanup (bare-metal checkout)
If the server keeps a working tree (outside Docker) and you want it lean:

```bash
# Remove non-ERP panels and non-prod component dirs from the working copy (optional)
rm -rf apps/web/app/'(panels)'/{finance,hr,integra}
rm -rf apps/web/components/{studio,crm}
```

These cleanups are optional; the image is already ERP-only via `.dockerignore`.
