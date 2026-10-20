import { Suspense, lazy } from 'react'
import { Navigate, Routes, Route, useLocation } from 'react-router-dom'
// The pages a client opens load with the first file: a phone on a slow
// connection gets the dashboard or a script in one trip, with no second
// download to wait for.
import WeeklyReportPage from './pages/WeeklyReportPage'
import ClientDashboardPage from './pages/ClientDashboardPage'
import ScriptStudioPage from './pages/ScriptStudioPage'
import ClientVideosPage from './pages/ClientVideosPage'
import ClientOnboardingPage from './pages/ClientOnboardingPage'
import AdApprovalPage from './pages/AdApprovalPage'
import LoginPage from './pages/LoginPage'
import NothingHerePage from './pages/NothingHerePage'
import RequireAuth from './components/RequireAuth'
import { isPublicPath, onPublicSite } from './lib/publicSite'

// The CRM's pages load on demand, each as its own file, so none of the
// agency's screens ride along to a client's phone. A page a CRM user has
// not opened yet costs one short fetch the first time; the browser keeps
// the file after that (public/_headers caches /assets for a year). A tab
// left open across a deploy reloads itself once if a file has gone
// (vite:preloadError, in src/main.jsx).
const HomePage = lazy(() => import('./pages/HomePage'))
const ClientsPage = lazy(() => import('./pages/ClientsPage'))
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage'))
const ClientStatusPage = lazy(() => import('./pages/ClientStatusPage'))
const TasksPage = lazy(() => import('./pages/TasksPage'))
const ContentPage = lazy(() => import('./pages/ContentPage'))
const DrivePhotosPage = lazy(() => import('./pages/DrivePhotosPage'))
const PublishPage = lazy(() => import('./pages/PublishPage'))
const FunnelPage = lazy(() => import('./pages/FunnelPage'))
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const GoogleSearchReportPage = lazy(() => import('./pages/GoogleSearchReportPage'))
const ClientAdsPage = lazy(() => import('./pages/ClientAdsPage'))
const ChannelRedirect = lazy(() => import('./pages/ClientAdsPage').then((m) => ({ default: m.ChannelRedirect })))
const KeywordPlanPage = lazy(() => import('./pages/KeywordPlanPage'))
const MetaReportPage = lazy(() => import('./pages/MetaReportPage'))
const SopsPage = lazy(() => import('./pages/SopsPage'))
const AiSearchPage = lazy(() => import('./pages/AiSearchPage'))
const AgentGuidePage = lazy(() => import('./pages/AgentGuidePage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const HelpChat = lazy(() => import('./components/HelpChat'))

/** What shows for the moment a CRM page's file is on its way. */
function PageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-400" aria-busy="true">
      Loading…
    </div>
  )
}

export default function App() {
  const { pathname } = useLocation()

  // The client-facing site (VITE_PUBLIC_ONLY, or a host named in
  // VITE_PUBLIC_HOST) serves the token pages and nothing else: there is no
  // CRM to find by editing the address. See src/lib/publicSite.js.
  if (onPublicSite()) {
    return (
      <Routes>
        <Route path="/onboarding/:token" element={<ClientOnboardingPage />} />
        <Route path="/approve/:token" element={<AdApprovalPage />} />
        <Route path="/report/:token" element={<WeeklyReportPage />} />
        <Route path="/dashboard/:token" element={<ClientDashboardPage />} />
        <Route path="/scripts/:token" element={<ScriptStudioPage />} />
        <Route path="/videos/:token" element={<ClientVideosPage />} />
        <Route path="*" element={<NothingHerePage />} />
      </Routes>
    )
  }

  // The help chat is the agency's: a client page never fetches its file,
  // let alone shows it (HelpChat checks the path again itself).
  const agencyPage = !isPublicPath(pathname) && !/^\/login(\/|$)/.test(pathname)

  return (
    <>
    {/* The help chat sits outside the routes so a conversation survives the
        page changes it causes itself. It hides on the public token pages. */}
    {agencyPage && (
      <Suspense fallback={null}>
        <HelpChat />
      </Suspense>
    )}
    <Suspense fallback={<PageLoading />}>
    <Routes>
      {/* Public, token-gated. Deliberately outside the dashboard shell: the
          person opening it is a client, not a CRM user, and must never see the
          agency nav. */}
      <Route path="/onboarding/:token" element={<ClientOnboardingPage />} />
      {/* Public, like the onboarding link: the token is the credential, and
          the page reads through ad_approval_load rather than the tables. */}
      <Route path="/approve/:token" element={<AdApprovalPage />} />
      {/* Public, like the approval link: the weekly report a client opens from
          their email, read by token through weekly_report_load. */}
      <Route path="/report/:token" element={<WeeklyReportPage />} />
      <Route path="/dashboard/:token" element={<ClientDashboardPage />} />
      {/* Public, the same token as the dashboard: the client's own video
          scripts, through the script-studio function. */}
      <Route path="/scripts/:token" element={<ScriptStudioPage />} />
      {/* Public, the same token again: every video ad that went live on the
          client's account, to watch and download, through client_videos_load. */}
      <Route path="/videos/:token" element={<ClientVideosPage />} />
      <Route path="/login" element={<LoginPage />} />
      {/* Everything else needs a login. RequireAuth also turns a VA away from
          the admin-only paths (see src/lib/access.js), so /payments and /team
          need no guard of their own. */}
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<HomePage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/content" element={<ContentPage />} />
        <Route path="/content/drive/:clientId" element={<DrivePhotosPage />} />
        <Route path="/publish/:clientId" element={<PublishPage />} />
        <Route path="/funnel/:clientId" element={<FunnelPage />} />
        <Route path="/client/:clientId" element={<ClientDetailPage />} />
        {/* The Client status board: every client in their package's bucket,
            what they are owed, what is done, and who needs a call. It took
            over from the Onboarding Progress board; the old address still
            lands here. */}
        <Route path="/status" element={<ClientStatusPage />} />
        <Route path="/deliverables" element={<Navigate to="/status" replace />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/google-search" element={<GoogleSearchReportPage />} />
        <Route path="/reports/google-search/:clientId" element={<ChannelRedirect channel="google" />} />
        <Route path="/reports/meta" element={<MetaReportPage />} />
        <Route path="/reports/meta/:clientId" element={<ChannelRedirect channel="meta" />} />
        <Route path="/reports/client/:clientId" element={<ClientAdsPage />} />
        <Route path="/reports/client/:clientId/keyword-plan" element={<KeywordPlanPage />} />
        <Route path="/sops" element={<SopsPage />} />
        <Route path="/ai-search" element={<AiSearchPage />} />
        <Route path="/team" element={<TeamPage />} />
        {/* How to drive the place. Also served as plain text at /llms.txt for
            anything that does not run JavaScript -- see src/lib/agentGuide.js. */}
        <Route path="/guide" element={<AgentGuidePage />} />
      </Route>
    </Routes>
    </Suspense>
    </>
  )
}
