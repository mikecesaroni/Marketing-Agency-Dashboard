import { useEffect, useState } from 'react'
import ChannelSetupPanel from './ChannelSetupPanel'
import CopySetupMessageButton from './CopySetupMessageButton'
import { supabase } from '../lib/supabaseClient'
import {
  BUSINESS_ID_PLACEHOLDER,
  META_REQUEST_STEPS,
  buildMetaSetupMessage,
} from '../lib/metaSetupMessage'

// Our half of the job, written where the person doing it will look. The
// message now asks the client to approve requests we send, so somebody has to
// actually send them -- and a message promising approvals that never arrive is
// worse than the old one that at least asked them to do it themselves.
function RequestSteps() {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] font-medium text-slate-500 underline hover:text-slate-800"
      >
        {open ? 'Hide' : 'What to do before sending this'}
      </button>
      {open && (
        <ol className="mt-1.5 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          {META_REQUEST_STEPS.map((step, i) => (
            <li key={step} className="flex gap-2 text-[11px] text-slate-600">
              <span className="flex-shrink-0 font-semibold text-slate-400">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default function MetaSetupPanel() {
  const [businessId, setBusinessId] = useState(null)

  // Stored rather than hard-coded: sending the wrong ID produces a partner
  // request that silently goes to somebody else's portfolio.
  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'meta_business_id')
      .maybeSingle()
      .then(({ data }) => setBusinessId(data?.value || ''))
      .catch(() => setBusinessId(''))
  }, [])

  const message = buildMetaSetupMessage(businessId)
  const missing = businessId !== null && !businessId

  return (
    <ChannelSetupPanel
      field="meta_ads_active"
      otherField="lsa_active"
      otherLabel="LSA"
      icon="🚀"
      title="Meta ads not live yet"
      markLabel="Mark Meta live"
      allLiveMessage="Meta ads are live for every client."
      footer={<RequestSteps />}
      action={
        <div className="flex items-center gap-2">
          {missing && (
            <span
              title={`The message will say ${BUSINESS_ID_PLACEHOLDER} until the ID is saved in app_settings.meta_business_id. Find it in Business Settings > Business Info.`}
              className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 whitespace-nowrap"
            >
              No business ID set
            </span>
          )}
          <CopySetupMessageButton message={message} />
        </div>
      }
    />
  )
}
