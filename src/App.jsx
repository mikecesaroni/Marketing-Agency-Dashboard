import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ClientsPage from './pages/ClientsPage'
import ClientDetailPage from './pages/ClientDetailPage'
import DeliverablesPage from './pages/DeliverablesPage'
import PaymentsPage from './pages/PaymentsPage'
import ReportsPage from './pages/ReportsPage'
import SopsPage from './pages/SopsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/dashboard" element={<HomePage />} />
      <Route path="/clients" element={<ClientsPage />} />
      <Route path="/client/:clientId" element={<ClientDetailPage />} />
      <Route path="/deliverables" element={<DeliverablesPage />} />
      <Route path="/payments" element={<PaymentsPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/sops" element={<SopsPage />} />
    </Routes>
  )
}
