import ChannelSetupPanel from './ChannelSetupPanel'
import CopySetupMessageButton from './CopySetupMessageButton'
import { buildLsaSetupMessage } from '../lib/lsaSetupMessage'

// The manager-account ID used to be loaded here to fill STEP 3 of the message.
// That step is gone, so there is nothing to load and no "No manager ID set"
// warning to show.
export default function LsaSetupPanel() {
  return (
    <ChannelSetupPanel
      field="lsa_active"
      otherField="meta_ads_active"
      otherLabel="Meta"
      icon="📍"
      title="LSA not optimized yet"
      markLabel="Mark LSA optimized"
      allLiveMessage="Google LSA is optimized for every client."
      action={<CopySetupMessageButton message={buildLsaSetupMessage()} />}
    />
  )
}
