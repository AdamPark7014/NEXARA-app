export async function createUser(formData: FormData, token?: string) {
  let API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  API_URL = API_URL.replace(/[\/.]+$/, '');
  function buildApiUrl(path: string) {
    path = path.replace(/^\/+/, '');
    return `${API_URL}/${path}`;
  }
  const res = await fetch(buildApiUrl('users'), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  if (!res.ok) {
    let message = "Error al crear usuario";
    try {
      const data = await res.json();
      if (typeof data?.message === "string" && data.message.trim()) {
        message = data.message;
      }
    } catch {
      // Keep fallback message when response is not JSON.
    }
    throw new Error(message);
  }
  return res.json();
}
