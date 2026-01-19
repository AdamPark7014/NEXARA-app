export async function createUser(formData: FormData) {
  const res = await fetch("/api/users", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error("Error al crear usuario");
  }
  return res.json();
}
