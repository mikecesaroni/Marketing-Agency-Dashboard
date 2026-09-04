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
import AdApprovalPage from './pages/AdApprovalPage'
import AgentGuidePage from './pages/AgentGuidePage'

export default function App() {
  return (
    <Routes>
      {/* Public, token-gated. Deliberately outside the dashboard shell: the
          person opening it is a client, not a CRM user, and must never see the
          agency nav. */}
      <Route path="/onboarding/:token" element={<ClientOnboardingPage />} />
      {/* Public, like the onboarding link: the token is the credential, and
          the page reads through ad_approval_load rather than the tables. */}
      <Route path="/approve/:token" element={<AdApprovalPage />} />
      <Route path="/" element={<HomePage />} />
      <Route path="/dashboard" element={<HomePage />} />
      <Route path="/clients" element={<ClientsPage />} />
      <Route path="/client/:clientId" element={<ClientDetailPage />} />
      <Route path="/deliverables" element={<DeliverablesPage />} />
      <Route path="/payments" element={<PaymentsPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/sops" element={<SopsPage />} />
      <Route path="/ai-search" element={<AiSearchPage />} />
      {/* How to drive the place. Also served as plain text at /llms.txt for
          anything that does not run JavaScript -- see src/lib/agentGuide.js. */}
      <Route path="/guide" element={<AgentGuidePage />} />
    </Routes>
  )
}
