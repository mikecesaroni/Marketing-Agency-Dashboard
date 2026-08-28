import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ClientsPage from './pages/ClientsPage'
import ClientDetailPage from './pages/ClientDetailPage'
import DeliverablesPage from './pages/DeliverablesPage'
import PaymentsPage from './pages/PaymentsPage'
import ReportsPage from './pages/ReportsPage'
import SopsPage from './pages/SopsPage'
import AiSearchPage from './pages/AiSearchPage'
import ClientOnboardingPage from './pages/ClientOnboardingPage'

export default function App() {
  return (
    <Routes>
      {/* Public, token-gated. Deliberately outside the dashboard shell: the
          person opening it is a client, not a CRM user, and must never see the
          agency nav. */}
      <Route path="/onboarding/:token" element={<ClientOnboardingPage />} />
      <Route path="/" element={<HomePage />} />
      <Route path="/dashboard" element={<HomePage />} />
      <Route path="/clients" element={<ClientsPage />} />
      <Route path="/client/:clientId" element={<ClientDetailPage />} />
      <Route path="/deliverables" element={<DeliverablesPage />} />
      <Route path="/payments" element={<PaymentsPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/sops" element={<SopsPage />} />
      <Route path="/ai-search" element={<AiSearchPage />} />
    </Routes>
  )
}
