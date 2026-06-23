import * as fs from 'fs';
import * as path from 'path';

/**
 * Calcula la ruta raíz del proyecto basándose en __dirname
 * Funciona tanto en desarrollo como en producción
 */
export function resolveProjectRoot(dirname: string): string {
  const segments = dirname.split(path.sep);
  const appsIndex = segments.lastIndexOf('apps');
  if (appsIndex > 0) {
    const root = segments.slice(0, appsIndex).join(path.sep) || path.sep;
    return root;
  }
  return path.resolve(dirname, '../../..');
}

/**
 * Calcula la ruta dinámica para guardar avatares de usuarios
 */
export function getUsersUploadDir(dirname: string): string {
  const projectRoot = resolveProjectRoot(dirname);
  return path.join(projectRoot, 'uploads', 'users');
}

/**
 * Calcula la ruta dinámica para guardar documentos de usuarios
 */
export function getUserDocsUploadDir(dirname: string): string {
  const projectRoot = resolveProjectRoot(dirname);
  return path.join(projectRoot, 'uploads', 'user-docs');
}

/**
 * Calcula la ruta dinámica para guardar documentos de clientes
 */
export function getClientDocsUploadDir(dirname: string): string {
  const projectRoot = resolveProjectRoot(dirname);
  return path.join(projectRoot, 'uploads', 'clients');
}

export function getCvsUploadDir(dirname: string): string {
  const projectRoot = resolveProjectRoot(dirname);
  return path.join(projectRoot, 'uploads', 'cvs');
}

export function getUploadSubdir(dirname: string, subdir: string): string {
  const projectRoot = resolveProjectRoot(dirname);
  const dir = path.join(projectRoot, 'uploads', subdir);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dir;
}
