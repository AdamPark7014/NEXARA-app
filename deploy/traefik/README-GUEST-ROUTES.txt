PLATFORM RULES — do not ignore

Traefik config is owned by /opt/traefik/ (NOT this folder).
This directory only holds Nexara-owned YAML (nexara.yml, tls-options, …).

Guest apps (ARTA, School, Agora, Family, …) install into:
  /opt/traefik/config/<name>.yml
via /opt/traefik/bin/install-route.sh

After Nexara deploy, update.sh calls /opt/traefik/sync-nexara-routes.sh
which refreshes platform files and re-asserts ALL guests — it never deletes them.

See /opt/traefik/README.md
