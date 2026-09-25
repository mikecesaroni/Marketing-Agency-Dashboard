// The CRM's map: what is in the sidebar, the phone bar and the home screen.
//
// Grouped, because seven flat items give no clue which are the daily ones and
// which are looked at once a week. The daily work is the client roster; money
// and reporting are their own trip; the reference material is the tail.

import {
  IconAiSearch,
  IconClients,
  IconCompass,
  IconContent,
  IconDashboard,
  IconDeliverables,
  IconPayments,
  IconReports,
  IconSops,
  IconTasks,
  IconTeam,
} from '../components/ui/icons'

export const NAV_GROUPS = [
  {
    label: null,
    items: [
      { to: '/', label: 'Dashboard', short: 'Home', Icon: IconDashboard, end: true },
      { to: '/clients', label: 'Clients', short: 'Clients', Icon: IconClients },
      { to: '/content', label: 'Content', short: 'Content', Icon: IconContent },
      // Off the phone bar (mobile: false): the home screen's tiles reach
      // everything, so the bar keeps the four a thumb goes to all day.
      { to: '/deliverables', label: 'Onboarding Progress', short: 'Onboarding', Icon: IconDeliverables, mobile: false },
      { to: '/tasks', label: 'Tasks', short: 'Tasks', Icon: IconTasks },
    ],
  },
  {
    label: 'Money',
    items: [
      { to: '/payments', label: 'Payments', short: 'Money', Icon: IconPayments, mobile: false },
      { to: '/reports', label: 'Reports', short: 'Reports', Icon: IconReports, mobile: false },
    ],
  },
  {
    label: 'Reference',
    items: [
      { to: '/sops', label: 'SOPs', short: 'SOPs', Icon: IconSops, mobile: false },
      { to: '/ai-search', label: 'AI Search', short: 'AI', Icon: IconAiSearch, mobile: false },
      // Last, and in the nav rather than tucked away, because something
      // arriving here for the first time -- a new hire, or a browsing agent --
      // reads the sidebar before it reads anything else. A guide nobody can
      // find is a file, not a guide.
      { to: '/guide', label: 'Guide', short: 'Guide', Icon: IconCompass, mobile: false },
    ],
  },
  {
    label: 'Admin',
    items: [
      // Admin-only, and filtered out of a VA's sidebar by visibleNav below.
      // Kept off the phone tabs: nine tabs do not fit, and adding a login is
      // a desk job.
      { to: '/team', label: 'Team', short: 'Team', Icon: IconTeam, mobile: false },
    ],
  },
]
