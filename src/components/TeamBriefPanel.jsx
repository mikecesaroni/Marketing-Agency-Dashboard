import { useEffect, useState } from 'react'
import Modal from './Modal'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../lib/access'
import { briefEmails, briefStatus, previewBrief, runAlerts, sendBrief, setBriefEmails, setSlackWebhook, slackConnected, testSlack } from '../lib/teamBriefClient'
import { Badge, Button, Card } from './ui'

/**
 * THE TEAM BRIEF AND THE SLACK CHANNEL. Where the morning brief and the
 * alerts go, whether they are connected, a preview of today's brief, a
 * send-now, and the last few sends. The function behind it is
 * supabase/functions/team-digest (docs/weekly-status.md).
 *
 * Kept short on purpose, like the brief itself: three lines say what gets
 * posted and when; the rest is the two connections and the buttons.
 */

const STATUS_TONE = { sent: 'success', ready: 'warning', failed: 'danger', skipped: 'dim' }

export default function TeamBriefPanel() {
  const { role } = useAuth()
  const admin = isAdmin(role)
  const [status, setStatus] = useState(null)
  const [slack, setSlack] = useState(null)
  const [emails, setEmails] = useState('')
  const [editingEmails, setEditingEmails] = useState(false)
  const [webhook, setWebhook] = useState('')
  const [editingSlack, setEditingSlack] = useState(false)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewTab, setPreviewTab] = useState('text')

  const load = () =>
    Promise.all([briefStatus().catch((err) => ({ error: err.message })), slackConnected(), briefEmails()]).then(([s, connected, list]) => {
      setStatus(s)
      setSlack(connected)
      setEmails(list)
    })

  useEffect(() => {
    load()
  }, [])

  const act = async (what, fn, done) => {
    setBusy(what)
    setError('')
    setNote('')
    try {
      const out = await fn()
      if (done) setNote(done(out))
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const saveSlack = () =>
    act('slack', () => setSlackWebhook(webhook), (ok) => (ok ? 'Slack connected. Send a test to see it land.' : 'Slack disconnected.')).then(() => {
      setWebhook('')
      setEditingSlack(false)
    })

  const saveEmails = () =>
    act('emails', () => setBriefEmails(emails), () => (emails.trim() ? 'Email list saved.' : 'Email off: the brief goes to Slack only.')).then(() => setEditingEmails(false))

  const log = status?.log || []

  return (
    <Card className="mt-6 space-y-4" data-team-brief>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Team brief and alerts</h3>
          <p className="text-xs text-slate-600">
            One short message every morning at 7am Eastern, weekends too: what needs attention, clips to publish, who is running clean, who is onboarding. Mondays carry the weekly status.
          </p>
          <p className="text-xs text-slate-600">
            Between briefs the channel hears only what cannot wait: an ad account disabled, ads gone quiet, a new edit dropped in, ten days without an ad. Once each, with one line when the ads are back. Nothing from 9pm to 7am.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy !== ''} onClick={() => act('preview', () => previewBrief(), () => '').then(() => {})} data-brief-preview>
            {busy === 'preview' ? 'Building…' : "Preview today's brief"}
          </Button>
          <Button variant="primary" size="sm" disabled={busy !== '' || (!slack && !emails.trim())} onClick={() => act('send', sendBrief, (r) => `Brief ${r.status === 'sent' ? 'sent' : r.status}: Slack ${r.slack}, email ${r.email}.${r.reason ? ` ${r.reason}` : ''}`)} data-brief-send>
            {busy === 'send' ? 'Sending…' : 'Send now'}
          </Button>
        </div>
      </div>

      {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {note && <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800" data-brief-note>{note}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3" data-slack-card>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">Slack channel</p>
            {slack === null ? <Badge tone="dim">…</Badge> : slack ? <Badge tone="success">Connected</Badge> : <Badge tone="warning">Not connected</Badge>}
          </div>
          {!editingSlack ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {slack && (
                <Button variant="outline" size="sm" disabled={busy !== ''} onClick={() => act('test', testSlack, () => 'Posted a hello to the channel.')} data-slack-test>
                  {busy === 'test' ? 'Posting…' : 'Send a test'}
                </Button>
              )}
              {admin ? (
                <Button variant="outline" size="sm" onClick={() => setEditingSlack(true)} data-slack-edit>
                  {slack ? 'Change the channel' : 'Connect Slack'}
                </Button>
              ) : (
                <p className="text-xs text-slate-500">An admin connects the channel.</p>
              )}
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-600">
                In Slack: <span className="font-medium">api.slack.com/apps</span>, create an app (or open ours), <span className="font-medium">Incoming Webhooks</span>, switch it on, <span className="font-medium">Add New Webhook to Workspace</span>, pick the channel, copy the URL.
              </p>
              <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://hooks.slack.com/services/…" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" data-slack-url />
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" disabled={busy !== '' || !webhook.trim()} onClick={saveSlack} data-slack-save>
                  Save
                </Button>
                {slack && (
                  <Button variant="outline" size="sm" disabled={busy !== ''} onClick={() => act('slack', () => setSlackWebhook(''), () => 'Slack disconnected.').then(() => setEditingSlack(false))} data-slack-clear>
                    Disconnect
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setEditingSlack(false)}>
                  Cancel
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">The URL is kept in the database vault, not in a table the CRM reads.</p>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 p-3" data-email-card>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">Email, optional</p>
            {status === null ? <Badge tone="dim">…</Badge> : !emails.trim() ? <Badge tone="dim">Off</Badge> : status.email ? <Badge tone="success">On</Badge> : <Badge tone="warning">Needs setup</Badge>}
          </div>
          {!editingEmails ? (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-slate-600">{emails.trim() ? `Goes to ${emails}` : 'Slack only. Add addresses to get the same brief by email too.'}</p>
              {emails.trim() && status && !status.email && <p className="text-[11px] text-amber-700">Needs RESEND_API_KEY and REPORT_FROM in Supabase (the same two the client reports use).</p>}
              <Button variant="outline" size="sm" onClick={() => setEditingEmails(true)} data-emails-edit>
                {emails.trim() ? 'Change' : 'Add addresses'}
              </Button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="you@agency.com, them@agency.com" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" data-emails-input />
              <div className="flex gap-2">
                <Button variant="primary" size="sm" disabled={busy !== ''} onClick={saveEmails} data-emails-save>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingEmails(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <Button variant="outline" size="sm" disabled={busy !== '' || !slack} onClick={() => act('alerts', () => runAlerts(), (r) => `Checked: ${r.fresh} new, ${r.cleared} cleared${r.posted ? ', posted' : r.fresh + r.cleared ? ', not posted' : ''}.${r.error ? ` ${r.error}` : ''}`)} data-alerts-run>
          {busy === 'alerts' ? 'Checking…' : 'Check alerts now'}
        </Button>
        <span>Runs on its own every 15 minutes. Posts only when something is new.</span>
      </div>

      {log.length > 0 && (
        <div data-brief-log>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recent</p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
            {log.slice(0, 6).map((l, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums text-slate-500">{l.day}</span>
                <span className="text-slate-500">{l.kind}</span>
                <Badge tone={STATUS_TONE[l.status] || 'neutral'}>{l.status}</Badge>
                <span className="truncate">{l.subject}</span>
                {l.reason && <span className="text-slate-500">{l.reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal isOpen={Boolean(preview) || busy === 'preview'} onClose={() => setPreview(null)} title={preview?.subject || 'Building the brief…'} wide>
        {preview && (
          <div className="space-y-3" data-brief-preview-body>
            <div className="flex gap-2 text-xs">
              {[
                ['text', 'Slack / text'],
                ['html', 'Email'],
              ].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setPreviewTab(k)} className={`rounded px-2 py-1 ${previewTab === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {label}
                </button>
              ))}
            </div>
            {previewTab === 'text' ? <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-800">{preview.text}</pre> : <iframe title="Email" srcDoc={preview.html} className="h-[60vh] w-full rounded border border-slate-200 bg-white" />}
          </div>
        )}
      </Modal>
      <PreviewLoader busy={busy} setPreview={setPreview} />
    </Card>
  )
}

/**
 * The preview lands in state once the call returns. Split out so the act()
 * wrapper above stays one shape: it reports a note, this one keeps the body.
 */
function PreviewLoader({ busy, setPreview }) {
  useEffect(() => {
    if (busy !== 'preview') return
    let cancelled = false
    previewBrief()
      .then((p) => !cancelled && setPreview(p))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [busy, setPreview])
  return null
}
