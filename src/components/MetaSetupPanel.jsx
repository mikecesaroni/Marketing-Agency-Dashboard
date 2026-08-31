import { useEffect, useState } from 'react'
import ChannelSetupPanel from './ChannelSetupPanel'
import CopySetupMessageButton from './CopySetupMessageButton'
import { supabase } from '../lib/supabaseClient'
import {
  BUSINESS_ID_PLACEHOLDER,
  META_ACCESS_WATCHOUTS,
  buildMetaSetupMessage,
} from '../lib/metaSetupMessage'

// The client grants this access themselves, so our half is knowing how it goes
// wrong. It goes wrong the same way every time -- partial permissions that look
// complete from their side -- and that is worth saying next to the button that
// sends the message rather than in a commit nobody will read.
function Watchouts() {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] font-medium text-slate-500 underline hover:text-slate-800"
      >
        {open ? 'Hide' : 'Why access keeps coming back half-granted'}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          {META_ACCESS_WATCHOUTS.map((note) => (
            <li key={note} className="flex gap-2 text-[11px] text-amber-900">
              <span className="flex-shrink-0 text-amber-500">&middot;</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
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
      footer={<Watchouts />}
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
