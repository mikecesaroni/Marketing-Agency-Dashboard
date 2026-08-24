import { useEffect, useState } from 'react'
import ChannelSetupPanel from './ChannelSetupPanel'
import CopySetupMessageButton from './CopySetupMessageButton'
import { supabase } from '../lib/supabaseClient'
import { BUSINESS_ID_PLACEHOLDER, buildMetaSetupMessage } from '../lib/metaSetupMessage'

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
