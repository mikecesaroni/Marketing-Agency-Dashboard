import { useState } from 'react'
import ChannelSetupPanel from './ChannelSetupPanel'
import { copyText } from '../lib/intakeSummary'
import { LSA_SETUP_MESSAGE } from '../lib/lsaSetupMessage'

function CopyMessageButton() {
  const [copied, setCopied] = useState(null)

  const handleCopy = async () => {
    const ok = await copyText(LSA_SETUP_MESSAGE)
    setCopied(ok ? 'ok' : 'fail')
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
        copied === 'ok'
          ? 'bg-green-600 text-white'
          : copied === 'fail'
            ? 'bg-red-100 text-red-700'
            : 'bg-slate-900 text-white hover:bg-slate-800'
      }`}
    >
      {copied === 'ok' ? '✓ Copied' : copied === 'fail' ? 'Copy failed' : 'Copy setup message'}
    </button>
  )
}

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
      action={<CopyMessageButton />}
    />
  )
}
