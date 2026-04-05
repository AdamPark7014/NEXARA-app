import { getApiAssetOrigin } from '@/lib/api-base';

export const resolveUserAvatarUrl = (url?: string | null) => {
  if (!url) return '';

  const value = String(url).trim().replace(/\\/g, '/');
  if (!value) return '';

  if (/^(data:|blob:|\/\/)/i.test(value)) return value;

  const apiAssetOrigin = getApiAssetOrigin();

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const normalizedPath = parsed.pathname.replace(/^\/api(?=\/uploads\/)/i, '');
      if (normalizedPath.startsWith('/uploads/')) {
        return `${apiAssetOrigin}${normalizedPath}${parsed.search}`;
      }
      return value;
    } catch {
      return value;
    }
  }

  const normalizedPath = (value.startsWith('/') ? value : `/${value}`).replace(/^\/api(?=\/uploads\/)/i, '');
  return `${apiAssetOrigin}${normalizedPath}`;
};

export const appendAvatarToFormData = (
  formData: FormData,
  avatarFile: File | null,
  avatarRemoved: boolean,
) => {
  if (avatarFile) {
    formData.append('avatar', avatarFile, avatarFile.name || 'avatar.jpg');
    return;
  }

  if (avatarRemoved) {
    formData.append('avatarUrl', '');
  }
};
