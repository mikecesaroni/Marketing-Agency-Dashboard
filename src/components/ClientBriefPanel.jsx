import { useMemo, useState } from 'react'
import { buildBrief, missingForBrief } from '../lib/clientBrief'
import { copyText } from '../lib/intakeSummary'

// The assembled working brief for one client.
//
// Replaces creating a Claude Project and pasting the instructions, the intake
// and the playbook into it. Missing intake fields are called out at the top
// rather than rendering as empty brackets further down, because a blank that
// looks like a real answer is worse than a blank that announces itself.
export default function ClientBriefPanel({ client, intake, ads }) {
  const [copied, setCopied] = useState(false)

  const brief = useMemo(() => buildBrief({ client, intake, ads }), [client, intake, ads])
  const missing = useMemo(() => missingForBrief(intake), [intake])

  const handleCopy = async () => {
    const ok = await copyText(brief)
    setCopied(ok)
    setTimeout(() => setCopied(false), 2000)
  }

  const words = brief.split(/\s+/).length

  return (
    <div className="space-y-4">
      {!client?.meta_ad_account_id && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-semibold text-red-800">No Meta ad account linked</p>
          <p className="text-xs text-red-700 mt-1">
            The brief will say NOT SET where the account should be. Assign one in the Meta Ads
            Sync card before building campaigns for this client.
          </p>
        </div>
      )}

      {missing.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-semibold text-amber-900 mb-2">
            {missing.length} intake {missing.length === 1 ? 'field is' : 'fields are'} empty
          </p>
          <ul className="space-y-1">
            {missing.map((m) => (
              <li key={m.key} className="text-xs text-amber-800">
                <span className="font-medium">{m.label}</span> — {m.why}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-700 mt-2">
            The brief still works; these show as &quot;[not captured]&quot;. Fill them in the
            Intake Form to get better output.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleCopy}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          {copied ? '✓ Copied' : 'Copy brief'}
        </button>
        <span className="text-xs text-slate-500">
          ~{words.toLocaleString()} words · paste as the first message in a new Claude chat
        </span>
      </div>

      <pre className="text-[11px] leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-[55vh] overflow-y-auto">
        {brief}
      </pre>
    </div>
  )
}
