import { useState, type ReactNode } from 'react'
import { LEVELS } from '../lib/options'
import { btnPrimary, btnSecondary } from './ui'

// Shared explanations of what Blavafriend is, how it works and how data is
// protected. Shown before signing in and on a user's first visit.

const LEVEL_HINTS = [
  'You haven’t crossed paths yet',
  'You know their face and name',
  'You’ve had a first proper chat',
  'You really connected',
  'A real friendship 💙',
]

export function Purpose() {
  return (
    <div className="space-y-3 text-gray-700">
      <p>
        There are around <b>150 of us</b> in the MPP and only one year together. It’s easy to end up talking to the
        same 15 people.
      </p>
      <p>
        <b>Blavafriend</b> helps you get to know the whole cohort: see who everyone is, keep track of who you’ve met,
        and spot the people you still want to meet.
      </p>
    </div>
  )
}

export function HowItWorks() {
  return (
    <div className="space-y-4 text-gray-700">
      <ul className="space-y-3">
        <Step icon="👥" title="Browse the cohort">
          Everyone’s profile: role, college, countries, policy interests, hobbies and languages. Filter to find, say,
          everyone who plays tennis or works on AI.
        </Step>
        <Step icon="✨" title="Mark how well you know each person">
          Update it whenever you meet someone. Only you see it.
        </Step>
        <Step icon="★" title="Star who you want to meet">
          Build your own “want to meet” list and add private notes to remember conversations.
        </Step>
        <Step icon="📊" title="See your progress">
          How much of the cohort you’ve met, by continent, country, college, interests and languages, week by week.
        </Step>
      </ul>
      <div className="rounded-xl bg-oxford-50 p-3">
        <div className="mb-2 text-xs font-semibold text-oxford-700 uppercase">The five levels</div>
        <ul className="space-y-1 text-sm">
          {LEVELS.map((l) => (
            <li key={l.value} className="flex gap-2">
              <span className="w-5 text-center" aria-hidden>
                {l.emoji}
              </span>
              <span>
                <b className="text-oxford-900">{l.label}</b>
                <span className="text-gray-500"> · {LEVEL_HINTS[l.value]}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function Privacy() {
  return (
    <div className="space-y-3 text-gray-700">
      <div className="rounded-xl border border-green-200 bg-green-50 p-3">
        <div className="mb-1 font-semibold text-green-900">🔒 Private: only you can see it</div>
        <p className="text-sm">
          The levels you give people, your ★ list, your notes and your stats. Nobody else can see them in the app,
          including the admin, and nobody is ever told how you rated them.
        </p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="mb-1 font-semibold text-oxford-900">👀 Shared with the cohort</div>
        <p className="text-sm">
          Your profile, visible only to classmates signed in with an Oxford email. Everything except your name is
          optional, and you can edit or remove it at any time.
        </p>
      </div>
      <p className="text-xs text-gray-500">
        Some profiles were pre-filled from the cohort’s informal register and the public BSG directory so people are
        easy to find. Ask the admin to change or delete your data at any time. A student project, not an official
        University of Oxford app.
      </p>
    </div>
  )
}

function Step({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-oxford-50 text-lg" aria-hidden>
        {icon}
      </span>
      <div>
        <div className="font-semibold text-oxford-900">{title}</div>
        <div className="text-sm">{children}</div>
      </div>
    </li>
  )
}

export const INTRO_SEEN_KEY = 'blavafriend-intro-seen'

const SLIDES = [
  { title: 'Welcome to Blavafriend 👋', body: <Purpose /> },
  { title: 'How it works', body: <HowItWorks /> },
  { title: 'Your data', body: <Privacy /> },
]

const seenKey = (userId: string) => `blavafriend-onboarded-${userId}`

export function hasSeenOnboarding(userId: string) {
  try {
    return localStorage.getItem(seenKey(userId)) === '1'
  } catch {
    return false
  }
}

/** Three short slides shown the first time someone signs in. */
export function Onboarding({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [i, setI] = useState(0)
  const last = i === SLIDES.length - 1
  const finish = () => {
    try {
      localStorage.setItem(seenKey(userId), '1')
    } catch {
      /* private mode: show again next time */
    }
    onDone()
  }
  return (
    <div className="grid min-h-dvh place-items-center bg-oxford-900 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex justify-center gap-1.5" aria-label={`Step ${i + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, j) => (
            <span key={j} className={`h-1.5 rounded-full transition-all ${j === i ? 'w-6 bg-oxford-900' : 'w-1.5 bg-oxford-200'}`} />
          ))}
        </div>
        <h1 className="mb-4 font-display text-2xl font-bold text-oxford-900">{SLIDES[i].title}</h1>
        {SLIDES[i].body}
        <div className="mt-6 flex gap-2">
          {i > 0 && (
            <button className={btnSecondary} onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          <button className={`${btnPrimary} flex-1`} onClick={() => (last ? finish() : setI(i + 1))}>
            {last ? 'Got it, let’s go' : 'Next'}
          </button>
        </div>
        {!last && (
          <button className="mt-3 w-full text-sm text-gray-400 underline" onClick={finish}>
            Skip
          </button>
        )}
      </div>
    </div>
  )
}
