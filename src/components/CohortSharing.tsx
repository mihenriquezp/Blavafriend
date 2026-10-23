import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { COHORT_CONSENT_VERSION } from '../lib/cohortConsent'
import type { CohortConsent } from '../lib/types'
import { Card } from './ui'

export function CohortSharingNotice() {
  return (
    <div className="space-y-2 text-sm text-gray-700">
      <p>Blavafriend’s familiarity levels help us get to know each other. You can choose to include yours in the shared Cohort view.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your current levels and earlier level changes can contribute to connection counts, weekly progress, an unnamed network and continent summaries visible to signed-in members.</li>
        <li>Only connections between two people who both opt in are counted. Your notes and ★ marks are not included.</li>
        <li>These views do not name who marked whom, but comparing totals over time or after changing your own levels can sometimes reveal how someone marked you. They do not guarantee anonymity.</li>
        <li>Joining is optional. You can keep using your own levels, notes and Stats without sharing. Uncheck the option at any time to exclude your connections and history from future calculations; totals people already saw cannot be taken back.</li>
      </ul>
    </div>
  )
}

export function CohortSharing({ onChange }: { onChange: () => void }) {
  const [choice, setChoice] = useState<CohortConsent | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    let active = true
    api.getCohortConsent().then(
      (value) => { if (active) setChoice(value) },
      (e) => { if (active) setError(e instanceof Error ? e.message : String(e)) },
    )
    return () => { active = false }
  }, [])

  const change = async (enabled: boolean) => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      setChoice(await api.setCohortConsent(enabled))
      setSaved(true)
      onChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-oxford-900">Choose whether to share your connections</h2>
      <CohortSharingNotice />
      <label className="mt-4 flex items-start gap-3 text-sm font-medium text-oxford-900">
        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={choice?.enabled ?? false}
          disabled={!choice || busy || choice.version !== COHORT_CONSENT_VERSION}
          onChange={(event) => change(event.target.checked)} />
        I understand this explanation and choose to include my familiarity levels in shared Cohort statistics.
      </label>
      <p className="mt-2 text-sm text-gray-600" role="status">
        {busy ? 'Saving your choice…' : !choice ? 'Loading your choice…' :
          `${saved ? 'Choice saved. ' : ''}${choice.enabled ? 'Your connections are included when the other person also participates.' : 'Your connections are not included in shared Cohort statistics.'}`}
      </p>
      {choice && choice.version !== COHORT_CONSENT_VERSION && <p className="mt-2 text-sm text-amber-800">The sharing notice has changed. Refresh the app to review it.</p>}
      {error && <p className="mt-2 text-sm text-red-700" role="alert">Couldn’t save or load your choice: {error}</p>}
    </Card>
  )
}
