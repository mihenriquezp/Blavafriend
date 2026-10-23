import { ProfileForm } from '../components/ProfileForm'
import { Card } from '../components/ui'
import { api } from '../lib/api'
import { resetDemo } from '../lib/demoApi'
import { useStore } from '../lib/store'

export default function MyProfile() {
  const { me, user } = useStore()
  if (!me) return null
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-oxford-900">Your profile</h1>
        <p className="text-sm text-gray-500">
          This is what classmates see. Everything except your name is optional.
        </p>
      </div>
      <Card>
        <ProfileForm student={me} />
      </Card>
      <p className="text-center text-sm text-gray-500">
        Signed in as {user?.email} ·{' '}
        <button className="underline" onClick={() => api.signOut()}>
          Sign out
        </button>
        {api.mode === 'demo' && (
          <>
            {' · '}
            <button
              className="underline"
              onClick={() => {
                resetDemo()
                location.href = '/'
              }}
            >
              Reset demo data
            </button>
          </>
        )}
      </p>
    </div>
  )
}
