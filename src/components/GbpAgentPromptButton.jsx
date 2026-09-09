import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { copyText } from '../lib/intakeSummary'
import { buildGbpAgentPrompt, gbpFacts } from '../lib/gbpAgentPrompt'

/**
 * Copies the browser-agent brief for this client's Google Business Profile,
 * filled from their onboarding answers. Sits next to the GBP switch on the
 * client page. The title says how many facts are still blank, because a brief
 * with gaps makes an agent guess, and the fix is one more intake answer, not
 * a better prompt.
 */
export default function GbpAgentPromptButton({ client, intake }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState(null)

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'gbp_manager_email')
      .maybeSingle()
      .then(({ data }) => setEmail(data?.value || ''))
      .catch(() => {})
  }, [])

  const { gaps } = gbpFacts(client, intake)

  const copy = async () => {
    const ok = await copyText(buildGbpAgentPrompt({ client, intake, managerEmail: email }))
    setState(ok ? 'ok' : 'fail')
    setTimeout(() => setState(null), 2000)
  }

  return (
    <button
      onClick={copy}
      title={
        gaps.length
          ? `A browser-agent brief for optimising this profile, filled from the onboarding form. ${gaps.length} answer${gaps.length === 1 ? ' is' : 's are'} still blank (${gaps.join(', ')}); the agent is told to leave those alone.`
          : 'A browser-agent brief for optimising this profile, filled from the onboarding form. Every fact it needs is on file.'
      }
      className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap border transition ${
        state === 'ok'
          ? 'bg-green-600 border-green-600 text-white'
          : state === 'fail'
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
      }`}
    >
      {state === 'ok' ? '✓ Copied' : state === 'fail' ? 'Copy failed' : `Copy GBP agent prompt${gaps.length ? ` · ${gaps.length} blank` : ''}`}
    </button>
  )
}
