import { Link } from 'react-router-dom'
import { HowItWorks } from '../components/Intro'
import { Card, btnSecondary } from '../components/ui'
import { LEVELS } from '../lib/options'

export default function About() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-oxford-900">About & privacy</h1>
      <Card>
        <h2 className="mb-3 font-semibold text-oxford-900">How it works</h2>
        <HowItWorks />
        <Link to="/welcome" className={`${btnSecondary} mt-4 w-full`}>
          ▶ Replay the welcome tour
        </Link>
      </Card>
      <Card className="space-y-3 text-sm leading-relaxed text-gray-700">
        <p>
          <b>Blavafriend</b> is a small side project made by MPP students, for MPP students, to help us get to know
          the whole cohort. It is not an official University of Oxford or Blavatnik School service.
        </p>
        <h2 className="pt-2 font-semibold text-oxford-900">What's private</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Your <b>levels</b> ({LEVELS.map((l) => l.short).join(', ')}), your <b>★ want-to-meet</b> marks, your{' '}
            <b>notes</b> and your <b>stats</b> are visible only to you. No one else can see them in the app, including the
            admin: the database only lets the account that created a row read it. (Like any web app, whoever runs the
            hosting account could technically open the raw database; the admin commits never to do that.)
          </li>
          <li>Nobody is ever told how you rated them.</li>
        </ul>
        <h2 className="pt-2 font-semibold text-oxford-900">Counted anonymously in “Cohort”</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Everyone’s levels are combined into anonymous totals for the Cohort tab: the Connection Index, weekly
            progress, an unnamed network of dots and how much continents mix.
          </li>
          <li>
            It never shows names, who rated whom or anyone’s individual levels. Dots are reshuffled on every visit, your
            own dot only shows the ties you marked, and groups smaller than 5 people are hidden.
          </li>
        </ul>
        <h2 className="pt-2 font-semibold text-oxford-900">Coffee roulette</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            If you sign up, the weekly draw uses your levels and your match’s levels for each other to put together people
            who haven’t met yet. This happens inside the database: nobody, including the admin, sees why two people were
            matched.
          </li>
          <li>Only you and your match see that you were matched. The admin only sees totals (e.g. “40 people, 20 groups”).</li>
        </ul>
        <h2 className="pt-2 font-semibold text-oxford-900">What's shared with the cohort</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Your profile (name, photo, role, college, countries, birthday (day and month only; the year is never shown), interests, languages, intro and any social links you add)
            is visible to classmates who sign in with their Oxford account.
          </li>
          <li>Everything except your name is optional, and you can edit or remove it at any time from your profile.</li>
          <li>
            In Coffee +, the events, songs and notices you post, and the events you say you’re going to, are visible to
            classmates with your name. You can delete your posts at any time.
          </li>
          <li>Profile photos are stored at an unguessable link that isn't listed anywhere public.</li>
          <li>
            To count how many people use the app, it records on which days and at what hour your account opened it, nothing about what you did.
            In the app, the admin only sees totals (e.g. “26 active this week”), never who was active.
          </li>
        </ul>
        <h2 className="pt-2 font-semibold text-oxford-900">Your data</h2>
        <p>
          Profiles were pre-filled from the public BSG directory (names) and the cohort's informal register so people are easy to find. If you'd like
          anything changed or your profile removed entirely (including all your private data), ask the admin and it will be
          deleted. Data is hosted on Supabase (EU region).
        </p>
      </Card>
    </div>
  )
}
