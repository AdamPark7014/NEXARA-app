import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { getUploadSubdir } from './upload-paths';

/**
 * Saves a base64-encoded image to disk and returns the relative URL path
 */
export function saveBase64Photo(
  base64Data: string,
  dirname: string,
  subdir: string,
  filename?: string,
): string {
  if (!base64Data || typeof base64Data !== 'string') {
    throw new BadRequestException('La foto no es válida');
  }

  // Extract the base64 string (remove data:image/...;base64, prefix if present)
  let base64String = base64Data;
  let mimeType = 'image/jpeg';

  if (base64Data.includes(';base64,')) {
    const parts = base64Data.split(';base64,');
    mimeType = parts[0].replace('data:', '') || 'image/jpeg';
    base64String = parts[1];
  }

  // Convert base64 to buffer
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64String, 'base64');
  } catch (error) {
    throw new BadRequestException('La imagen no se pudo leer. Vuelve a elegirla.');
  }

  // Check file size (e.g., max 5MB for photos)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (buffer.length > maxSize) {
    throw new BadRequestException(`La imagen pesa ${(buffer.length / 1024 / 1024).toFixed(2)} MB y el máximo es 5 MB`);
  }

  // Ensure upload directory exists
  const uploadDir = getUploadSubdir(dirname, subdir);

  // Generate filename if not provided
  const finalFilename =
    filename || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}.jpg`;
  const filePath = path.join(uploadDir, finalFilename);

  // Write file to disk
  try {
    fs.writeFileSync(filePath, buffer);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new BadRequestException(`No se pudo guardar la foto: ${errorMsg}`);
  }

  // Return relative URL path (without uploads/ prefix for consistency with existing paths)
  return `/${subdir}/${finalFilename}`;
}

/**
 * Saves a base64-encoded PDF (or any file) to disk and returns the relative URL path.
 * Accepts both data URI format (data:application/pdf;base64,...) and raw base64 strings.
 */
export function saveBase64Pdf(
  base64Data: string,
  dirname: string,
  subdir: string,
  filename?: string,
): string {
  if (!base64Data || typeof base64Data !== 'string') {
    throw new BadRequestException('El PDF no es válido');
  }

  let base64String = base64Data;
  let extension = 'pdf';

  if (base64Data.includes(';base64,')) {
    const parts = base64Data.split(';base64,');
    base64String = parts[1];
    // Detect extension from mime type
    const mimeType = parts[0].replace('data:', '');
    if (mimeType.includes('pdf')) extension = 'pdf';
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64String, 'base64');
  } catch (error) {
    throw new BadRequestException('El PDF no se pudo leer. Vuelve a elegirlo.');
  }

  // Max 20MB for PDFs
  const maxSize = 20 * 1024 * 1024;
  if (buffer.length > maxSize) {
    throw new BadRequestException(`El PDF pesa ${(buffer.length / 1024 / 1024).toFixed(2)} MB y el máximo es 20 MB`);
  }

  const uploadDir = getUploadSubdir(dirname, subdir);

  const finalFilename =
    filename || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}.${extension}`;
  const filePath = path.join(uploadDir, finalFilename);

  try {
    fs.writeFileSync(filePath, buffer);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new BadRequestException(`No se pudo guardar el PDF: ${errorMsg}`);
  }

  return `/${subdir}/${finalFilename}`;
}

/**
 * Deletes a photo file from disk
 */
export function deletePhotoFile(photoUrl: string, dirname: string): void {
  if (!photoUrl) return;

  // Extract filename from URL (handle both /subdir/filename and full paths)
  const match = photoUrl.match(/\/([^\/]+\/[^\/]+)$/);
  if (!match) return;

  const relativePath = match[1];
  const uploadDir = getUploadSubdir(dirname, relativePath.split('/')[0]);
  const filePath = path.join(uploadDir, relativePath.split('/')[1]);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    // Silently fail - don't break the operation if deletion fails
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Could not delete photo file ${filePath}:`, errorMsg);
  }
}
