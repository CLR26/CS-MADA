import { useState } from 'react'
import { supabase } from '../supabaseClient'
import Input from './ui/Input'
import Button from './ui/Button'
import { IconInbox, IconShieldCheck } from '../lib/icons'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError("Email ou mot de passe incorrect. Veuillez vérifier vos identifiants.")
  }

  return (
    <div className="login-shell">
      <div className="login-card animate-slide-up">
        <div className="login-card__logo-area">
          <div className="topbar__logo">
            <IconInbox size={22} />
          </div>
          <div>
            <h1 className="login-card__title">Suivi des demandes</h1>
            <p className="login-card__subtitle">Espace d'équipe CLR26 · CS-MADA</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Input
            id="login-email"
            label="Adresse email professionnelle"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="agent@suivi.com"
            required
            autoFocus
          />

          <Input
            id="login-password"
            label="Mot de passe"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          {error && <div className="ui-field__msg ui-field__msg--error" style={{ marginBottom: 16 }}>{error}</div>}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            full
            icon={IconShieldCheck}
            disabled={loading}
          >
            {loading ? 'Connexion en cours…' : 'Accéder à l’espace'}
          </Button>
        </form>
      </div>
    </div>
  )
}
