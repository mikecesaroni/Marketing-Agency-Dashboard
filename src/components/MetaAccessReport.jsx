import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { readFunctionError } from '../lib/functionError'
import { accessReport, chaseLine, describeTask } from '../lib/metaAccess'
import { copyText } from '../lib/intakeSummary'
import { Badge, Button, Card } from '../components/ui'

// What each client actually granted on Meta, read back from Meta.
//
// Behind a button rather than loaded with the page: it is two paged Graph calls
// against the whole business, it is only interesting after somebody has been
// asked for access, and the ad account rate limit is shared across every client
// -- so it should cost nothing on a page load that did not ask for it.

const STATE_LABEL = {
  ok: { text: 'granted', tone: 'success' },
  partial: { text: 'partial', tone: 'warning' },
  missing: { text: 'not granted', tone: 'danger' },
  not_connected: { text: 'not connected', tone: 'neutral' },
}

function AssetCell({ label, verdict }) {
  const state = STATE_LABEL[verdict.state] || STATE_LABEL.not_connected

  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={state.tone}>{state.text}</Badge>
        {verdict.state === 'ok' && !verdict.full && (
          <span className="text-[11px] text-slate-500">no full control</span>
        )}
      </div>
      {verdict.state === 'partial' && (
        <p className="mt-0.5 text-[11px] text-amber-800">
          cannot {verdict.lacking.map(describeTask).join(' or ')}
        </p>
      )}
      {verdict.state === 'missing' && (
        <p className="mt-0.5 text-[11px] text-red-700">
          the CRM names one, Meta does not list it
        </p>
      )}
    </div>
  )
}

export default function MetaAccessReport() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const run = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabase.functions.invoke('meta-access-check', {
        body: {},
      })
      if (err) {
        const { status, detail } = await readFunctionError(err)
        if (!status) {
          throw new Error(
            'Could not reach the access check. Deploy meta-access-check in Supabase and try again.'
          )
        }
        throw new Error(detail || 'The access check failed.')
      }
      if (data?.error) throw new Error(data.error)

      setReport(
        accessReport({
          clients: data.clients,
          pages: data.pages,
          adAccounts: data.ad_accounts,
        })
      )
    } catch (err) {
      setError(err.message)
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  // Every gap as forwardable sentences. The point of the whole check is chasing
  // one named thing instead of asking somebody to redo the sharing flow, and
  // that only helps if the sentence can be pasted straight into a text.
  const copyChases = async () => {
    const lines = report.clients.map(chaseLine).filter(Boolean)
    const ok = await copyText(lines.join('\n'))
    setCopied(ok ? 'ok' : 'fail')
    setTimeout(() => setCopied(''), 2000)
  }

  const attention = report?.clients.filter((r) => r.needsAttention) || []

  return (
    <Card padding="lg" className="mb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900">What did they actually grant?</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            Reads the permission level back from Meta, per client. Catches the two failures you
            cannot see from inside the CRM: an asset shared at reporting level only, and access
            that was never granted or has since been revoked.
          </p>
        </div>
        <Button onClick={run} disabled={loading} className="flex-shrink-0">
          {loading ? 'Checking Meta…' : report ? 'Check again' : 'Check access'}
        </Button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {report && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {report.summary.attention === 0 ? (
              <Badge tone="success">
                All {report.summary.clients} clients have everything they have connected
              </Badge>
            ) : (
              <>
                <Badge tone="danger">{report.summary.attention} need attention</Badge>
                {report.summary.partial > 0 && (
                  <Badge tone="warning">{report.summary.partial} granted at too low a level</Badge>
                )}
                {report.summary.missing > 0 && (
                  <Badge tone="danger">{report.summary.missing} not granted or revoked</Badge>
                )}
                <Button variant="outline" size="sm" onClick={copyChases}>
                  {copied === 'ok' ? '✓ Copied' : 'Copy what to chase'}
                </Button>
              </>
            )}
          </div>

          {attention.length > 0 && (
            <div className="space-y-2">
              {attention.map((row) => (
                <div
                  key={row.clientId}
                  className="rounded-lg border border-amber-200 bg-amber-50/60 p-3"
                >
                  <Link
                    to={`/client/${row.clientId}`}
                    className="font-medium text-slate-900 hover:text-blue-600"
                  >
                    {row.clientName}
                  </Link>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <AssetCell label="Ad account" verdict={row.adAccount} />
                    <AssetCell label="Facebook Page" verdict={row.page} />
                  </div>
                  <p className="mt-2 border-t border-amber-200 pt-2 text-[11px] text-amber-900">
                    {chaseLine(row)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Granted and doing nothing. From inside the CRM this is
              indistinguishable from a client who never replied, which is why it
              is worth its own list rather than silence. */}
          {(report.unclaimedPages.length > 0 || report.unclaimedAdAccounts.length > 0) && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Granted to us, not connected to any client
              </p>
              <div className="space-y-1">
                {[
                  ...report.unclaimedAdAccounts.map((a) => ({ ...a, kind: 'Ad account' })),
                  ...report.unclaimedPages.map((p) => ({ ...p, kind: 'Page' })),
                ].map((asset) => (
                  <div
                    key={`${asset.kind}-${asset.id}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {asset.kind}
                    </span>
                    <span className="min-w-0 truncate text-slate-900">
                      {asset.name || asset.id}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">{asset.id}</span>
                    {asset.level.state === 'partial' && (
                      <Badge tone="warning" className="ml-auto">
                        only {asset.level.tasks.map(describeTask).join(', ')}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Connect these on the client&rsquo;s page. Anything marked partial will need raising
                before it can be published from — worth knowing before you wire it up.
              </p>
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            A client with nothing connected yet is not listed as a problem — there is nothing to
            check until an asset is wired up.
          </p>
        </div>
      )}
    </Card>
  )
}
