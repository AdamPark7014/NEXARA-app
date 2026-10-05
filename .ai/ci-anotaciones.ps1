param([string]$Sha = "")
# Estado de CI y errores (anotaciones) de un commit, sin `gh` (el repo es público).
# Límite sin sesión: 60 consultas por hora.
$repo = "AdamPark7014/NEXARA-app"
if (-not $Sha) { $Sha = (git rev-parse HEAD).Trim() }
$h = @{ "User-Agent" = "nexara-ci"; "Accept" = "application/vnd.github+json" }
$runs = (Invoke-RestMethod "https://api.github.com/repos/$repo/commits/$Sha/check-runs?per_page=50" -Headers $h).check_runs
foreach ($r in $runs) {
  "{0,-40} {1,-11} {2}" -f $r.name, $r.status, $r.conclusion
}
foreach ($r in $runs | Where-Object { $_.conclusion -eq "failure" }) {
  "`n=== $($r.name) ==="
  $ann = Invoke-RestMethod "https://api.github.com/repos/$repo/check-runs/$($r.id)/annotations?per_page=50" -Headers $h
  foreach ($a in $ann) { "[$($a.title)] $($a.message)" }
}
