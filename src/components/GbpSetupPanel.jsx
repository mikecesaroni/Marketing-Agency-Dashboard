import { useEffect, useState } from 'react'
import ChannelSetupPanel from './ChannelSetupPanel'
import CopySetupMessageButton from './CopySetupMessageButton'
import { supabase } from '../lib/supabaseClient'
import { MANAGER_EMAIL_PLACEHOLDER, buildGbpSetupMessage } from '../lib/gbpSetupMessage'

export default function GbpSetupPanel() {
  const [email, setEmail] = useState(null)

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'gbp_manager_email')
      .maybeSingle()
      .then(({ data }) => setEmail(data?.value || ''))
      .catch(() => setEmail(''))
  }, [])

  const missing = email !== null && !email

  return (
    <ChannelSetupPanel
      field="gbp_optimized"
      otherField="meta_ads_active"
      otherLabel="Meta"
      icon="🗺️"
      title="Google Business Profile not optimized yet"
      markLabel="Mark GBP optimized"
      allLiveMessage="Every client's Google Business Profile is optimized."
      action={
        <div className="flex items-center gap-2">
          {missing && (
            <span
              title={`The message will say ${MANAGER_EMAIL_PLACEHOLDER} until an address is saved in app_settings.gbp_manager_email.`}
              className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 whitespace-nowrap"
            >
              No email set
            </span>
          )}
          <CopySetupMessageButton message={buildGbpSetupMessage(email)} />
        </div>
      }
    />
  )
}
