import { useState } from 'react'
import { copyText } from '../lib/intakeSummary'

// The copy-to-clipboard button on a channel setup panel. Shared by Meta and
// LSA so the two behave identically rather than drifting apart. `label` for
// a panel that offers two messages side by side.
export default function CopySetupMessageButton({ message, label = 'Copy setup message', onDark = false }) {
  const [copied, setCopied] = useState(null)

  const handleCopy = async () => {
    const ok = await copyText(message)
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
            : onDark
              ? 'border border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.12]'
              : 'bg-slate-900 text-white hover:bg-slate-800'
      }`}
    >
      {copied === 'ok' ? '✓ Copied' : copied === 'fail' ? 'Copy failed' : label}
    </button>
  )
}
