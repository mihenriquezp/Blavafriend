import { Card } from '../components/ui'
import { WhoWeAre } from '../components/WhoWeAre'
import { useStore } from '../lib/store'

export default function Cohort() {
  const { students } = useStore()
  const cohortStudents = students.filter((student) => student.role !== 'faculty')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-oxford-900">Our cohort 🌐</h1>
        <p className="text-sm text-gray-500">Who we are, based on the profiles we share.</p>
      </div>
      <WhoWeAre students={cohortStudents} />
      <Card>
        <h2 className="font-semibold text-oxford-900">Your connections stay private</h2>
        <p className="mt-2 text-sm text-gray-600">
          Shared connection counts, networks and progress charts are no longer available.
          Changes in those statistics could reveal someone’s private ratings.
          You can still see your own progress in Stats.
        </p>
      </Card>
    </div>
  )
}
