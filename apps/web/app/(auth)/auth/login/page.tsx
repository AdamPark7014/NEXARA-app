"use client"

import React, { useState } from 'react'
import styles from './login.module.css'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j?.message || 'Credenciales inválidas')
        setLoading(false)
        return
      }
      // redirect to console dashboard on success
      window.location.href = '/dashboard'
    } catch (err) {
      setError('Error de red, intente de nuevo')
      setLoading(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <aside className={styles.brand}>
          <div className={styles.logo}>Nexara</div>
          <h2 className={styles.tag}>Bienvenido de nuevo</h2>
          <p className={styles.lead}>Accede a tu panel para ver actividades, GPS y solicitudes.</p>
          <div className={styles.brandFooter}>¿No tienes cuenta? <Link href="/auth/register">Regístrate</Link></div>
        </aside>

        <section className={styles.formWrap}>
          <h3 className={styles.title}>Iniciar sesión</h3>
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.label}>
              Correo electrónico
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>

            <label className={styles.label}>
              Contraseña
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>

            <div className={styles.row}>
              <label className={styles.remember}>
                <input type="checkbox" /> Recuérdame
              </label>
              <Link href="/auth/forgot" className={styles.forgot}>¿Olvidaste tu contraseña?</Link>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button className={styles.submit} type="submit" disabled={loading}>
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>

          <div className={styles.or}>o continúa con</div>
          <div className={styles.socials}>
            <a className={styles.social} href="/api/auth/google">Google</a>
            <a className={styles.social} href="/api/auth/facebook">Facebook</a>
          </div>
        </section>
      </div>
    </main>
  )
}
