import { buildApiUrl } from "@/lib/api-base";
export async function createUser(formData: FormData, token?: string) {
  const res = await fetch(buildApiUrl("users"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  if (!res.ok) {
    throw new Error("Error al crear usuario");
  }
  return res.json();
}
