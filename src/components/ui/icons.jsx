/**
 * The icon set.
 *
 * The nav used emoji, and emoji are the fastest way to make software look
 * homemade: they are somebody else's illustrations, they render differently on
 * every OS, they ignore the text colour around them, and they cannot be made
 * to align on a baseline. A screenshot of this CRM goes in front of clients.
 *
 * All one family: 24-unit box, 1.5 stroke, round caps, no fills, and
 * `currentColor` throughout so an icon takes the colour of whatever it sits
 * in and the active nav state works without a second copy of each icon.
 */

function Icon({ children, className = 'h-[18px] w-[18px]', ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function IconDashboard(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Icon>
  )
}

export function IconClients(props) {
  return (
    <Icon {...props}>
      <path d="M16 19v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V19" />
      <circle cx="9" cy="7" r="3.25" />
      <path d="M22 19v-1.5a4 4 0 0 0-3-3.87" />
      <path d="M16 4.13a4 4 0 0 1 0 5.74" />
    </Icon>
  )
}

export function IconDeliverables(props) {
  return (
    <Icon {...props}>
      <path d="M21 8.5v7a2 2 0 0 1-1.05 1.76l-7 3.5a2 2 0 0 1-1.9 0l-7-3.5A2 2 0 0 1 3 15.5v-7" />
      <path d="M3.3 7.4 11.05 3.6a2 2 0 0 1 1.9 0l7.75 3.8a1 1 0 0 1 0 1.8l-7.75 3.8a2 2 0 0 1-1.9 0L3.3 9.2a1 1 0 0 1 0-1.8Z" />
      <path d="M12 12.6V21" />
    </Icon>
  )
}

export function IconPayments(props) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19" />
      <path d="M6.5 14.5h3" />
    </Icon>
  )
}

export function IconReports(props) {
  return (
    <Icon {...props}>
      <path d="M3 20h18" />
      <path d="M4 16.5 9.5 11l3.5 3.5L20 7" />
      <path d="M15.5 7H20v4.5" />
    </Icon>
  )
}

export function IconSops(props) {
  return (
    <Icon {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19a1 1 0 0 1 1 1v13" />
      <path d="M6.5 17H20v3.5a.5.5 0 0 1-.5.5H6.5A2.5 2.5 0 0 1 4 18.5v-13" />
      <path d="M8.5 8h7" />
    </Icon>
  )
}

export function IconAiSearch(props) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.6-4.6" />
      <path d="M10.5 7.5 11.4 9.6l2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9Z" />
    </Icon>
  )
}

// A compass, for the guide: the nav item that tells you where everything is.
export function IconCompass(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9Z" />
    </Icon>
  )
}

export function IconAlert(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5" />
      <path d="M12 16h.01" />
    </Icon>
  )
}

export function IconClock(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  )
}

export function IconClipboard(props) {
  return (
    <Icon {...props}>
      <path d="M9 4.5H7.5A1.5 1.5 0 0 0 6 6v13a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V6a1.5 1.5 0 0 0-1.5-1.5H15" />
      <rect x="9" y="3" width="6" height="3.5" rx="1" />
      <path d="M9.5 11h5" />
      <path d="M9.5 14.5h3" />
    </Icon>
  )
}

export function IconLaunch(props) {
  return (
    <Icon {...props}>
      <path d="M13.5 4.5c3.5 1 5.5 3.5 6 7-3.5 4-7 6-10.5 6.5" />
      <path d="M9 18 6 15" />
      <path d="M4.5 12.5c.5-3.5 2.5-6 6-7L15 9l-2.5 4.5Z" />
      <circle cx="14" cy="10" r="1.25" />
    </Icon>
  )
}

export function IconPin(props) {
  return (
    <Icon {...props}>
      <path d="M12 21s6.5-5.4 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.6 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.5" />
    </Icon>
  )
}

export function IconCheckCircle(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
    </Icon>
  )
}

export function IconTrendUp(props) {
  return (
    <Icon {...props}>
      <path d="m4 16 5.5-5.5 3 3L20 6" />
      <path d="M15 6h5v5" />
    </Icon>
  )
}

export function IconTrendDown(props) {
  return (
    <Icon {...props}>
      <path d="m4 8 5.5 5.5 3-3L20 18" />
      <path d="M15 18h5v-5" />
    </Icon>
  )
}
