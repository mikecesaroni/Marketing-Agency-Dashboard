import { useEffect, useState } from 'react'
import ChannelSetupPanel from './ChannelSetupPanel'
import CopySetupMessageButton from './CopySetupMessageButton'
import { supabase } from '../lib/supabaseClient'
import { MANAGER_ID_PLACEHOLDER, buildLsaSetupMessage } from '../lib/lsaSetupMessage'

export default function LsaSetupPanel() {
  const [managerId, setManagerId] = useState(null)

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'google_ads_manager_id')
      .maybeSingle()
      .then(({ data }) => setManagerId(data?.value || ''))
      .catch(() => setManagerId(''))
  }, [])

  const missing = managerId !== null && !managerId

  return (
    <ChannelSetupPanel
      field="lsa_active"
      otherField="meta_ads_active"
      otherLabel="Meta"
      icon="📍"
      title="LSA not optimized yet"
      markLabel="Mark LSA optimized"
      allLiveMessage="Google LSA is optimized for every client."
      action={
        <div className="flex items-center gap-2">
          {missing && (
            <span
              title={`The message will say ${MANAGER_ID_PLACEHOLDER} until the ID is saved in app_settings.google_ads_manager_id. It is the 10-digit number at the top of your Google Ads manager account.`}
              className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 whitespace-nowrap"
            >
              No manager ID set
            </span>
          )}
          <CopySetupMessageButton message={buildLsaSetupMessage(managerId)} />
        </div>
      }
    />
  )
}
