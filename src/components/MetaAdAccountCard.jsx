import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { runMetaSync, summariseSync } from '../lib/metaSync'

export default function MetaAdAccountCard({ client, weeklyKPIs = [], onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(client.meta_ad_account_id || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accounts, setAccounts] = useState([])
  const [manual, setManual] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState('')

  // Only the ad account matters for syncing KPIs. These three are what
  // publishing needs: the Page an ad posts as, the pixel it optimises against,
  // and where the ad sends people.
  const [pageId, setPageId] = useState(client.meta_page_id || '')
  const [pixelId, setPixelId] = useState(client.meta_pixel_id || '')
  const [websiteUrl, setWebsiteUrl] = useState(client.website_url || '')

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult('')
    setError('')
    try {
      setSyncResult(summariseSync(await runMetaSync(client.id)))
      onUpdate?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  // Resolve the connected account's name for display, so the card shows
  // "Comfort Experts NY" rather than a bare 16-digit number.
  useEffect(() => {
    if (!client.meta_ad_account_id) return setAccountName('')
    supabase
      .from('meta_ad_accounts')
      .select('name, business_name')
      .eq('ad_account_id', client.meta_ad_account_id)
      .maybeSingle()
      .then(({ data }) => setAccountName(data?.name || data?.business_name || ''))
  }, [client.meta_ad_account_id])

  // The browser has no Meta credentials, so the pickable accounts come from the
  // meta_ad_accounts table rather than from Meta directly. Which client each is
  // already on is joined here — there's no foreign key between the two tables
  // for PostgREST to embed across.
  useEffect(() => {
    if (!editing) return

    Promise.all([
      supabase.from('meta_ad_accounts').select('ad_account_id, name, business_name').order('name'),
      supabase.from('clients').select('id, name, meta_ad_account_id').not('meta_ad_account_id', 'is', null),
    ]).then(([accountsRes, clientsRes]) => {
      const takenBy = {}
      for (const c of clientsRes.data || []) {
        if (c.id !== client.id) takenBy[c.meta_ad_account_id] = c.name
      }
      setAccounts((accountsRes.data || []).map((a) => ({ ...a, takenBy: takenBy[a.ad_account_id] })))
    })
  }, [editing, client.id])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    // People paste the ID straight out of Ads Manager, where it wears an "act_"
    // prefix. The API call adds that itself, so store the bare number.
    const cleaned = value.trim().replace(/^act_/i, '')

    const { error: err } = await supabase
      .from('clients')
      .update({
        meta_ad_account_id: cleaned || null,
        // Same paste-from-the-interface tolerance as the ad account ID.
        meta_page_id: pageId.trim() || null,
        meta_pixel_id: pixelId.trim() || null,
        website_url: websiteUrl.trim() || null,
      })
      .eq('id', client.id)

    if (err) {
      const missingPublishColumn = /meta_page_id|meta_pixel_id|website_url/.test(err.message)
      setError(
        missingPublishColumn
          ? 'Run supabase/meta-publish.sql in the Supabase SQL Editor to add the publishing fields.'
          : err.message.includes('meta_ad_account_id')
            ? 'Run supabase/meta-sync.sql in the Supabase SQL Editor to add this field.'
            : err.message
      )
      setSaving(false)
      return
    }

    setEditing(false)
    setSaving(false)
    onUpdate?.()
  }

  const lastSynced = weeklyKPIs
    .filter((k) => k.channel === 'Meta' && k.notes === 'Synced from Meta Ads')
    .sort((a, b) => b.week_of.localeCompare(a.week_of))[0]

  return (
    <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-3">
        <h2 className="text-lg md:text-xl font-bold text-slate-900">Meta Ads Sync</h2>
        {!editing && (
          <div className="flex gap-2">
            {client.meta_ad_account_id && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex-1 md:flex-none px-3 py-2 md:py-1.5 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 transition"
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            )}
            <button
              onClick={() => {
                setValue(client.meta_ad_account_id || '')
                setPageId(client.meta_page_id || '')
                setPixelId(client.meta_pixel_id || '')
                setWebsiteUrl(client.website_url || '')
                setEditing(true)
              }}
              className="flex-1 md:flex-none px-3 py-2 md:py-1.5 text-sm bg-slate-200 text-slate-800 rounded-lg font-medium hover:bg-slate-300 transition"
            >
              {client.meta_ad_account_id ? 'Change' : 'Connect Account'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-3">
          {error}
        </div>
      )}

      {syncResult && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm mb-3">
          {syncResult}
        </div>
      )}

      {editing ? (
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-700">Meta ad account</label>
              <button
                type="button"
                onClick={() => setManual((v) => !v)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {manual ? 'Pick from list' : 'Enter ID manually'}
              </button>
            </div>

            {manual || accounts.length === 0 ? (
              <>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. 1234567890123456"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  autoFocus
                />
                <p className="text-xs text-slate-500 mt-1">
                  Numbers only — the "act_" prefix is stripped automatically. Leave blank to stop
                  syncing this client.
                </p>
              </>
            ) : (
              <>
                <select
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  autoFocus
                >
                  <option value="">Not connected</option>
                  {accounts.map((a) => (
                    <option key={a.ad_account_id} value={a.ad_account_id}>
                      {a.name || a.business_name || a.ad_account_id}
                      {a.takenBy ? ` — already on ${a.takenBy}` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Accounts your Meta login can see. Choosing one already on another client moves
                  it.
                </p>
              </>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Needed to publish ads</p>
              <p className="text-xs text-slate-500">
                Only used by the Ad Studio&rsquo;s Publish button. Syncing works without them.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Facebook Page ID
              </label>
              <input
                type="text"
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                placeholder="e.g. 102938475610293"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-xs text-slate-500 mt-1">
                An ad is a Page post, so Meta rejects a creative without one. Find it under the
                Page&rsquo;s About &rsquo; Page transparency.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Landing page URL
              </label>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com/book"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-xs text-slate-500 mt-1">
                Where the ad&rsquo;s button sends people. Prefilled on every publish, and editable
                there.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Pixel ID <span className="font-normal text-slate-400">optional</span>
              </label>
              <input
                type="text"
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                placeholder="e.g. 998877665544332"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-xs text-slate-500 mt-1">
                Only needed to optimise for leads — Meta has to know which conversion event to
                chase. Traffic campaigns ignore it.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 md:flex-none px-4 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 md:flex-none px-4 bg-slate-200 text-slate-900 py-2.5 rounded-lg font-medium hover:bg-slate-300 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : client.meta_ad_account_id ? (
        <div>
          {accountName && <p className="font-medium text-slate-900">{accountName}</p>}
          <p className="font-mono text-xs text-slate-500">{client.meta_ad_account_id}</p>
          <p className="text-xs text-slate-500 mt-1">
            {lastSynced
              ? `Last synced week of ${lastSynced.week_of} — $${lastSynced.ad_spend.toFixed(2)}, ${lastSynced.leads} leads`
              : 'Connected. Meta spend and leads will fill in on the next weekly run.'}
          </p>
          <p className="text-xs mt-1">
            {client.meta_page_id ? (
              <span className="text-slate-500">
                Page {client.meta_page_id}
                {client.website_url ? ` → ${client.website_url}` : ' — no landing page set'}
              </span>
            ) : (
              <span className="text-amber-700">
                No Page ID, so the Ad Studio cannot publish to this account yet.
              </span>
            )}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Not connected. Add this client's Meta ad account ID to pull their spend and leads in
          automatically each week instead of logging them by hand.
        </p>
      )}
    </div>
  )
}
