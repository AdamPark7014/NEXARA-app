"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../../../../components/UserContext";

export default function ConsoleDashboardLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { setUser } = useUser();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login fallido");
      setUser(data.user);
      router.push("/console/dashboard");
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError('Error desconocido');
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "60px auto", padding: 32, background: "#222", borderRadius: 12 }}>
      <h2 style={{ color: "var(--primary)", marginBottom: 24 }}>Iniciar sesión</h2>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ width: "100%", marginBottom: 16, padding: 8 }}
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{ width: "100%", marginBottom: 16, padding: 8 }}
        />
        <button type="submit" style={{ width: "100%", padding: 10, background: "var(--primary)", color: "#fff", border: "none", borderRadius: 6 }}>
          Entrar
        </button>
        {error && <div style={{ color: "var(--danger)", marginTop: 16 }}>{error}</div>}
      </form>
    </div>
  );
}
