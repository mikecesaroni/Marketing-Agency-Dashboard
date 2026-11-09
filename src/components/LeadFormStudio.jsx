import { useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import AdImagePicker from './AdImagePicker'
import InstantFormPreview from './InstantFormPreview'
import { copyText } from '../lib/intakeSummary'
import { wcName } from '../lib/adNaming'
import { coverDataUrl, coverSrcFor, imageSize } from '../lib/coverImage'
import { describeForm, formToBuilder, introOf, isHigherIntent, metaFormsLibraryUrl, summariseForm } from '../lib/leadFormDetails'
import { coverShapeNote, formExtras, previewPages } from '../lib/leadFormPreview'
import {
  FORM_QUESTIONS,
  createLeadForm,
  listLeadForms,
  recommendFormQuestions,
  replaceFormQuestion,
} from '../lib/metaPublish'

/**
 * Builds a Meta instant form on the client's Page, on its own.
 *
 * WHY THIS EXISTS SEPARATELY FROM LeadFormPicker. The picker builds a form
 * mid-publish, as a convenience when you notice there isn't one. But a form
 * has to exist BEFORE the ad in practice: creating it is step one, and step
 * two is a workflow in GoHighLevel that connects to it by id, which is
 * somebody switching tabs and pasting. Making that wait on a finished ad meant
 * either publishing an ad you weren't ready to publish, or building the form
 * in Meta's own interface and losing everything the CRM knows about the
 * client.
 *
 * So the form id is the deliverable here, not the form. It is shown big, with
 * a copy button, the moment the form exists.
 *
 * THE LIVE PREVIEW (2026-11-09: "see a preview of the instant form live, add
 * a background photo on the form, pulled from Drive"). Meta has no preview to
 * embed before a form exists, so the Studio draws its own beside the builder:
 * the intro card with the cover photo, the questions with Meta's prefilled
 * answers already in, the review screen, the thank-you page, redrawn on every
 * keystroke (InstantFormPreview.jsx, leadFormPreview.js). The cover photo is
 * picked the way an ad's background is, from the client's uploads or their
 * Drive folder, and sent to Meta as a file on the create call.
 */

// Meta's own field names read like a database. These are what a person calls
// them, and the note says which ones cost nothing to ask.
const PREFILLED = new Set(FORM_QUESTIONS.map((q) => q.type))

function QuestionRow({ q, on, toggle, why }) {
  return (
    <label
      className={`flex items-start gap-2 rounded-lg border p-2 text-xs transition ${
        on ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white'
      }`}
    >
      <input type="checkbox" checked={on} onChange={toggle} className="mt-0.5 flex-shrink-0" />
      <span className="min-w-0">
        <span className="font-medium text-slate-900">{q.label}</span>
        {PREFILLED.has(q.type) && (
          // The single most useful thing to know while choosing: a prefilled
          // answer barely dents completion, a typed one does.
          <span className="ml-1.5 text-[10px] text-green-700">prefilled — nearly free</span>
        )}
        {why && <span className="mt-0.5 block text-slate-500">{why}</span>}
      </span>
    </label>
  )
}

// Splits "I own it, I rent" into options, keeping what the person typed.
function parseOptions(text) {
  return String(text || '')
    .split(/[,\n]/)
    .map((o) => o.trim())
    .filter(Boolean)
}

/**
 * A custom question: the label, its tap-to-answer options, and the why.
 *
 * Every custom question is meant to be multiple choice. Two or more options
 * make it one on the form; fewer and Meta renders a typed box, which costs
 * completions and cannot be mapped to a GoHighLevel field, so that state is
 * shown in amber rather than allowed to pass quietly.
 */
function CustomRow({ c, onOptions, replacing, reason, onReason, onUntick, onAsk, onDrop, onCancel, busy }) {
  const choice = (c.options || []).length >= 2
  return (
    <div className="rounded-lg border border-orange-300 bg-orange-50 p-2 text-xs">
      <div className="flex items-start gap-2">
        {/* Unticking asks for a better question rather than just deleting one.
            The reason is the whole value: it is the thing the onboarding form
            never captured, and without it a second try is another guess. */}
        <input
          type="checkbox"
          checked={!replacing}
          onChange={replacing ? onCancel : onUntick}
          className="mt-0.5 flex-shrink-0"
          title={replacing ? 'Keep it after all' : 'Do not want this one'}
        />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-slate-900">{c.label}</span>
          {choice ? (
            <span className="ml-1.5 text-[10px] text-green-700">multiple choice — one tap</span>
          ) : (
            <span className="ml-1.5 text-[10px] text-amber-700">
              typed — costs completions. Add at least two options to make it a tap.
            </span>
          )}
          {c.why && <span className="mt-0.5 block text-slate-500">{c.why}</span>}
          {choice && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {c.options.map((o, i) => (
                <span key={`${o}-${i}`} className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-800">
                  {o}
                </span>
              ))}
            </div>
          )}
          <input
            defaultValue={(c.options || []).join(', ')}
            onBlur={(e) => onOptions(parseOptions(e.target.value))}
            placeholder="Options, comma separated — e.g. I own it, I rent"
            className="mt-1.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
          />

          {replacing && (
            <div className="mt-2 rounded-lg border border-slate-300 bg-white p-2">
              <p className="text-[11px] font-medium text-slate-700">What is wrong with it?</p>
              <input
                autoFocus
                value={reason}
                onChange={(e) => onReason(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && onAsk()}
                placeholder="e.g. the dispatcher already asks that on the call"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-[11px]"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onAsk}
                  disabled={busy}
                  className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {busy ? 'Thinking…' : 'Ask for a better one'}
                </button>
                <button type="button" onClick={onDrop} disabled={busy} className="text-[11px] text-slate-500 underline hover:text-slate-800">
                  Just remove it
                </button>
                <button type="button" onClick={onCancel} disabled={busy} className="text-[11px] text-slate-400 hover:text-slate-700">
                  Keep it
                </button>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                It reads the same onboarding answers and chat as before, plus your reason and the questions already on the form.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The forms already on the Page, first and clickable.
 *
 * A form's name and id say nothing about what it asks, and the question that
 * actually comes up is "which of these is the one with the ZIP on it?" Each
 * row opens to the questions Meta says are on it, the intro card, the
 * thank-you text, the privacy URL and whether the review screen is on. From
 * there: copy the id for GoHighLevel, open Meta's forms library (edit,
 * preview, download leads), or start a new form from this one's questions.
 */
function ExistingForms({ forms, pageId, copied, onCopy, onStartFrom }) {
  const [open, setOpen] = useState(null)
  const library = metaFormsLibraryUrl(pageId)

  if (forms === null) return <p className="text-xs text-slate-500">Reading the Page…</p>
  if (forms.length === 0) return <p className="text-xs text-slate-500">None yet. The first one is built below.</p>

  return (
    <ul className="space-y-1.5">
      {forms.map((f) => {
        const isOpen = open === f.id
        const questions = describeForm(f)
        const intro = introOf(f)
        const leads = Number(f.leads_count) || 0
        const made = f.created_time ? new Date(f.created_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
        return (
          <li key={f.id} className={`rounded-lg border ${isOpen ? 'border-orange-300 bg-orange-50/40' : 'border-slate-200 bg-white'}`}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : f.id)}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-left text-xs hover:bg-slate-50"
              aria-expanded={isOpen}
            >
              <span className="text-slate-400">{isOpen ? '▾' : '▸'}</span>
              <span className="font-medium text-slate-900">{f.name}</span>
              <span className="text-slate-500">
                {leads} lead{leads === 1 ? '' : 's'}
              </span>
              <span className="text-slate-400">{summariseForm(f)}</span>
              {f.status && f.status !== 'ACTIVE' && <span className="text-amber-700">{f.status}</span>}
              {made && <span className="ml-auto text-[11px] text-slate-400">made {made}</span>}
            </button>

            {isOpen && (
              <div className="space-y-2.5 border-t border-slate-200 px-3 py-2.5 text-xs">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">What it asks</p>
                  {questions.length === 0 ? (
                    <p className="mt-1 text-slate-500">Meta did not return the questions for this form.</p>
                  ) : (
                    <ol className="mt-1 space-y-1">
                      {questions.map((q, i) => (
                        <li key={`${q.type}-${i}`} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          <span className="text-slate-400">{i + 1}.</span>
                          <span className="font-medium text-slate-900">{q.label}</span>
                          {q.prefilled ? (
                            <span className="text-[10px] text-green-700">prefilled</span>
                          ) : q.options.length >= 2 ? (
                            <span className="text-[10px] text-green-700">multiple choice</span>
                          ) : (
                            <span className="text-[10px] text-amber-700">typed</span>
                          )}
                          {q.options.length > 0 && (
                            <span className="flex flex-wrap gap-1">
                              {q.options.map((o) => (
                                <span key={o} className="rounded-full border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-700">
                                  {o}
                                </span>
                              ))}
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                  {(intro.title || intro.lines.length > 0) && (
                    <>
                      <dt className="text-slate-500">Intro card</dt>
                      <dd className="text-slate-800" data-form-intro>
                        {intro.title && <span className="font-medium">{intro.title}</span>}
                        {intro.lines.length > 0 && <span className="text-slate-600">{intro.title ? ' · ' : ''}{intro.lines.join(' · ')}</span>}
                      </dd>
                    </>
                  )}
                  {f.question_page_custom_headline && (
                    <>
                      <dt className="text-slate-500">Over the questions</dt>
                      <dd className="text-slate-800">{f.question_page_custom_headline}</dd>
                    </>
                  )}
                  <dt className="text-slate-500">Review screen</dt>
                  <dd className="text-slate-800">{isHigherIntent(f) ? 'On (Higher Intent)' : 'Off (More Volume)'}</dd>
                  {f.thank_you_page && (f.thank_you_page.body || f.thank_you_page.title) && (
                    <>
                      <dt className="text-slate-500">After submitting</dt>
                      <dd className="text-slate-800">{f.thank_you_page.body || f.thank_you_page.title}</dd>
                    </>
                  )}
                  {f.privacy_policy_url && (
                    <>
                      <dt className="text-slate-500">Privacy policy</dt>
                      <dd className="break-all text-slate-800">{f.privacy_policy_url}</dd>
                    </>
                  )}
                  <dt className="text-slate-500">Form ID</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">{f.id}</code>
                    <button type="button" onClick={() => onCopy(f.id, f.id)} className="text-slate-500 underline hover:text-slate-800">
                      {copied === f.id ? 'Copied' : 'Copy ID'}
                    </button>
                  </dd>
                </dl>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {library && (
                    <a href={library} target="_blank" rel="noreferrer" className="text-blue-600 underline hover:text-blue-800">
                      Open in Meta&rsquo;s forms library ↗
                    </a>
                  )}
                  <button type="button" onClick={() => onStartFrom(f)} className="text-blue-600 underline hover:text-blue-800">
                    Start a new form from this one
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Meta does not let a form change once it has leads, so edits mean a new form. The library is
                  where to see the real thing as a person sees it and download the leads it already holds.
                </p>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default function LeadFormStudio({ client, files = [], driveFolderId = '', onFolderSaved, onUpload, onRefresh }) {
  const [forms, setForms] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [copied, setCopied] = useState('')

  // Every form the CRM makes is named WC_..., like the ads, so ours stand
  // out from the client's own in Meta ("make so when we make lead instant
  // form its name is starting with WC_"). The prefix is put on wherever a
  // name comes from (typed, suggested, copied from an old form) and once
  // more when the form is created, so it cannot be lost.
  const [formName, setFormName] = useState(wcName(`${client.name} — enquiries`))
  // Standard fields ticked, by type. Custom questions are their own list
  // because each carries a label the standard ones do not.
  const [picked, setPicked] = useState(['FULL_NAME', 'PHONE', 'EMAIL', 'ZIP'])
  const [customs, setCustoms] = useState([])
  const [newCustom, setNewCustom] = useState('')
  const [newOptions, setNewOptions] = useState('')
  const [privacyUrl, setPrivacyUrl] = useState(client.privacy_policy_url || '')
  const [higherIntent, setHigherIntent] = useState(true)
  const [thankYou, setThankYou] = useState(
    'Thanks — we have your details and will call you shortly.'
  )
  // The intro card (Meta's context card) and the headline over the
  // questions, both optional; and the cover photo, picked like an ad's
  // background: an upload's path or drive:<id>.
  const [introTitle, setIntroTitle] = useState('')
  const [introText, setIntroText] = useState('')
  const [introButton, setIntroButton] = useState('')
  const [headline, setHeadline] = useState('')
  const [coverPath, setCoverPath] = useState('')
  const [coverSrc, setCoverSrc] = useState('')
  const [coverNote, setCoverNote] = useState('')
  const [coverRefused, setCoverRefused] = useState('')
  const [previewPage, setPreviewPage] = useState(null)
  const [why, setWhy] = useState({})
  const [note, setNote] = useState('')
  const [made, setMade] = useState(null)

  const load = () =>
    listLeadForms(client.id)
      .then((found) => {
        setForms(found)
        setError('')
      })
      .catch((err) => {
        setError(err.message)
        setForms([])
      })

  useEffect(() => {
    load()
  }, [client.id])

  // The cover as something the preview can show (a public URL, or the Drive
  // bytes as a blob: URL), and a word about its shape.
  useEffect(() => {
    let alive = true
    setCoverNote('')
    setCoverRefused('')
    if (!coverPath) {
      setCoverSrc('')
      return undefined
    }
    coverSrcFor(client.id, coverPath)
      .then(async (src) => {
        if (!alive) return
        setCoverSrc(src)
        // The cover lives on the intro page, so the phone turns to it.
        setPreviewPage('intro')
        try {
          const { width, height } = await imageSize(src)
          if (alive) setCoverNote(coverShapeNote(width, height))
        } catch {
          /* the shape note is a nicety */
        }
      })
      .catch((err) => {
        if (!alive) return
        setCoverSrc('')
        setError(err.message)
      })
    return () => {
      alive = false
    }
  }, [client.id, coverPath])

  const copy = async (key, text) => {
    const ok = await copyText(text)
    setCopied(ok ? key : '')
    setTimeout(() => setCopied(''), 2000)
  }

  /**
   * Asks Claude what to put on the form.
   *
   * It reads the onboarding answers and the latest chat itself, server-side,
   * so this only sends a client id. The reply is applied straight into the
   * ticks and boxes rather than offered as a suggestion to accept: everything
   * it sets is visible and editable right here, and a form nobody adjusts is
   * the normal case. The intro card and the headline come with it.
   */
  const recommend = async () => {
    setBusy('recommend')
    setError('')
    try {
      const out = await recommendFormQuestions(client.id)
      const standard = out.questions.filter((q) => q.type !== 'CUSTOM')
      const typed = out.questions.filter((q) => q.type === 'CUSTOM')

      setPicked(standard.map((q) => q.type))
      setCustoms(typed.map((q) => ({ label: q.label, why: q.why, options: q.options || [] })))
      setWhy(Object.fromEntries(out.questions.map((q) => [q.type === 'CUSTOM' ? q.label : q.type, q.why])))
      if (out.formName) setFormName(wcName(out.formName))
      if (out.thankYou) setThankYou(out.thankYou)
      if (out.headline) setHeadline(out.headline)
      if (out.introTitle) setIntroTitle(out.introTitle)
      if (out.introLines?.length) setIntroText(out.introLines.join('\n'))
      setNote(
        out.usedChat
          ? out.note
          : `${out.note} (No chat for ${client.name} yet, so this is from the onboarding form only.)`
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const toggle = (type) =>
    setPicked((cur) => (cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type]))

  // SWAPPING A RECOMMENDED QUESTION. Unticking one opens a reason box instead
  // of deleting it, because the reason is the thing the intake never captured
  // and the only way the second try beats the first.
  const [swap, setSwap] = useState(null) // { index, reason }
  const askReplacement = async () => {
    if (!swap) return
    const target = customs[swap.index]
    if (!target) return setSwap(null)
    setBusy('replace')
    setError('')
    try {
      const keep = [
        ...picked.map((t) => ({ type: t, label: FORM_QUESTIONS.find((q) => q.type === t)?.label || t })),
        ...customs.filter((_, i) => i !== swap.index).map((c) => ({ type: 'CUSTOM', label: c.label })),
      ]
      const { question, note: why } = await replaceFormQuestion({
        clientId: client.id,
        question: { type: 'CUSTOM', label: target.label },
        reason: swap.reason.trim(),
        keep,
      })
      if (question.type === 'CUSTOM') {
        setCustoms((cur) => cur.map((c, i) => (i === swap.index ? { label: question.label, why: question.why, options: question.options || [] } : c)))
      } else {
        // It answered with a prefilled field instead, which is often the right
        // call: tick that and drop the custom question entirely.
        setCustoms((cur) => cur.filter((_, i) => i !== swap.index))
        setPicked((cur) => (cur.includes(question.type) ? cur : [...cur, question.type]))
      }
      setNote(why || `Swapped out "${target.label}".`)
      setSwap(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  // Loads an existing form's questions into the builder. Meta forms cannot be
  // edited once they hold leads, so "change the ZIP question" is really "make
  // the same form again with that one difference", and this saves retyping it.
  // The intro card and the headline come across; the cover photo does not
  // (Meta does not hand it back), so pick it again.
  const startFrom = (f) => {
    const b = formToBuilder(f)
    setFormName(wcName(b.formName))
    setPicked(b.picked)
    setCustoms(b.customs)
    setWhy({})
    if (b.thankYou) setThankYou(b.thankYou)
    if (b.privacyUrl) setPrivacyUrl(b.privacyUrl)
    setHigherIntent(b.higherIntent)
    setHeadline(b.headline || '')
    setIntroTitle(b.introTitle || '')
    setIntroText(b.introText || '')
    setIntroButton(b.introButton || '')
    setMade(null)
    setNote(`Loaded the questions from "${f.name}". Change what you need and create it as a new form.${coverPath ? '' : ' Pick a cover photo if it should have one.'}`)
  }

  const build = async ({ withoutCover = false } = {}) => {
    setBusy('build')
    setError('')
    setCoverRefused('')
    try {
      const questions = [
        ...picked.map((type) => ({ type })),
        ...customs.map((c) => ({ type: 'CUSTOM', label: c.label, options: c.options || [] })),
      ]
      const name = wcName(formName.trim())
      const extras = formExtras({ headline, introTitle, introText, introButton })
      // The cover goes as one JPEG no wider than 1200px, whatever was picked.
      let coverImage
      if (coverPath && coverSrc && !withoutCover) {
        setBusy('cover')
        coverImage = await coverDataUrl(coverSrc)
        setBusy('build')
      }
      const out = await createLeadForm({
        clientId: client.id,
        formName: name,
        questions,
        privacyPolicyUrl: privacyUrl.trim() || undefined,
        thankYouMessage: thankYou.trim() || undefined,
        higherIntent,
        headline: extras.headline,
        intro: extras.intro,
        coverImage,
      })
      setMade({ id: out.form_id, name: out.name || name, withCover: Boolean(out.with_cover) })
      await load()
    } catch (err) {
      if (err.coverRefused) setCoverRefused(err.message)
      else setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const total = picked.length + customs.length

  // The preview, redrawn from the builder on every change.
  const pages = useMemo(
    () =>
      previewPages({
        pageName: client.name,
        headline,
        introTitle,
        introText,
        introButton,
        picked,
        customs,
        higherIntent,
        thankYou,
        privacyUrl,
        market: client.market,
        hasCover: Boolean(coverSrc),
        websiteUrl: client.website_url,
      }),
    [client.name, client.market, client.website_url, headline, introTitle, introText, introButton, picked, customs, higherIntent, thankYou, privacyUrl, coverSrc]
  )

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">Instant form</p>
        <p className="mt-0.5 text-xs text-slate-600">
          Built on {client.name}&rsquo;s Facebook Page, without publishing anything. Make it here
          first, wire the GoHighLevel workflow to the id, then attach it to an ad when you are
          ready. The phone on the right shows the form as you build it.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* FIRST, because the answer to "do they already have a form?" decides
          whether anything below is needed. Click a form to see what it asks. */}
      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">
            Forms already on the Page
            {forms && forms.length > 0 && <span className="ml-1.5 font-normal text-slate-400">{forms.length}</span>}
          </p>
          {forms && forms.length > 0 && (
            <p className="text-[11px] text-slate-500">Click one to see what it asks. Reuse beats a fifth near-identical form: a form owns its leads.</p>
          )}
        </div>
        <ExistingForms forms={forms} pageId={client.meta_page_id} copied={copied} onCopy={copy} onStartFrom={startFrom} />
      </div>

      {/* SAID UP FRONT, because Meta refuses every form without one and no
          client here has one on file. Learning that after choosing the
          questions and pressing Create is the version of this that wastes a
          minute every time. */}
      {!client.privacy_policy_url && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          Meta will not accept a form without a privacy policy URL, and{' '}
          {client.name} has none saved. Put one in the box below — it is kept
          with the form, not with the client, unless you add it to their Meta card.
        </div>
      )}

      {/* THE DELIVERABLE. A new form's id is what GHL needs, and hunting for it
          in Meta's interface afterwards is the step this whole panel exists to
          remove. */}
      {made && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-xs font-semibold text-green-900">
            &ldquo;{made.name}&rdquo; is live on the Page{made.withCover ? ', cover photo and all' : ''}.
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <code className="rounded border border-green-300 bg-white px-2 py-1 font-mono text-sm text-slate-900">
              {made.id}
            </code>
            <Button size="sm" variant="outline" onClick={() => copy('made', made.id)}>
              {copied === 'made' ? 'Copied' : 'Copy form ID'}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-green-800">
            Paste that into the GoHighLevel workflow trigger so leads land in the pipeline. Leads
            submitted before the workflow exists are still in Meta and can be exported.
          </p>
        </div>
      )}

      {/* THE COVER META REFUSED. The same form without the photo is one click
          away, and the reason is shown so the token or the photo can be fixed. */}
      {coverRefused && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-cover-refused>
          <p className="font-semibold">Meta would not take the cover photo.</p>
          <p className="mt-0.5">{coverRefused}</p>
          <p className="mt-1 text-[11px]">
            Usually the token lacks the pages_manage_posts permission, which uploading a photo to the
            Page needs (docs/meta-connection.md), or the picture is an odd shape. The form itself was not
            created.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => build({ withoutCover: true })} disabled={busy === 'build'}>
              Create it without the photo
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCoverPath('')}>
              Pick another photo
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          {/* THE INTRO: what a person sees before the questions. The cover is
              picked from the client's uploads or their Drive folder, the way
              an ad's photo is. */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-2.5" data-form-intro-builder>
            <div>
              <p className="text-xs font-semibold text-slate-700">How it opens</p>
              <p className="text-[11px] text-slate-500">
                The cover photo and the intro card a person sees first. All optional: with none of it the form opens on the questions.
              </p>
            </div>
            <AdImagePicker
              label="Cover photo"
              client={client}
              files={files}
              value={coverPath}
              onChange={setCoverPath}
              onUpload={(f) => onUpload?.(f, setCoverPath)}
              onRefresh={onRefresh}
              driveFolderId={driveFolderId}
              onFolderSaved={onFolderSaved}
            />
            {coverNote && <p className="text-[11px] text-amber-800">{coverNote}</p>}
            {/* The phone turns to the page being typed on: the intro here,
                the questions for the headline, the thank-you page below. */}
            <input
              value={introTitle}
              onChange={(e) => setIntroTitle(e.target.value)}
              onFocus={() => setPreviewPage('intro')}
              maxLength={60}
              placeholder="Intro title — the offer in a line, e.g. Free second opinion on any quote"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
              data-intro-title
            />
            <textarea
              value={introText}
              onChange={(e) => setIntroText(e.target.value)}
              onFocus={() => setPreviewPage('intro')}
              rows={3}
              placeholder={'Intro lines, one per line, e.g.\nA real person calls you back today\nNo obligation, no pressure'}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
              data-intro-text
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={introButton}
                onChange={(e) => setIntroButton(e.target.value)}
                onFocus={() => setPreviewPage('intro')}
                maxLength={30}
                placeholder="Intro button — Continue"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
              />
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                onFocus={() => setPreviewPage('questions')}
                maxLength={60}
                placeholder="Headline over the questions — e.g. Where should we call you?"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                data-form-headline
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700">What it asks</p>
              <Button size="sm" variant="outline" disabled={busy === 'recommend'} onClick={recommend}>
                {busy === 'recommend' ? 'Reading the chat and intake…' : '✨ Recommend the questions'}
              </Button>
            </div>

            {note && <p className="text-[11px] text-slate-600">{note}</p>}

            <div className="grid gap-1.5 sm:grid-cols-2">
              {FORM_QUESTIONS.map((q) => (
                <QuestionRow
                  key={q.type}
                  q={q}
                  on={picked.includes(q.type)}
                  toggle={() => toggle(q.type)}
                  why={why[q.type]}
                />
              ))}
            </div>

            {customs.length > 0 && (
              <div className="space-y-1.5">
                {customs.map((c, i) => (
                  <CustomRow
                    key={`${c.label}-${i}`}
                    c={c}
                    onOptions={(options) =>
                      setCustoms((cur) => cur.map((x, j) => (j === i ? { ...x, options } : x)))
                    }
                    replacing={swap?.index === i}
                    reason={swap?.index === i ? swap.reason : ''}
                    onReason={(reason) => setSwap((s) => ({ ...s, reason }))}
                    onUntick={() => setSwap({ index: i, reason: '' })}
                    onAsk={askReplacement}
                    onDrop={() => {
                      setCustoms((cur) => cur.filter((_, j) => j !== i))
                      setSwap(null)
                    }}
                    onCancel={() => setSwap(null)}
                    busy={busy === 'replace'}
                  />
                ))}
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                value={newCustom}
                onChange={(e) => setNewCustom(e.target.value)}
                placeholder="Ask something in their words — e.g. What is the unit doing?"
                className="min-w-0 rounded border border-slate-300 px-2 py-1.5 text-xs"
              />
              <input
                value={newOptions}
                onChange={(e) => setNewOptions(e.target.value)}
                placeholder="Options, comma separated — e.g. No cooling, Weird noise, Want a quote"
                className="min-w-0 rounded border border-slate-300 px-2 py-1.5 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!newCustom.trim() || parseOptions(newOptions).length < 2}
                title={parseOptions(newOptions).length < 2 ? 'Give it at least two options so it is a tap, not a typed box' : ''}
                onClick={() => {
                  setCustoms((cur) => [...cur, { label: newCustom.trim(), why: '', options: parseOptions(newOptions) }])
                  setNewCustom('')
                  setNewOptions('')
                }}
              >
                Add
              </Button>
            </div>

            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              onBlur={() => setFormName((v) => (v.trim() ? wcName(v.trim()) : v))}
              placeholder="Form name — what you will see in Meta (WC_ goes on the front)"
              title="Every form the CRM makes is named WC_… so ours stand out from the client's own in Meta"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
              data-form-name
            />
            <textarea
              value={thankYou}
              onChange={(e) => setThankYou(e.target.value)}
              onFocus={() => setPreviewPage('thanks')}
              rows={2}
              placeholder="What they read after submitting"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
            />
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
              <input
                type="checkbox"
                checked={higherIntent}
                onChange={(e) => setHigherIntent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-slate-900">Higher Intent</span>
                <span className="ml-1.5 text-[10px] text-green-700">recommended</span>
                <span className="mt-0.5 block text-slate-500">
                  Meta shows a review screen before the lead submits. About 30 to 40% fewer junk leads for
                  15 to 20% fewer submissions. Off is the "More Volume" form, which people submit by
                  accident. There is no text-a-code step on Meta forms; that is a GoHighLevel workflow
                  after the lead lands.
                </span>
              </span>
            </label>
            <input
              value={privacyUrl}
              onChange={(e) => setPrivacyUrl(e.target.value)}
              placeholder="Privacy policy URL — Meta requires one on every form"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={busy === 'build' || busy === 'cover' || total === 0 || !formName.trim()} onClick={() => build()}>
                {busy === 'cover' ? 'Preparing the cover photo…' : busy === 'build' ? 'Building it on the Page…' : 'Create the form'}
              </Button>
              <span className="text-[11px] text-slate-500">
                {total} question{total === 1 ? '' : 's'}
                {customs.length > 0 &&
                  ` · ${customs.length} multiple choice${
                    customs.some((c) => (c.options || []).length < 2)
                      ? ` (${customs.filter((c) => (c.options || []).length < 2).length} still typed)`
                      : ''
                  }`}
                {coverSrc ? ' · cover photo on' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* THE PREVIEW, beside the builder on a wide screen and under it on a
            narrow one, stuck to the top so it stays in view while the long
            list scrolls. */}
        <div className="lg:sticky lg:top-3 lg:self-start">
          <InstantFormPreview pages={pages} pageName={client.name} coverSrc={coverSrc} coverNote={coverNote} active={previewPage} onActive={setPreviewPage} />
        </div>
      </div>
    </div>
  )
}
