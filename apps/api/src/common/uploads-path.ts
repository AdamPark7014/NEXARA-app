import * as fs from 'fs';
import * as path from 'path';

/**
 * Persistent uploads root.
 *
 * In Docker the API process cwd is `/app/apps/api` (see Dockerfile.api CMD),
 * while the compose volume mounts host `uploads/` at `/app/uploads`.
 * Resolving `./uploads` from cwd therefore writes into the ephemeral
 * container layer and files vanish on every redeploy.
 */
export function resolveUploadsRoot(): string {
  const fromEnv = (process.env['UPLOADS_ROOT'] || process.env['UPLOAD_ROOT'] || '').trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }

  const cwd = process.cwd();
  const candidates = [
    path.resolve('/app/uploads'),
    path.resolve(cwd, '..', '..', 'uploads'),
    path.resolve(cwd, '..', 'uploads'),
    path.resolve(cwd, 'uploads'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore unreadable candidates
    }
  }

  return path.resolve(cwd, '..', '..', 'uploads');
}

export function resolveUploadsDir(...parts: string[]): string {
  return path.join(resolveUploadsRoot(), ...parts);
}

/** Legacy path used by older code that wrote under apps/api/uploads. */
export function resolveLegacyUploadsDir(...parts: string[]): string {
  return path.join(process.cwd(), 'uploads', ...parts);
}
