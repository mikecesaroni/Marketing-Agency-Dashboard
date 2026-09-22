import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { buildMetaSetupMessage, META_ACCESS_WATCHOUTS } from '../lib/metaSetupMessage'
import { buildLsaSetupMessage } from '../lib/lsaSetupMessage'
import { buildGbpSetupMessage } from '../lib/gbpSetupMessage'
import CopySetupMessageButton from './CopySetupMessageButton'
import GbpAgentPromptButton from './GbpAgentPromptButton'
import Modal from './Modal'

/**
 * The access message for one channel, ready to copy, opened from a client's
 * Next-up bar.
 *
 * The three messages already existed on the Deliverables page, under a list
 * of every client who still needs that channel. Reaching them meant leaving
 * the client you were working on, so the copy step was skipped and the ask
 * went out reworded from memory, which is how a partner request ends up
 * naming the wrong portfolio. Same builders, same stored ids, one click from
 * the client page.
 */
const CHANNELS = {
  meta: {
    title: 'Meta access request',
    key: 'meta_business_id',
    build: (v) => buildMetaSetupMessage(v),
    missing: 'No business portfolio ID saved (app_settings.meta_business_id). The message will carry a placeholder until it is.',
    blurb: 'Send this to the owner. They add our email as a user on their Business Portfolio; we take it from there.',
  },
  lsa: {
    title: 'Google LSA access request',
    key: 'google_ads_manager_id',
    build: (v) => buildLsaSetupMessage(v),
    missing: 'No Google Ads manager ID saved (app_settings.google_ads_manager_id).',
    blurb: 'Send this to the owner. They approve our manager account on their Local Services account.',
  },
  // No key: the GBP message names our own email, which is a constant in the
  // code rather than a row anyone has to keep current.
  gbp: {
    title: 'Google Business Profile access request',
    build: () => buildGbpSetupMessage(),
    blurb: 'Send this to the owner. Once we are a manager on the profile, the agent brief below does the optimisation.',
  },
}

export default function SetupMessageModal({ channel, client, intake, onClose }) {
  const spec = CHANNELS[channel]
  const [value, setValue] = useState(null)

  useEffect(() => {
    if (!spec) return
    if (!spec.key) {
      setValue('')
      return
    }
    let cancelled = false
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', spec.key)
      .maybeSingle()
      .then(({ data }) => !cancelled && setValue(data?.value || ''))
      .catch(() => !cancelled && setValue(''))
    return () => {
      cancelled = true
    }
  }, [spec])

  if (!spec) return null
  const message = value === null ? '' : spec.build(value)

  return (
    <Modal isOpen onClose={onClose} title={`${spec.title} · ${client.name}`}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{spec.blurb}</p>
        {value === '' && (
          <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{spec.missing}</p>
        )}
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
          {value === null ? 'Loading…' : message}
        </pre>
        <div className="flex flex-wrap items-center gap-2">
          {value !== null && <CopySetupMessageButton message={message} />}
          {channel === 'gbp' && <GbpAgentPromptButton client={client} intake={intake} />}
        </div>
        {channel === 'meta' && (
          <ul className="space-y-1 text-xs text-slate-600">
            {META_ACCESS_WATCHOUTS.map((w, i) => (
              <li key={i}>{typeof w === 'string' ? w : w.text || JSON.stringify(w)}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
