import { useEffect, useState } from 'react'

// Android/Chrome offers a one-tap install prompt; keep it for our button.
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
let deferredPrompt: InstallPromptEvent | null = null
const promptListeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as InstallPromptEvent
    promptListeners.forEach((l) => l())
  })
}

/** True when the app was opened from the home screen (already installed). */
export function isInstalled() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

type Platform = 'ios' | 'android'
function detectPlatform(): Platform | null {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return null
}

const STEPS: Record<Platform, { steps: string[]; note: string }> = {
  ios: {
    steps: [
      'Open blavafriend.vercel.app in Safari.',
      'Tap the Share button (the square with an arrow ↑) at the bottom of the screen.',
      'Scroll down and tap “Add to Home Screen”.',
      'Tap “Add”. The Blavafriend icon appears on your home screen.',
    ],
    note: 'The first time you open it from the icon, sign in once more with your Oxford email (iPhone keeps home-screen apps separate from Safari).',
  },
  android: {
    steps: [
      'Open blavafriend.vercel.app in Chrome.',
      'Tap the ⋮ menu in the top-right corner.',
      'Tap “Add to Home screen” or “Install app”.',
      'Tap “Install”. The Blavafriend icon appears on your home screen.',
    ],
    note: 'You stay signed in.',
  },
}

/** Step-by-step instructions to add the app to your phone's home screen. */
export function InstallGuide() {
  const detected = detectPlatform()
  const [tab, setTab] = useState<Platform>(detected ?? 'ios')
  const [canPrompt, setCanPrompt] = useState(!!deferredPrompt)

  useEffect(() => {
    const l = () => setCanPrompt(!!deferredPrompt)
    promptListeners.add(l)
    return () => {
      promptListeners.delete(l)
    }
  }, [])

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    deferredPrompt = null
    setCanPrompt(false)
  }

  return (
    <div>
      {!detected && (
        <p className="mb-3 text-sm text-gray-600">Open blavafriend.vercel.app on your phone and follow these steps.</p>
      )}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1" role="tablist">
        {(['ios', 'android'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={tab === p}
            onClick={() => setTab(p)}
            className={`rounded-full py-1.5 text-sm font-semibold ${
              tab === p ? 'bg-white text-oxford-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {p === 'ios' ? '📱 iPhone' : '🤖 Android'}
          </button>
        ))}
      </div>
      {tab === 'android' && canPrompt ? (
        <button
          type="button"
          onClick={install}
          className="w-full rounded-xl bg-oxford-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-oxford-700"
        >
          📲 Install Blavafriend
        </button>
      ) : (
        <ol className="space-y-2">
          {STEPS[tab].steps.map((s, i) => (
            <li key={s} className="flex gap-3 text-sm text-gray-700">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-oxford-50 text-xs font-bold text-oxford-900">
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-gray-500">{STEPS[tab].note}</p>
    </div>
  )
}
