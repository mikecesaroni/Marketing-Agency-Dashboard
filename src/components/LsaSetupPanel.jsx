import ChannelSetupPanel from './ChannelSetupPanel'
import CopySetupMessageButton from './CopySetupMessageButton'
import { LSA_SETUP_MESSAGE } from '../lib/lsaSetupMessage'

export default function LsaSetupPanel() {
  return (
    <ChannelSetupPanel
      field="lsa_active"
      otherField="meta_ads_active"
      otherLabel="Meta"
      icon="📍"
      title="LSA setup still needed"
      markLabel="Mark LSA live"
      allLiveMessage="Google LSA is live for every client."
      action={<CopySetupMessageButton message={LSA_SETUP_MESSAGE} />}
    />
  )
}
