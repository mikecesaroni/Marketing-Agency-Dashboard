import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <button
            onClick={logout}
            className="px-4 py-2 bg-slate-200 text-slate-900 rounded-lg font-medium hover:bg-slate-300 transition"
          >
            Log out
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <p className="text-slate-600 mb-4">
            Logged in as: <span className="font-semibold">{user?.email}</span>
          </p>
          <p className="text-slate-500">
            Dashboard overview coming next. Check back soon.
          </p>
        </div>
      </div>
    </div>
  )
}
