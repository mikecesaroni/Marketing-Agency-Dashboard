import ChannelSetupPanel from './ChannelSetupPanel'
import CopySetupMessageButton from './CopySetupMessageButton'
import { buildGbpSetupMessage } from '../lib/gbpSetupMessage'

// The address used to come from app_settings.gbp_manager_email, which meant
// changing it was a database trip and the row could sit stale behind the code.
// It is a constant now (src/lib/agencyEmail.js), so there is nothing to load
// and nothing to be missing.
export default function GbpSetupPanel() {
  return (
    <ChannelSetupPanel
      field="gbp_optimized"
      otherField="meta_ads_active"
      otherLabel="Meta"
      icon="🗺️"
      title="Google Business Profile not optimized yet"
      markLabel="Mark GBP optimized"
      allLiveMessage="Every client's Google Business Profile is optimized."
      action={<CopySetupMessageButton message={buildGbpSetupMessage()} />}
    />
  )
}
