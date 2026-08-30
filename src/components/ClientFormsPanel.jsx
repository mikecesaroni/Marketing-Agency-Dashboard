import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Modal from './Modal'
import OnboardingIntakeForm from './OnboardingIntakeForm'
import GhlSetupForm from './GhlSetupForm'
import OnboardingLinkPanel from './OnboardingLinkPanel'
import { Badge, Button, Card } from './ui'
import { CLIENT_INTAKE_KEYS } from '../lib/intakeSummary'
import { GHL_REQUIRED_KEYS, missingRequired } from '../lib/ghlSetupFields'

/**
 * The two client forms, each with what is in it and how to send it.
 *
 * There used to be three buttons in the page header -- Intake Form, GHL Setup,
 * and Send to Client -- and the third one opened a panel with its own
 * which-halves selector. So deciding what to send happened in a different place
 * from looking at what was in it, and the selector was a fourth way to express
 * a choice the first two buttons had already made. Picking "GHL setup only"
 * there while having just read the onboarding answers was an easy mistake and
 * nothing stopped it.
 *
 * One row per form instead. Each row says what came back, opens the form, and
 * sends its own link -- so the thing you send is the thing you were just
 * looking at. Sending both together is still one action, because that is the
 * common case at the start of a client, but it is stated as its own row rather
 * than hidden inside a selector.
 */

// Only the GHL row is conditional. A client not on the GHL plan is never being
// asked for an EIN, so the row would be an invitation to send them the wrong
// thing.
function Row({ title, blurb, status, onOpen, onSend, sendLabel }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold tracking-tight text-slate-900">{title}</p>
          {status}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{blurb}</p>
      </div>
      <div className="flex flex-shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={onOpen}>
          Open
        </Button>
        <Button variant="dark" size="sm" onClick={onSend}>
          {sendLabel}
        </Button>
      </div>
    </div>
  )
}

export default function ClientFormsPanel({ client, intake, onDataChanged }) {
  const [link, setLink] = useState(null)
  const [ghl, setGhl] = useState(null)
  const [open, setOpen] = useState(null) // 'intake' | 'ghl'
  const [sending, setSending] = useState(null) // 'intake' | 'ghl' | 'both'

  useEffect(() => {
    let cancelled = false

    // The link row carries the submitted timestamps, which is what turns "we
    // sent it" into "they did it".
    supabase
      .from('onboarding_links')
      .select('intake_submitted_at, ghl_submitted_at')
      .eq('client_id', client.id)
      .eq('revoked', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => !cancelled && setLink(data || null))

    supabase
      .from('ghl_setup')
      .select(GHL_REQUIRED_KEYS.join(', '))
      .eq('client_id', client.id)
      .maybeSingle()
      .then(({ data }) => !cancelled && setGhl(data || null))

    return () => {
      cancelled = true
    }
  }, [client.id, intake])

  // How much of the onboarding is actually answered. A submitted date alone
  // reads as done even when half the boxes were skipped, and the brief is only
  // as good as what is in them.
  const answered = intake
    ? CLIENT_INTAKE_KEYS.filter((k) => {
        const v = intake[k]
        return v !== null && v !== undefined && String(v).trim() !== ''
      }).length
    : 0
  const intakeTotal = CLIENT_INTAKE_KEYS.length

  const ghlMissing = ghl ? missingRequired(ghl) : GHL_REQUIRED_KEYS
  const submitted = (at) => (at ? new Date(at).toLocaleDateString() : null)

  const intakeStatus = link?.intake_submitted_at ? (
    <Badge tone="success">Submitted {submitted(link.intake_submitted_at)}</Badge>
  ) : answered > 0 ? (
    <Badge tone="info">In progress</Badge>
  ) : (
    <Badge tone="dim">Not started</Badge>
  )

  const ghlStatus = link?.ghl_submitted_at ? (
    <Badge tone="success">Submitted {submitted(link.ghl_submitted_at)}</Badge>
  ) : ghl ? (
    <Badge tone="warning">{ghlMissing.length} still needed</Badge>
  ) : (
    <Badge tone="dim">Not started</Badge>
  )

  const closeForm = () => {
    setOpen(null)
    onDataChanged?.()
  }

  return (
    <Card padding="none" className="mb-6 p-4 md:mb-8 md:p-6">
      <div className="mb-1">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Client forms</h2>
        <p className="text-xs text-slate-500">
          What they have sent back, and the link to chase what they have not.
        </p>
      </div>

      <Row
        title="Onboarding"
        blurb={
          link?.intake_submitted_at
            ? `${answered} of ${intakeTotal} questions answered.`
            : 'About their business, their offer and their customers. Feeds the brief and the Ad Studio.'
        }
        status={intakeStatus}
        onOpen={() => setOpen('intake')}
        onSend={() => setSending('intake')}
        sendLabel="Send link"
      />

      {/* Only for clients whose GoHighLevel we are building. Asking anyone else
          for an EIN and a registration address is a good way to lose them. */}
      {client.ghl_plan && (
        <Row
          title="GHL account setup"
          blurb="EIN, registered address and the authorised contact. Needed before text messaging can be filed."
          status={ghlStatus}
          onOpen={() => setOpen('ghl')}
          onSend={() => setSending('ghl')}
          sendLabel="Send link"
        />
      )}

      {/* The common case at the start of a client, so it is one action rather
          than two messages -- but stated as its own row instead of hidden in a
          selector. */}
      {client.ghl_plan && !link?.intake_submitted_at && !link?.ghl_submitted_at && (
        <div className="flex items-center justify-between gap-3 pt-3">
          <p className="text-xs text-slate-500">Starting fresh? Send both in one message.</p>
          <Button size="sm" onClick={() => setSending('both')}>
            Send both
          </Button>
        </div>
      )}

      <Modal isOpen={open === 'intake'} onClose={closeForm} title="Onboarding intake">
        <OnboardingIntakeForm client={client} onSuccess={closeForm} onClose={() => setOpen(null)} />
      </Modal>

      <Modal isOpen={open === 'ghl'} onClose={closeForm} title="GHL account setup">
        <GhlSetupForm client={client} onSuccess={closeForm} onClose={() => setOpen(null)} />
      </Modal>

      <Modal
        isOpen={Boolean(sending)}
        onClose={() => setSending(null)}
        title={
          sending === 'ghl'
            ? 'Send the GHL setup form'
            : sending === 'both'
              ? 'Send both forms'
              : 'Send the onboarding form'
        }
      >
        {sending && <OnboardingLinkPanel client={client} fixedMode={sending} />}
      </Modal>
    </Card>
  )
}
