import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import FunnelPanel from '../components/FunnelPanel'
import { Card } from '../components/ui'
import { supabase } from '../lib/supabaseClient'

/**
 * Build a funnel: its own page.
 *
 *   Content → Publish → Build a funnel → client → here.
 *
 * The builder also sits on the client page, under everything else about
 * the client. Standing up a funnel is a job on its own, so it gets a page
 * on its own: the client in a banner, a switch to the next client, and the
 * builder open, nothing else on the screen. /funnel/:clientId.
 */
export default function FunnelPage() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [intake, setIntake] = useState(null)
  const [others, setOthers] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setClient(null)
    setError('')
    ;(async () => {
      try {
        const [c, i, all] = await Promise.all([
          supabase.from('clients').select('*').eq('id', clientId).single(),
          supabase.from('onboarding_intake').select('*').eq('client_id', clientId).maybeSingle(),
          supabase.from('clients').select('id,name,meta_ad_account_id,archived').order('name'),
        ])
        if (c.error) throw c.error
        if (cancelled) return
        setClient(c.data)
        setIntake(i?.data || null)
        setOthers((all.data || []).filter((x) => !x.archived))
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clientId])

  return (
    <Layout
      title="Build a funnel"
      subtitle={client ? `${client.name}: Top of funnel and Retargeting, built in Meta and left paused.` : 'Loading…'}
      actions={
        <>
          <Link to="/content?tab=publish" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
            ← Publish
          </Link>
          {client && (
            <Link to={`/client/${client.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
              Client page
            </Link>
          )}
        </>
      }
    >
      {error && (
        <Card tone="danger" padding="sm" className="mb-3 text-sm text-red-800">
          {error}
        </Card>
      )}

      {client && (
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-orange-500 to-rose-500 p-5 text-white shadow-lg md:p-6">
            <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-100">Funnel for</p>
                <h2 className="mt-1 truncate text-2xl font-bold tracking-tight md:text-3xl">{client.name}</h2>
                <p className="mt-1 text-sm text-orange-50/90">
                  {client.industry || 'Client'}
                  {client.meta_ad_account_id ? '' : ' · no Meta ad account connected'}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-orange-50">
                Switch client
                <select
                  value={client.id}
                  onChange={(e) => navigate(`/funnel/${e.target.value}`)}
                  className="rounded-lg border border-white/30 bg-white/15 px-2.5 py-1.5 text-sm text-white backdrop-blur [&>option]:text-slate-900"
                >
                  {others.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.meta_ad_account_id ? '' : ' (no Meta)'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <FunnelPanel key={client.id} client={client} intake={intake} initialOpen />
        </div>
      )}
    </Layout>
  )
}
