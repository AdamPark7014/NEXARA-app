#!/usr/bin/env python3
import re
import sys
from pathlib import Path

"""
Disable code signing for all PBXNativeTarget build configurations except the given app target.
Sets CODE_SIGNING_ALLOWED=NO and CODE_SIGNING_REQUIRED=NO, and clears CODE_SIGN_IDENTITY/PROVISIONING_PROFILE(_SPECIFIER).
Usage:
  ios_disable_deps_signing.py <path-to-project.pbxproj> <app-target-name>
"""

def main():
  if len(sys.argv) < 3:
    print("Usage: ios_disable_deps_signing.py <project.pbxproj> <app-target-name>", file=sys.stderr)
    sys.exit(2)
  pbxproj_path = Path(sys.argv[1])
  app_target = sys.argv[2]
  s = pbxproj_path.read_text(encoding="utf-8")

  # Find all native targets with their config list UUIDs and names
  targets = []
  for tm in re.finditer(r'([A-F0-9]{24}) /\* (.*?) \*/ = \{\s*isa = PBXNativeTarget;[\s\S]*?buildConfigurationList = ([A-F0-9]{24}) /\* Build configuration list for PBXNativeTarget "(.*?)" \*/;', s):
    target_uuid = tm.group(1)
    target_name_comment = tm.group(2)
    cfg_list_uuid = tm.group(3)
    target_name = tm.group(4)
    targets.append((target_uuid, target_name, cfg_list_uuid))

  # Helper: get config UUIDs from a configuration list UUID
  def get_cfg_uuids(cfg_list_uuid, target_name):
    lm = re.search(rf'{cfg_list_uuid} /\* Build configuration list for PBXNativeTarget "{re.escape(target_name)}" \*/ = \{{[\s\S]*?buildConfigurations = \(([\s\S]*?)\);', s)
    if not lm:
      return []
    inside = lm.group(1)
    return re.findall(r'([A-F0-9]{24}) /\* .*? \*/,?', inside)

  # Helper: patch one XCBuildConfiguration's buildSettings
  def patch_config(txt, cfg_uuid):
    pat = rf'({cfg_uuid}) /\* .*? \*/ = \{{\s*isa = XCBuildConfiguration;\s*buildSettings = \{{([\s\S]*?)\}};\s*name = .*?;\s*\}};'
    def repl(m):
      body = m.group(2)
      # remove any existing relevant keys
      for k in ["CODE_SIGNING_ALLOWED","CODE_SIGNING_REQUIRED","CODE_SIGN_IDENTITY","PROVISIONING_PROFILE","PROVISIONING_PROFILE_SPECIFIER"]:
        body = re.sub(rf'\s*{re.escape(k)}\s*=\s*[^;]*;', '', body)
      inject = (
        "\n\t\t\t\tCODE_SIGNING_ALLOWED = NO;"
        "\n\t\t\t\tCODE_SIGNING_REQUIRED = NO;"
        "\n\t\t\t\tCODE_SIGN_IDENTITY = ;"
        "\n\t\t\t\tPROVISIONING_PROFILE = ;"
        "\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = ;"
      )
      new_body = body.rstrip() + inject + "\n\t\t\t"
      return m.group(0).replace(m.group(2), new_body)
    return re.sub(pat, repl, txt, count=1, flags=re.S)

  # Collect config UUIDs to patch (non-app targets)
  deps_cfgs = set()
  for _, name, cfg_list in targets:
    if name != app_target:
      deps_cfgs.update(get_cfg_uuids(cfg_list, name))
  # Apply patches
  out = s
  for cfg in deps_cfgs:
    out = patch_config(out, cfg)

  pbxproj_path.write_text(out, encoding="utf-8")
  print(f"Disabled signing on {len(deps_cfgs)} configurations (non-app targets).")

if __name__ == "__main__":
  main()

