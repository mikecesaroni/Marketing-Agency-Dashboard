// Where a pipeline step's button goes when it is pressed away from the client
// page. Pure, shared by the Deliverables board and the dashboard digest so a
// step lands in the same place from either.

/** Steps whose action is a message to copy, done in a modal wherever the button is. */
export const MODAL_KINDS = new Set(['send-onboarding', 'send-ghl', 'meta-access', 'lsa-access', 'gbp'])

export function stepHref(clientId, step) {
  switch (step?.action?.kind) {
    case 'call':
      return `/client/${clientId}#onboarding-call`
    case 'ghl-toggle':
    case 'meta-toggle':
      return `/client/${clientId}#channels`
    case 'studio':
      return `/client/${clientId}?open=studio`
    case 'publish':
      return `/client/${clientId}?open=publish`
    case 'kpis':
      return `/client/${clientId}?open=kpis`
    case 'payments':
      return '/payments'
    case 'report':
      return '/reports'
    // The message steps have no page of their own: from the dashboard they
    // go to the client page, whose Next-up bar has the copy button.
    case 'send-onboarding':
    case 'send-ghl':
    case 'meta-access':
    case 'lsa-access':
    case 'gbp':
      return `/client/${clientId}`
    default:
      return `/client/${clientId}#deliverables`
  }
}
