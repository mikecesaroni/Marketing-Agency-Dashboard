import ChannelSetupPanel from './ChannelSetupPanel'
import CopySetupMessageButton from './CopySetupMessageButton'
import { META_SETUP_MESSAGE } from '../lib/metaSetupMessage'

export default function MetaSetupPanel() {
  return (
    <ChannelSetupPanel
      field="meta_ads_active"
      otherField="lsa_active"
      otherLabel="LSA"
      icon="🚀"
      title="Meta ads not live yet"
      markLabel="Mark Meta live"
      allLiveMessage="Meta ads are live for every client."
      action={<CopySetupMessageButton message={META_SETUP_MESSAGE} />}
    />
  )
}
