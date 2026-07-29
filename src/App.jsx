import { Routes, Route } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import ClientDetailPage from './pages/ClientDetailPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/client/:clientId" element={<ClientDetailPage />} />
    </Routes>
  )
}
