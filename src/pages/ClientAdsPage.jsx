import { useEffect, useState } from 'react'
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import ChannelSwitch from '../components/reports/ChannelSwitch'
import MetaClientReportPage from './MetaClientReportPage'
import GoogleClientReportPage from './GoogleClientReportPage'
import { supabase } from '../lib/supabaseClient'
import { defaultChannel } from '../lib/clientReportKit'

/**
 * One client's ads, both channels on one page: a Meta / Google Ads switch at
 * the top, and under it the same page the Meta and Google Ads reports open
 * for that client. ?channel= picks the side; without it, the page opens on
 * the channel the client actually has (Meta first, then Google Ads).
 */
export default function ClientAdsPage() {
  const { clientId } = useParams()
  const [params, setParams] = useSearchParams()
  const channel = params.get('channel')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (channel === 'meta' || channel === 'google') return
    let cancelled = false
    supabase
      .from('clients')
      .select('meta_ad_account_id, google_ads_customer_id')
      .eq('id', clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const next = new URLSearchParams(params)
        next.set('channel', defaultChannel(data))
        setParams(next, { replace: true })
      }, () => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
    // Only when the channel is missing; params is read, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, channel])

  if (channel === 'google') return <GoogleClientReportPage switcher={<ChannelSwitch value="google" />} />
  if (channel === 'meta' || failed) return <MetaClientReportPage switcher={<ChannelSwitch value="meta" />} />
  return (
    <Layout tone="dark" title="Loading…">
      <div className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
    </Layout>
  )
}


/** The old per-channel addresses land on the shared page, on that channel. */
export function ChannelRedirect({ channel }) {
  const { clientId } = useParams()
  const { search } = useLocation()
  const next = new URLSearchParams(search)
  next.set('channel', channel)
  return <Navigate to={`/reports/client/${clientId}?${next.toString()}`} replace />
}
