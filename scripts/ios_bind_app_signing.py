#!/usr/bin/env python3
import re
import sys
from pathlib import Path

"""
Bind manual signing to the given app target and disable signing for other native targets.

Args:
  1: project.pbxproj path
  2: app target name (e.g., NexaraApp)
  3: team id (e.g., AHNW9K8745)
  4: provisioning profile UUID
  5: provisioning profile specifier (profile Name)
  6: code sign identity (e.g., Apple Distribution)

Exits 1 if the app target or its configurations cannot be found.
"""

def find_native_targets(text: str):
    targets = []
    pat = r'([A-F0-9]{24}) /\* (.*?) \*/ = \{\s*isa = PBXNativeTarget;[\s\S]*?buildConfigurationList = ([A-F0-9]{24}) /\* Build configuration list for PBXNativeTarget "(.*?)" \*/;'
    for m in re.finditer(pat, text):
        target_uuid = m.group(1)
        target_name_comment = m.group(2)
        cfg_list_uuid = m.group(3)
        target_name = m.group(4)
        targets.append((target_uuid, target_name, cfg_list_uuid))
    return targets

def get_cfg_uuids(text: str, cfg_list_uuid: str, target_name: str):
    lm = re.search(rf'{cfg_list_uuid} /\* Build configuration list for PBXNativeTarget "{re.escape(target_name)}" \*/ = \{{[\s\S]*?buildConfigurations = \(([\s\S]*?)\);', text)
    if not lm:
        return []
    inside = lm.group(1)
    return re.findall(r'([A-F0-9]{24}) /\* .*? \*/,?', inside)

def patch_config(text: str, cfg_uuid: str, settings_to_set: dict, keys_to_clear: list):
    # A config's UUID appears TWICE in a real pbxproj: once as a bare reference
    # inside its XCConfigurationList's `buildConfigurations = (...)` array (just
    # a trailing comma after the comment), and once as the actual
    # `= { isa = XCBuildConfiguration; ... }` definition. The comment portions
    # (`/* ... */`) never span multiple lines, so restricting them to `[^\n]*?`
    # (instead of `.*?` under DOTALL) stops the regex from backtracking PAST a
    # reference occurrence, across unrelated object boundaries, into a
    # completely different config's definition — which is exactly what used to
    # happen the moment a second target existed (silently skipping one config,
    # or mangling one) and stayed invisible because nothing checked that the
    # substitution actually landed.
    pat = rf'{cfg_uuid} /\*[^\n]*?\*/ = \{{\s*isa = XCBuildConfiguration;\s*buildSettings = \{{([\s\S]*?)\n(\t*)\}};\s*name = [^\n]*?;\s*\}};'
    matches = list(re.finditer(pat, text))
    if len(matches) != 1:
        raise RuntimeError(
            f"esperaba exactamente una definicion de XCBuildConfiguration para {cfg_uuid}, encontre {len(matches)}"
        )
    m = matches[0]
    body = m.group(1)
    # remove any existing relevant keys
    for k in set(list(keys_to_clear) + list(settings_to_set.keys())):
        body = re.sub(rf'\s*{re.escape(k)}\s*=\s*[^;]*;', '', body)
    # inject desired settings. A blank value (e.g. clearing CODE_SIGN_IDENTITY)
    # must still be a quoted empty string in the plist — `KEY = ;` with nothing
    # between `=` and `;` is not valid OpenStep-plist syntax and is exactly the
    # kind of edit that leaves xcodebuild unable to parse the project at all.
    inject_lines = []
    for k, v in settings_to_set.items():
        val = v if v else '""'
        inject_lines.append(f'\n\t\t\t\t{k} = {val};')
    new_body = body.rstrip() + ''.join(inject_lines) + '\n\t\t\t'
    # Splice by the ORIGINAL group(1)'s span, not by searching for `body` as a
    # substring of the match: `body` has already been mutated above (keys
    # cleared out of it), so it is no longer literally present inside
    # `m.group(0)` — a `.replace(body, new_body)` here would silently find
    # nothing and return the text unchanged, which is exactly what happened
    # when this was first written this way.
    return text[:m.start(1)] + new_body + text[m.end(1):]

def main():
    if len(sys.argv) != 7:
        print("Usage: ios_bind_app_signing.py <project.pbxproj> <app-target> <team_id> <profile_uuid> <profile_specifier> <identity>", file=sys.stderr)
        sys.exit(2)
    pbxproj_path = Path(sys.argv[1])
    app_target = sys.argv[2]
    team_id = sys.argv[3]
    profile_uuid = sys.argv[4]
    profile_specifier = sys.argv[5]
    identity = sys.argv[6]

    text = pbxproj_path.read_text(encoding='utf-8')
    targets = find_native_targets(text)
    if not targets:
        print("No PBXNativeTarget entries found.", file=sys.stderr)
        sys.exit(1)

    app_cfgs = set()
    other_cfgs = set()
    for _, name, cfg_list in targets:
        cfgs = get_cfg_uuids(text, cfg_list, name)
        if name == app_target:
            app_cfgs.update(cfgs)
        else:
            other_cfgs.update(cfgs)

    if not app_cfgs:
        print(f"No configurations found for app target '{app_target}'.", file=sys.stderr)
        sys.exit(1)

    # App target manual signing
    clear_app = ["CODE_SIGN_STYLE","CODE_SIGN_IDENTITY","DEVELOPMENT_TEAM","PROVISIONING_PROFILE","PROVISIONING_PROFILE_SPECIFIER"]
    app_set = {
        "CODE_SIGN_STYLE": "Manual",
        "CODE_SIGN_IDENTITY": f'"{identity}"',
        "DEVELOPMENT_TEAM": team_id,
        "PROVISIONING_PROFILE": f'"{profile_uuid}"',
        "PROVISIONING_PROFILE_SPECIFIER": f'"{profile_specifier}"',
    }
    out = text
    try:
        for cfg in app_cfgs:
            out = patch_config(out, cfg, app_set, clear_app)
    except RuntimeError as e:
        print(f"ERROR patching app target '{app_target}': {e}", file=sys.stderr)
        sys.exit(1)

    # Other targets unsigned
    clear_other = ["CODE_SIGN_STYLE","CODE_SIGN_IDENTITY","DEVELOPMENT_TEAM","PROVISIONING_PROFILE","PROVISIONING_PROFILE_SPECIFIER","CODE_SIGNING_ALLOWED","CODE_SIGNING_REQUIRED"]
    other_set = {
        "CODE_SIGNING_ALLOWED": "NO",
        "CODE_SIGNING_REQUIRED": "NO",
        "CODE_SIGN_IDENTITY": "",
        "PROVISIONING_PROFILE": "",
        "PROVISIONING_PROFILE_SPECIFIER": "",
    }
    try:
        for cfg in other_cfgs:
            out = patch_config(out, cfg, other_set, clear_other)
    except RuntimeError as e:
        print(f"ERROR patching a non-app target: {e}", file=sys.stderr)
        sys.exit(1)

    pbxproj_path.write_text(out, encoding='utf-8')
    print(f"Patched {len(app_cfgs)} app configurations and {len(other_cfgs)} non-app configurations.")

if __name__ == '__main__':
    main()

