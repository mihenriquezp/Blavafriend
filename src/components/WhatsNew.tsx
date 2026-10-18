import type { ReactNode } from 'react'

// One-off "how it works" for the mentor picker and the newsletter checklist,
// shown once per device to everyone who opens the app before it ends.
export const WHATS_NEW_KEY = 'blavafriend-whatsnew-mentors-newsletter'
export const WHATS_NEW_UNTIL = '2026-10-31'
// A second round: a reminder of how the coffee roulette works, plus how to add
// the app to your phone (that screen only if it isn't installed yet).
export const COFFEE_TOUR_KEY = 'blavafriend-whatsnew-coffee-install'
export const COFFEE_TOUR_UNTIL = '2026-11-08'

function Steps({ items }: { items: [string, ReactNode][] }) {
  return (
    <ol className="mt-4 space-y-2.5">
      {items.map(([icon, text], i) => (
        <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-oxford-50 text-sm" aria-hidden>
            {icon}
          </span>
          <span className="pt-1">{text}</span>
        </li>
      ))}
    </ol>
  )
}

const Star = ({ on }: { on?: boolean }) => (
  <svg viewBox="0 0 24 24" className={`h-5 w-5 ${on ? 'fill-gold text-gold' : 'fill-none text-gray-300'}`} aria-hidden>
    <path
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"
    />
  </svg>
)

/** A tiny mock of two mentor cards: one starred, one being hidden. */
function MentorMock() {
  const card = (name: string, role: string, starred: boolean, hiding: boolean) => (
    <div
      className={`flex items-center gap-2.5 rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-gray-200 ${hiding ? 'opacity-45' : ''}`}
    >
      <span className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-oxford-100 to-oxford-300" />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[13px] font-bold text-oxford-900 ${hiding ? 'line-through' : ''}`}>{name}</div>
        <div className="truncate text-[11px] text-gray-500">{role}</div>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <Star on={starred} />
        <span className={`text-sm leading-none ${hiding ? 'font-bold text-red-500' : 'text-gray-300'}`}>✕</span>
      </div>
    </div>
  )
  return (
    <div className="space-y-2 rounded-2xl bg-gradient-to-br from-oxford-50 to-amber-50 p-3" aria-hidden>
      <div className="flex gap-1.5 text-[11px] font-semibold">
        <span className="rounded-full bg-oxford-900 px-2.5 py-1 text-white">All</span>
        <span className="rounded-full bg-white px-2.5 py-1 text-oxford-900">★ Saved</span>
        <span className="rounded-full bg-white px-2.5 py-1 text-oxford-900">Hidden</span>
        <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-oxford-900">⚙ Filters</span>
      </div>
      {card('A mentor you like', 'Tech policy · ~15 yrs', true, false)}
      {card('Not for you', 'Hidden with ✕', false, true)}
    </div>
  )
}

/** A tiny mock of the weekly checklist. */
function ChecklistMock() {
  const row = (text: string, done: boolean, due?: string) => (
    <div className="flex items-center gap-2.5 rounded-xl bg-white px-2.5 py-2 shadow-sm ring-1 ring-gray-200">
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-bold ${done ? 'bg-oxford-900 text-white' : 'ring-2 ring-gray-300'}`}
      >
        {done && '✓'}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-[13px] ${done ? 'text-gray-400 line-through' : 'text-oxford-900'}`}
      >
        {text}
      </span>
      {due && (
        <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
          {due}
        </span>
      )}
    </div>
  )
  return (
    <div className="space-y-2 rounded-2xl bg-gradient-to-br from-oxford-50 to-amber-50 p-3" aria-hidden>
      <div className="flex items-center justify-between text-[11px] font-semibold text-oxford-900">
        <span>📰 Week of 12 Oct</span>
        <span>1 of 3 done</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white">
        <div className="h-full w-1/3 rounded-full bg-gold" />
      </div>
      {row('Register for the careers fair', true)}
      {row('Submit your module choices', false, 'Due Fri')}
      {row('Book your college photo', false)}
    </div>
  )
}

export function MentorsHowTo() {
  return (
    <div>
      <div className="mb-4 text-center">
        <div className="text-5xl" aria-hidden>
          🧭
        </div>
        <h2 id="bday-title" className="mt-2 font-display text-2xl font-bold text-oxford-900">
          Picking your mentor
        </h2>
        <p className="mt-1 text-sm text-gray-500">In Useful tools on the home page. Shortlist in a few rounds:</p>
      </div>
      <MentorMock />
      <Steps
        items={[
          [
            '⭐',
            <>
              Tap the <b>star</b> on the mentors you like.
            </>,
          ],
          [
            '✕',
            <>
              Tap the <b>X</b> to hide the ones that aren’t for you.
            </>,
          ],
          [
            '⚙',
            <>
              Use <b>Filters</b> to narrow by region, topic or years of experience.
            </>,
          ],
          [
            '🔁',
            <>
              Go round again until only a few are left, then check <b>★ Saved</b>.
            </>,
          ],
          [
            '💾',
            <>
              Your stars and hidden mentors are <b>saved</b> on this device. Come back any time and carry on.
            </>,
          ],
        ]}
      />
    </div>
  )
}

/** A tiny mock of the coffee roulette: you, a match, the Sunday draw. */
function CoffeeMock() {
  const face = (bg: string) => <span className={`h-10 w-10 rounded-full ring-2 ring-white ${bg}`} />
  return (
    <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-oxford-50 p-3" aria-hidden>
      <div className="flex items-center justify-center gap-2">
        {face('bg-gradient-to-br from-oxford-100 to-oxford-300')}
        <span className="text-xl">☕</span>
        {face('bg-gradient-to-br from-amber-100 to-amber-300')}
      </div>
      <div className="mt-2 rounded-xl bg-white px-3 py-2 text-center shadow-sm ring-1 ring-gray-200">
        <div className="text-[13px] font-bold text-oxford-900">Your coffee this week</div>
        <div className="text-[11px] text-gray-500">Draw every Sunday at 20:00 · sign-ups open Monday</div>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-gray-200">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-oxford-900 text-[11px] font-bold text-white">
          ✓
        </span>
        <span className="text-[13px] text-oxford-900">Sign me up every week</span>
      </div>
    </div>
  )
}

export function CoffeeHowTo() {
  return (
    <div>
      <div className="mb-4 text-center">
        <div className="text-5xl" aria-hidden>
          ☕
        </div>
        <h2 id="bday-title" className="mt-2 font-display text-2xl font-bold text-oxford-900">
          Coffee roulette
        </h2>
        <p className="mt-1 text-sm text-gray-500">A coffee a week with someone from the cohort. In the Coffee + tab:</p>
      </div>
      <CoffeeMock />
      <Steps
        items={[
          [
            '☕',
            <>
              Tap <b>Join this week’s coffee</b>. Sign-ups open every Monday.
            </>,
          ],
          [
            '🎲',
            <>
              The draw is <b>Sunday at 20:00</b>. It pairs you first with people you haven’t met yet.
            </>,
          ],
          [
            '👋',
            <>
              On Sunday night a <b>pop-up</b> shows your match. Send them a message and find a time.
            </>,
          ],
          [
            '🔁',
            <>
              Tick <b>Sign me up every week</b> so you don’t have to remember. You can skip any week.
            </>,
          ],
          ['🔒', <>Only you see your match. Everyone who signs up gets one.</>],
        ]}
      />
    </div>
  )
}

export function NewsletterHowTo() {
  return (
    <div>
      <div className="mb-4 text-center">
        <div className="text-5xl" aria-hidden>
          📰
        </div>
        <h2 id="bday-title" className="mt-2 font-display text-2xl font-bold text-oxford-900">
          The newsletter as a checklist
        </h2>
        <p className="mt-1 text-sm text-gray-500">The weekly email, without the endless scrolling:</p>
      </div>
      <ChecklistMock />
      <Steps
        items={[
          [
            '📋',
            <>
              Each week’s email becomes a <b>short list</b> on the home page.
            </>,
          ],
          [
            '👆',
            <>
              Tap an item to read the <b>details</b>, links and deadline.
            </>,
          ],
          [
            '✓',
            <>
              Tick what you’ve done. The <b>bar fills up</b> as you go.
            </>,
          ],
          [
            '🔒',
            <>
              Your ticks are <b>private</b> and saved to your account.
            </>,
          ],
        ]}
      />
    </div>
  )
}
