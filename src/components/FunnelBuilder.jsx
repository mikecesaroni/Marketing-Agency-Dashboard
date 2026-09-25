import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFunnel, createStandardAudiences, listAudiences } from '../lib/metaFunnel'
import { ROLES, describePlan, funnelPlan, guessRoles, planGaps, roleList } from '../lib/funnelPlan'

/**
 * Builds the top-of-funnel and retargeting pair.
 *
 * Mounted in two places. Inside the publish flow, where the ad sets it
 * creates are handed straight back as the ones to publish into (build, then
 * publish, one pass). And on the client page (FunnelPanel), with no creative
 * at all, because the structure is usually wanted before there is anything
 * to put in it. Same component, same result; only what happens to the new
 * ad sets afterwards differs, and that is the caller's onBuilt.
 *
 * Everything it creates is PAUSED, and it never touches an existing campaign.
 */
const usd = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`

/**
 * A reason string with any URL in it made clickable.
 *
 * Meta's "#2663 Terms of service has not been accepted" comes with the exact
 * link to click, and it is a one-time, one-click human step per ad account.
 * Buried in an error string it gets copied by hand or missed; as a link it
 * gets clicked.
 */
function Reason({ text }) {
  const parts = String(text || '').split(/(https?:\/\/[^\s)]+)/g)
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="underline">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}

function RolePicker({ role, spec, audiences, value, onChange }) {
  const picked = roleList(value)
  return (
    <div>
      <p className="text-xs font-medium text-slate-900">{spec.label}</p>
      <p className="mb-1 text-[11px] text-slate-500">{spec.hint}</p>
      {audiences.length === 0 ? (
        <p className="text-[11px] text-slate-500">No saved audiences on this account.</p>
      ) : (
        <div className="max-h-32 space-y-0.5 overflow-y-auto rounded border border-slate-200 p-1.5">
          {audiences.map((a) => (
            <label key={a.id} className="flex cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 text-[11px] hover:bg-slate-50">
              <input
                type="checkbox"
                checked={picked.includes(a.id)}
                onChange={() =>
                  onChange(
                    role,
                    picked.includes(a.id) ? picked.filter((x) => x !== a.id) : [...picked, a.id]
                  )
                }
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-slate-800">{a.name}</span>
                <span className="text-slate-500">
                  {a.size != null && a.size >= 0 ? ` · ${a.size.toLocaleString()}` : ''}
                  {a.ready ? '' : ' · not ready'}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FunnelBuilder({ client, locations, ageMin, ageMax, specialCategory, onBuilt, onCancel }) {
  const [audiences, setAudiences] = useState(null)
  const [roles, setRoles] = useState({ leads: [], warmVisitors: [], engagers: [] })
  const [tofBudget, setTofBudget] = useState('50.00')
  const [retargetBudget, setRetargetBudget] = useState('25.00')
  // WHERE THE LEAD LANDS. A website form is measured by the pixel and the ad
  // sets optimise for its Lead event; an instant form lives on Meta and the
  // ad sets promote the Page that hosts it. This is fixed once the ad sets
  // exist, so it is asked here. Default: the pixel when there is one, the
  // Page otherwise -- but a client with a pixel can still be running forms.
  const [destination, setDestination] = useState(client.meta_pixel_id ? 'website' : 'form')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The per-audience report from creating the standard four. Kept on screen
  // after the list reloads, because "skipped: no pixel" is the thing the
  // person needs to read, and it would otherwise vanish the moment the two
  // that did get made appear in the pickers.
  const [audienceReport, setAudienceReport] = useState(null)
  const [makingAudiences, setMakingAudiences] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const found = await listAudiences(client.id)
      setAudiences(found)
      // Filled in, never applied. A guess that assigned itself is how a
      // lookalike ends up excluded from prospecting.
      setRoles(guessRoles(found))
    } catch (err) {
      setError(err.message)
      setAudiences([])
    }
  }, [client.id])

  useEffect(() => {
    load()
  }, [load])

  const setRole = (role, ids) => setRoles((prev) => ({ ...prev, [role]: ids }))

  // Creates the standard four, then re-reads the account so they land in the
  // pickers -- and re-guesses the roles, since the names are the convention
  // the guesser was built on and will match every time.
  const makeAudiences = async () => {
    setMakingAudiences(true)
    setError('')
    try {
      const report = await createStandardAudiences(client.id)
      setAudienceReport(report)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setMakingAudiences(false)
    }
  }

  const plan = useMemo(() => funnelPlan(roles), [roles])
  const gaps = useMemo(() => planGaps(roles), [roles])
  const names = useMemo(
    () => Object.fromEntries((audiences || []).map((a) => [a.id, a.name])),
    [audiences]
  )
  const lines = useMemo(() => describePlan(plan.adsets, names), [plan, names])

  const cents = (v) => Math.round(Number(v || 0) * 100)
  const budgetCents = { tof: cents(tofBudget), retarget: cents(retargetBudget) }

  const blockers = []
  if (locations.length === 0) blockers.push('pick where the ads run')
  if (destination === 'website' && !client.meta_pixel_id) blockers.push('the client has no pixel, so choose Instant form')
  if (destination === 'form' && !client.meta_page_id) blockers.push('the client has no Facebook Page connected')
  if (budgetCents.tof < 100) blockers.push('top of funnel budget under $1.00')
  if (plan.campaigns.some((c) => c.stage === 'retarget') && budgetCents.retarget < 100)
    blockers.push('retargeting budget under $1.00')

  const build = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await createFunnel({
        clientId: client.id,
        plan,
        locations,
        ageMin: Number(ageMin),
        ageMax: Number(ageMax),
        budgetCents,
        optimizationGoal: destination === 'form' ? 'LEAD_GENERATION' : 'OFFSITE_CONVERSIONS',
        specialAdCategories: specialCategory ? [specialCategory] : [],
      })
      onBuilt?.(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (audiences === null) {
    return <p className="text-xs text-slate-500">Reading the saved audiences from Meta…</p>
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-2.5 text-xs text-slate-700">
        <p className="font-semibold text-slate-900">How it works</p>
        <ul className="mt-1 space-y-0.5 text-[11px]">
          <li><strong>Top of funnel</strong> shows ads to people in the area who have never dealt with the client.</li>
          <li><strong>Retargeting</strong> shows ads only to people who already looked, liked or watched.</li>
          <li>Anyone who already sent a lead is left out of both.</li>
          <li>Everything is created <strong>paused</strong>. Nothing spends until it is switched on in Ads Manager.</li>
        </ul>
      </div>

      {audiences.length === 0 && !audienceReport ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <p className="font-medium">One thing first: this account has no audiences yet.</p>
          <p className="mt-1 text-[11px]">
            An audience is a list Meta keeps of people who already interacted with the client
            (liked the Page, watched a video, visited the site, opened or sent a form). The funnel
            needs them to know who is new and who to follow up with. One click creates the
            standard six from the client&apos;s Page, Instagram and pixel.
          </p>
          <button
            type="button"
            onClick={makeAudiences}
            disabled={makingAudiences}
            className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {makingAudiences ? 'Creating in Meta…' : 'Create the audiences'}
          </button>
        </div>
      ) : audienceReport ? (
        /* WHAT HAPPENED, per audience. Skipped is the important row: a client
           with no pixel cannot have the two website audiences, and the reason
           has to say so plainly, because the fix (add a pixel) is theirs. */
        <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs">
          <p className="font-medium text-slate-900">
            {audienceReport.created} audience{audienceReport.created === 1 ? '' : 's'} created
            {audienceReport.instagram_account ? '' : ' · no Instagram account linked to the Page'}
          </p>
          <ul className="mt-1 space-y-0.5">
            {audienceReport.results.map((r) => (
              <li key={r.name} className="text-[11px] text-slate-700">
                <span className="font-medium">{r.name}</span>
                {r.status === 'created' && <span className="text-green-700"> — created</span>}
                {r.status === 'exists' && <span className="text-slate-500"> — already there</span>}
                {r.status === 'skipped' && (
                  <span className="text-amber-800">
                    {' '}— skipped: <Reason text={r.reason} />
                  </span>
                )}
                {r.status === 'failed' && (
                  <span className="text-red-700">
                    {' '}— Meta refused: <Reason text={r.reason} />
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-slate-500">
            New audiences say &ldquo;not ready&rdquo; for up to an hour while Meta fills them. They are
            already picked below.
          </p>
        </div>
      ) : null}

      {audiences.length > 0 && (
        <>
          <div>
            <p className="text-xs font-semibold text-slate-900">2 · Who it reaches</p>
            <p className="text-[11px] text-slate-500">
              Picked for you from the client&apos;s audiences. Usually nothing to change. Retargeting goes
              after the two warm groups; everyone who is already a lead is left out.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(ROLES).map(([role, spec]) => (
              <RolePicker
                key={role}
                role={role}
                spec={spec}
                audiences={audiences}
                value={roles[role]}
                onChange={setRole}
              />
            ))}
          </div>

          {gaps.map((g) => (
            <p
              key={g.role + g.severity}
              className={`rounded border px-2 py-1 text-[11px] ${
                g.severity === 'high'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              {g.text}
            </p>
          ))}
        </>
      )}

      <p className="text-xs font-semibold text-slate-900">3 · Spend per day</p>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs">
          <span className="block font-medium text-slate-700">Top of funnel, $/day <span className="font-normal text-slate-400">(finding new people)</span></span>
          <input
            value={tofBudget}
            onChange={(e) => setTofBudget(e.target.value)}
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
        </label>
        <label className="text-xs">
          <span className="block font-medium text-slate-700">Retargeting, $/day <span className="font-normal text-slate-400">(following up)</span></span>
          <input
            value={retargetBudget}
            onChange={(e) => setRetargetBudget(e.target.value)}
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
        </label>
      </div>
      <p className="text-[11px] text-slate-500">
        Each campaign gets its own daily budget. Most clients: more on top of funnel, less on retargeting.
      </p>

      <div>
        <p className="text-xs font-semibold text-slate-900">4 · Where a lead lands</p>
        <div className="mt-1 flex flex-wrap gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="funnel-destination"
              checked={destination === 'website'}
              onChange={() => setDestination('website')}
            />
            <span>
              Website form <span className="text-slate-500">· the client&apos;s own page, needs their pixel</span>
            </span>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="funnel-destination"
              checked={destination === 'form'}
              onChange={() => setDestination('form')}
            />
            <span>
              Instant form <span className="text-slate-500">· opens inside Facebook, no website needed</span>
            </span>
          </label>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Fixed once built. Instant form is right for most clients.
        </p>
      </div>

      {/* WHAT IT WILL DO, before it does it. Reading back the plan in words is
          the only check on an audience picked into the wrong role, and that
          mistake is invisible once it is live. */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
        <p className="mb-1 text-xs font-semibold text-slate-900">5 · What you get</p>
        <ul className="space-y-0.5">
          {plan.campaigns.map((c) => (
            <li key={c.stage} className="text-[11px] text-slate-700">
              <span className="font-medium">{c.stage === 'tof' ? 'Top of funnel' : 'Retargeting'}</span>{' '}
              — {usd(budgetCents[c.stage])}/day
              <span className="text-slate-500"> · {c.name}</span>
            </li>
          ))}
          {lines.map((line, i) => (
            <li key={i} className="pl-3 text-[11px] text-slate-600">
              {line}
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={build}
          disabled={busy || blockers.length > 0}
          title={blockers.length ? `Still needed: ${blockers.join(', ')}` : undefined}
          className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {busy ? 'Building in Meta…' : 'Build it in Meta (paused)'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
        {blockers.length > 0 && (
          <span className="text-[11px] text-slate-500">Still needed: {blockers.join(', ')}</span>
        )}
      </div>
    </div>
  )
}
