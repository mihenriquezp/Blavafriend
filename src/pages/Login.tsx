import { useState } from 'react'
import { btnPrimary, inputCls } from '../components/ui'
import { api } from '../lib/api'

export default function Login() {
  const [email, setEmail] = useState(api.mode === 'demo' ? 'demo.student@college.ox.ac.uk' : '')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const validEmail = /@([a-z0-9-]+\.)*ox\.ac\.uk$/i.test(email.trim())

  return (
    <div className="grid min-h-dvh place-items-center bg-oxford-900 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center text-white">
          <img src="/icon.svg" alt="" className="mx-auto mb-4 h-16 w-16 rounded-2xl" />
          <h1 className="font-display text-4xl font-bold">Blavafriend</h1>
          <p className="mt-2 text-white/75">
            Keep track of the MPP classmates you've met, and the ones you still want to meet.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-xl">
          {step === 'email' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                run(async () => {
                  await api.sendCode(email.trim().toLowerCase())
                  setStep('code')
                })
              }}
            >
              <label className="mb-1 block text-sm font-semibold text-oxford-900" htmlFor="email">
                Your Oxford email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="firstname.lastname@college.ox.ac.uk"
                className={inputCls}
              />
              {email && !validEmail && (
                <p className="mt-1 text-xs text-amber-700">Only @ox.ac.uk addresses can sign in.</p>
              )}
              <button className={`${btnPrimary} mt-4 w-full`} disabled={busy || !validEmail}>
                {busy ? 'Sending…' : 'Email me a sign-in code'}
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                run(() => api.verifyCode(email.trim().toLowerCase(), code.trim()))
              }}
            >
              <p className="mb-3 text-sm text-gray-600">
                {api.mode === 'demo' ? (
                  <>Demo mode: type any 6 digits.</>
                ) : (
                  <>
                    We sent a code to <b>{email}</b>. It may take a minute; check your junk folder too.
                  </>
                )}
              </p>
              <label className="mb-1 block text-sm font-semibold text-oxford-900" htmlFor="code">
                Sign-in code
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="123456"
                className={`${inputCls} text-center text-2xl tracking-[0.4em]`}
              />
              <button className={`${btnPrimary} mt-4 w-full`} disabled={busy || code.length < 6}>
                {busy ? 'Checking…' : 'Sign in'}
              </button>
              <button
                type="button"
                className="mt-3 w-full text-sm text-gray-500 underline"
                onClick={() => {
                  setStep('email')
                  setCode('')
                }}
              >
                Use a different email
              </button>
            </form>
          )}
          {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        </div>

        <p className="mt-6 text-center text-xs text-white/60">
          Made by MPP students, for MPP students. Not an official University of Oxford app.
        </p>
      </div>
    </div>
  )
}
