import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { useStore } from './lib/store'
import About from './pages/About'
import Admin from './pages/Admin'
import Claim from './pages/Claim'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import MyProfile from './pages/MyProfile'
import People from './pages/People'
import Person from './pages/Person'

function Gate() {
  const { user, authLoading, dataLoading, students, me, error, reload } = useStore()
  if (authLoading) return <Spinner />
  if (!user) return <Login />
  if (dataLoading && !students.length) return <Spinner label="Loading your cohort…" />
  if (error && !students.length)
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="mb-4 text-red-700">Couldn't load data: {error}</p>
        <button className="underline" onClick={reload}>
          Try again
        </button>
      </div>
    )
  if (!me) return <Claim />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="people" element={<People />} />
        <Route path="wishlist" element={<People wishlist />} />
        <Route path="people/:id" element={<Person />} />
        <Route path="me" element={<MyProfile />} />
        <Route path="admin" element={<Admin />} />
        <Route path="about" element={<About />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Gate />
    </BrowserRouter>
  )
}
