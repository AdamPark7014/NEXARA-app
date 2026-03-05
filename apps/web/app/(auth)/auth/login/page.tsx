"use client"

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './login.module.css'
import Link from 'next/link'
import { useUser } from '../../../../components/UserContext'
import { getDeviceIdentityHeaders } from '@/lib/device-identity'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { setUser } = useUser()

  const buildApiUrl = (path: string) => {
    const envBase = process.env.NEXT_PUBLIC_API_URL?.trim()
    const fallback = typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3001/api'
    const base = (envBase && envBase.length > 0 ? envBase : fallback).replace(/\/+$/, '')
    return `${base}/${path.replace(/^\/+/, '')}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const deviceHeaders = await getDeviceIdentityHeaders()
      const res = await fetch(buildApiUrl('auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...deviceHeaders },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.message || data?.error || 'Credenciales inválidas')
        setLoading(false)
        return
      }

      if (typeof window !== 'undefined' && data.loginGreeting) {
        window.sessionStorage.setItem('nexara_login_greeting', data.loginGreeting)
      }

      setUser({
        ...data.user,
        token: data.access_token,
        loginDevice: data.loginDevice || data.user?.loginDevice,
      })
      router.push('/dashboard')
    } catch (err) {
      setError('Error de red, intente de nuevo')
    }
    setLoading(false)
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
