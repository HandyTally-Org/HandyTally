# HandyTally documentation

| Document | What it is | Keep current? |
| --- | --- | --- |
| [architecture.md](architecture.md) | Detailed technical breakdown: clients, auth and RLS, multi-tenancy, data model, edge functions, key flows, build and deploy, environments, quality gates | **Yes** — update when the system changes |
| [deploy-customer.md](deploy-customer.md) | Runbook for bringing a customer live on `<subdomain>.handytally.com`: prerequisites, per-customer steps, smoke test, rollback, troubleshooting | **Yes** — fix the step in the same PR that changes the behaviour |
| [dev-issues.md](dev-issues.md) | Catalog of known technical issues (`DI-nn`) with evidence, impact, fix and status, plus a suggested order of work | **Yes** — add the `HT-n` ticket when an issue is picked up; move it to a "Resolved" section when merged |
| [context.md](context.md) | Original product brief and first-draft data model | No — historical; superseded by `architecture.md` |
| [tasks.md](tasks.md) | Original ten-phase build plan | No — historical; used as the roadmap source in the root README |

Related docs elsewhere in the repository:

- [`../README.md`](../README.md) — project overview and setup (GitHub front page)
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — workflow, conventions, PR checklist
- [`../SECURITY.md`](../SECURITY.md) — vulnerability reporting
- [`../CHANGELOG.md`](../CHANGELOG.md) — release notes
- [`../web/README.md`](../web/README.md), [`../admin-app/README.md`](../admin-app/README.md), [`../supabase/README.md`](../supabase/README.md) — per-package guides
- [`../database/README.md`](../database/README.md) — auth admin RPCs
