import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { copyText } from '../lib/intakeSummary'
import { fetchWeeklyReports, previewWeeklyReport, reportLink, reportWeek, runWeeklyReports, setReportEmail, setWeeklyReportEnabled, validEmail, weekFrom } from '../lib/weeklyReport'
import Modal from './Modal'

// The weekly client reports: who gets one, where it goes, what went out.
//
// Reports build themselves every Monday morning. This panel is where the
// team checks the list before then (preview any client's email), fixes an
// address, switches a client off, sends one by hand, or copies the web link
// when email is not set up yet. The log underneath is what actually
// happened, with reasons.

const STATUS = {
  sent: { label: 'Sent', cls: 'bg-emerald-100 text-emerald-800' },
  ready: { label: 'Built, not emailed', cls: 'bg-amber-100 text-amber-800' },
  skipped: { label: 'Skipped', cls: 'bg-slate-100 text-slate-600' },
  failed: { label: 'Failed', cls: 'bg-red-100 text-red-800' },
}

const EMAIL_HELP = 'Email sending is not set up yet. Add RESEND_API_KEY and REPORT_FROM in Supabase (Edge Functions, Secrets) and reports go out on their own every Monday. Until then they are still built every Monday and you can copy each client’s link here.'

export default function WeeklyReportsPanel() {
  const [clients, setClients] = useState(null)
  const [log, setLog] = useState([])
  const [week, setWeek] = useState(() => reportWeek())
  const [emailSetUp, setEmailSetUp] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState(null)
  const [editing, setEditing] = useState('')
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState('')

  const load = async () => {
    try {
      const [{ data: rows, error: cErr }, logRows] = await Promise.all([
        supabase
          .from('clients')
          .select('id,name,archived,is_internal,paused_at,report_email,weekly_report_enabled,meta_ad_account_id,google_ads_customer_id,onboarding_intake(contact_email)')
          .eq('archived', false)
          .order('name'),
        fetchWeeklyReports(week.from),
      ])
      if (cErr) throw cErr
      setClients((rows || []).filter((c) => !c.is_internal && (c.meta_ad_account_id || c.google_ads_customer_id)))
      setLog(logRows)
      setError('')
    } catch (err) {
      setError(err.message)
      setClients([])
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week.from])

  const logBy = useMemo(() => Object.fromEntries(log.map((r) => [r.client_id, r])), [log])

  const emailFor = (c) => c.report_email || (Array.isArray(c.onboarding_intake) ? c.onboarding_intake[0]?.contact_email : c.onboarding_intake?.contact_email) || ''

  const saveEmail = async (c) => {
    const v = draft.trim()
    if (v && !validEmail(v)) {
      setError(`That does not look like an email address: ${v}`)
      return
    }
    setBusy(`email:${c.id}`)
    setError('')
    try {
      await setReportEmail(c.id, v)
      setEditing('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const toggle = async (c) => {
    setBusy(`toggle:${c.id}`)
    try {
      await setWeeklyReportEnabled(c.id, !(c.weekly_report_enabled !== false))
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const openPreview = async (c) => {
    setBusy(`preview:${c.id}`)
    setError('')
    try {
      const p = await previewWeeklyReport(c.id, week.from)
      setEmailSetUp(Boolean(p.email_set_up))
      setPreview({ ...p, clientId: c.id })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const sendOne = async (c) => {
    setBusy(`send:${c.id}`)
    setError('')
    setNote('')
    try {
      const r = await runWeeklyReports({ clientId: c.id, weekStart: week.from, resend: true })
      setEmailSetUp(Boolean(r.email_set_up))
      const first = r.results?.[0]
      if (first?.status === 'sent') setNote(`Sent to ${first.recipient}.`)
      else if (first?.status === 'ready') setNote(`Built for ${c.name}. ${EMAIL_HELP}`)
      else setNote(`${c.name}: ${first?.status || 'nothing'}${first?.reason ? `, ${first.reason}` : ''}.`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const runAll = async () => {
    setBusy('all')
    setError('')
    setNote('')
    try {
      const r = await runWeeklyReports({ weekStart: week.from })
      setEmailSetUp(Boolean(r.email_set_up))
      setNote(`${r.sent} sent, ${r.ready} built but not emailed, ${r.skipped} skipped, ${r.failed} failed.${r.email_set_up ? '' : ` ${EMAIL_HELP}`}`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const copy = async (key, text) => {
    await copyText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 1500)
  }

  const shiftWeek = (n) => {
    const d = new Date(`${week.from}T12:00:00`)
    d.setDate(d.getDate() + n * 7)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setWeek(weekFrom(iso))
  }

  if (clients === null) return null

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4" data-weekly-reports>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-white">Weekly client reports</h3>
          <p className="text-xs text-slate-400">
            Every Monday morning, each client with ad spend gets last week in plain words: spend, leads, impressions, click rate, cost per lead, and why the return on the leads matters most.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button type="button" onClick={() => shiftWeek(-1)} className="rounded border border-white/15 px-2 py-1 text-slate-300 hover:bg-white/10">
            ‹
          </button>
          <span className="text-slate-200">{week.label}</span>
          <button type="button" onClick={() => shiftWeek(1)} className="rounded border border-white/15 px-2 py-1 text-slate-300 hover:bg-white/10">
            ›
          </button>
          <button
            type="button"
            onClick={runAll}
            disabled={busy === 'all'}
            className="ml-2 rounded-lg bg-orange-600 px-3 py-1.5 font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
            title="Builds this week's report for every eligible client, and emails it when email is set up. Clients already sent this week are left alone."
          >
            {busy === 'all' ? 'Running…' : 'Run this week now'}
          </button>
        </div>
      </div>

      {emailSetUp === false && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{EMAIL_HELP}</p>
      )}
      {note && <p className="mt-3 text-xs text-emerald-300">{note}</p>}
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="py-1.5 pr-3 font-medium">Client</th>
              <th className="py-1.5 pr-3 font-medium">Goes to</th>
              <th className="py-1.5 pr-3 font-medium">Weekly</th>
              <th className="py-1.5 pr-3 font-medium">{week.label}</th>
              <th className="py-1.5 pr-3 font-medium">They told us</th>
              <th className="py-1.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const row = logBy[c.id]
              const st = row ? STATUS[row.status] || STATUS.skipped : null
              const email = emailFor(c)
              const on = c.weekly_report_enabled !== false
              return (
                <tr key={c.id} className="border-t border-white/10 align-top" data-client-row={c.name}>
                  <td className="py-2 pr-3 font-medium text-white">
                    {c.name}
                    {c.paused_at && <span className="ml-1 text-[10px] text-amber-300">paused</span>}
                  </td>
                  <td className="py-2 pr-3">
                    {editing === c.id ? (
                      <span className="flex items-center gap-1">
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEmail(c)}
                          placeholder="owner@their-company.com"
                          aria-label={`Report email for ${c.name}`}
                          className="w-52 rounded border border-white/20 bg-white/10 px-2 py-1 text-white"
                          autoFocus
                        />
                        <button type="button" onClick={() => saveEmail(c)} disabled={busy === `email:${c.id}`} className="rounded bg-white px-2 py-1 font-semibold text-slate-900">
                          Save
                        </button>
                        <button type="button" onClick={() => setEditing('')} className="text-slate-400 hover:text-white">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(c.id)
                          setDraft(email)
                        }}
                        className={`text-left hover:underline ${email && validEmail(email) ? 'text-slate-200' : 'text-amber-300'}`}
                        title={c.report_email ? 'Set on the client' : email ? 'From the onboarding form. Click to set a different address.' : 'No email on file. Click to add one.'}
                      >
                        {email || 'add an email'}
                        {email && !validEmail(email) && ' (not valid)'}
                      </button>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      onClick={() => toggle(c)}
                      disabled={busy === `toggle:${c.id}`}
                      aria-label={`${on ? 'Switch off' : 'Switch on'} weekly report for ${c.name}`}
                      className={`rounded-full px-2 py-0.5 font-medium ${on ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-slate-400'}`}
                    >
                      {on ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="py-2 pr-3">
                    {st ? (
                      <span>
                        <span className={`rounded-full px-2 py-0.5 font-medium ${st.cls}`}>{st.label}</span>
                        {row.reason && <span className="ml-1.5 text-slate-400">{row.reason}</span>}
                      </span>
                    ) : (
                      <span className="text-slate-500">not built yet</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-slate-300">
                    {row?.answered_at
                      ? `${row.jobs_booked ?? '?'} job${row.jobs_booked === 1 ? '' : 's'}${row.revenue ? `, $${Number(row.revenue).toLocaleString()}` : ''}`
                      : row?.status === 'sent'
                        ? 'no answer yet'
                        : ''}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button type="button" onClick={() => openPreview(c)} disabled={busy === `preview:${c.id}`} className="text-sky-300 hover:underline">
                      {busy === `preview:${c.id}` ? 'Building…' : 'Preview'}
                    </button>
                    <button type="button" onClick={() => sendOne(c)} disabled={busy === `send:${c.id}`} className="ml-3 text-sky-300 hover:underline" title="Builds this client's report now and emails it when email is set up">
                      {busy === `send:${c.id}` ? 'Sending…' : row?.status === 'sent' ? 'Send again' : 'Send now'}
                    </button>
                    {row?.token && (
                      <button type="button" onClick={() => copy(c.id, reportLink(row.token))} className="ml-3 text-sky-300 hover:underline" title="The web copy of this report, to send by text or Slack">
                        {copied === c.id ? 'Copied' : 'Copy link'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-slate-400">
                  No clients with a Meta or Google account yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={Boolean(preview)} onClose={() => setPreview(null)} title={preview ? `${preview.client}: ${preview.week?.label || ''}` : ''} wide>
        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-medium text-slate-900">Subject:</span> {preview.subject}
              {preview.eligible ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">would go to {preview.recipient}</span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">would be skipped: {preview.reason}</span>
              )}
              <button type="button" onClick={() => copy('text', preview.text)} className="ml-auto rounded-lg border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50">
                {copied === 'text' ? 'Copied' : 'Copy as text'}
              </button>
              {preview.url && (
                <button type="button" onClick={() => copy('url', preview.url)} className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50">
                  {copied === 'url' ? 'Copied' : 'Copy link'}
                </button>
              )}
            </div>
            <iframe title="Report preview" srcDoc={preview.html} className="h-[70vh] w-full rounded-lg border border-slate-200 bg-slate-100" />
          </div>
        )}
      </Modal>
    </div>
  )
}
