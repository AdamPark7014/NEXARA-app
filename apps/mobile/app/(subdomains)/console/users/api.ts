import { buildApiUrl } from '@/lib/api-base';

export async function createUser(formData: FormData, token?: string) {
  const res = await fetch(buildApiUrl('users'), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  if (!res.ok) {
    let message = "Error al crear usuario";
    try {
      const data = await res.json();
      if (Array.isArray(data?.message) && data.message.length) {
        message = String(data.message[0]);
      } else if (typeof data?.message === "string" && data.message.trim()) {
        message = data.message;
      }
    } catch {
      // Keep fallback message when response is not JSON.
    }
    throw new Error(message);
  }
  return res.json();
}
