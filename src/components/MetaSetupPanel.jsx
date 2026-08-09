import ChannelSetupPanel from './ChannelSetupPanel'

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
    />
  )
}
