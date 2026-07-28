# ADR-0016: Attendance + Studio CMS tenant stamps

## Status
Accepted — 2026-07-25

## Context
Attendance and Studio CMS were global, enabling cross-tenant HR and content leaks.

## Decision
- Stamp `Attendance`, `AttendanceDay`, `LunchBreak`, `NewsPost`, `PageContent` with `companyId`.
- Composite uniques: `(companyId, slug)` for news, `(companyId, section)` for page content.
- Public CMS reads use `resolvePublicCompanyId()` (`PUBLIC_COMPANY_ID` or primary) under tenant bypass.
- Studio admin mutations require `X-Company-Id` / ALS middleware.

## Consequences
Migrate before deploy. Public landing continues to serve primary/public tenant only until white-label host mapping lands.
