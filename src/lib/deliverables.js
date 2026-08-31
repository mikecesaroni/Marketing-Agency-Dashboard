// Shaping the deliverables list into something you can actually work from.
//
// A flat list was the whole problem. Thirteen clients times eight items is a
// hundred rows in one column, sorted by a due date almost none of them have,
// and no way to see either "what is left for Belk" or "how many videos do I
// owe this week". Both are real questions and they want opposite groupings, so
// there are two:
//
//   BY CLIENT — the launch view. One card per client in launch order, which is
//     what you read when you are picking up a client and asking what is next.
//   BY STAGE  — the batching view. Every client who needs the video ad, side by
//     side. Making four videos in one sitting is faster than four separate
//     trips through the Studio, and this is the only view that shows you that
//     they are all waiting.
//
// Kept out of the page component so the ordering and grouping rules can be
// tested without a browser -- see scripts/check-deliverables.mjs.

// Must stay in step with the type check constraint in
// supabase/deliverable-templates.sql. The check script compares them, because
// they were already out of step once: the form offered 'ghl setup' while the
// constraint rejected it, so choosing it failed the save.
export const DELIVERABLE_TYPES = [
  'access',
  'creative',
  'campaign',
  'report',
  'landing page',
  'ghl setup',
  'automation',
  'other',
]

export const DELIVERABLE_STATUSES = ['todo', 'in progress', 'review', 'done']

export const TYPE_ICONS = {
  access: '🔑',
  creative: '🎨',
  campaign: '🚀',
  report: '📄',
  'landing page': '🖥️',
  'ghl setup': '🔧',
  automation: '⚡',
  other: '📌',
}

// The phases the seeded sets use, in the order a launch actually happens.
// Anything else — hand-typed work — collects under "Other" at the end.
export const PHASE_ORDER = ['Meta', 'GoHighLevel']
export const OTHER_PHASE = 'Other'

const phaseRank = (phase) => {
  const i = PHASE_ORDER.indexOf(phase)
  return i === -1 ? PHASE_ORDER.length : i
}

export function isLate(deliverable, todayDate) {
  return (
    deliverable.status !== 'done' &&
    Boolean(deliverable.due_date) &&
    deliverable.due_date < todayDate
  )
}

export function progress(items) {
  const total = items.length
  const done = items.filter((d) => d.status === 'done').length
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}

/**
 * Launch order.
 *
 * sort_order first, because these are a sequence rather than a set of equals:
 * there is no point making creatives for an account you cannot get into, and
 * SMS automation before A2P clears sends messages the carrier drops silently.
 * Hand-typed work defaults to 500 and so lands after the seeded launch steps
 * but before nothing -- it is not part of the sequence and should not
 * interrupt it.
 *
 * Then a due date if there is one, because a dated item is dated for a reason.
 * Then title, so the order never depends on which row the database handed back
 * first.
 */
export function byLaunchOrder(a, b) {
  const order = (a.sort_order ?? 500) - (b.sort_order ?? 500)
  if (order !== 0) return order

  if (a.due_date && b.due_date && a.due_date !== b.due_date) {
    return a.due_date < b.due_date ? -1 : 1
  }
  if (a.due_date && !b.due_date) return -1
  if (!a.due_date && b.due_date) return 1

  return String(a.title || '').localeCompare(String(b.title || ''))
}

/**
 * One group per client, each split into phases.
 *
 * Clients with outstanding work come first and fully-launched ones sink,
 * because a finished client is a thing to confirm occasionally rather than
 * something competing for attention every day. Within that, the client with
 * the most left to do leads: it is the one furthest from being launched.
 */
export function groupByClient(items) {
  const byClient = new Map()

  for (const d of items) {
    const id = d.client_id
    if (!byClient.has(id)) {
      byClient.set(id, {
        clientId: id,
        clientName: d.clients?.name || 'Unknown client',
        items: [],
      })
    }
    byClient.get(id).items.push(d)
  }

  const groups = [...byClient.values()].map((group) => {
    const sorted = [...group.items].sort(byLaunchOrder)
    const phases = []

    for (const d of sorted) {
      const phase = d.phase || OTHER_PHASE
      let bucket = phases.find((p) => p.phase === phase)
      if (!bucket) {
        bucket = { phase, items: [] }
        phases.push(bucket)
      }
      bucket.items.push(d)
    }

    phases.sort((a, b) => phaseRank(a.phase) - phaseRank(b.phase))

    return {
      ...group,
      items: sorted,
      phases: phases.map((p) => ({ ...p, ...progress(p.items) })),
      ...progress(sorted),
    }
  })

  return groups.sort((a, b) => {
    const aOpen = a.total - a.done
    const bOpen = b.total - b.done
    if ((aOpen === 0) !== (bOpen === 0)) return aOpen === 0 ? 1 : -1
    if (aOpen !== bOpen) return bOpen - aOpen

    // Equal amounts outstanding, so the tie goes to whoever has got least far.
    // A client sitting at nothing done is the one worth noticing: they are
    // either newly signed or quietly neglected, and both want looking at
    // before a client who is most of the way there. Without this the tie fell
    // to alphabetical order, which is no answer at all.
    if (a.percent !== b.percent) return a.percent - b.percent

    return a.clientName.localeCompare(b.clientName)
  })
}

/**
 * One group per piece of work, listing every client waiting on it.
 *
 * Grouped by template_key where there is one, so a retitled seeded item stays
 * with its own kind, and by title otherwise so hand-typed work still gathers
 * instead of scattering into groups of one.
 */
export function groupByStage(items) {
  const byStage = new Map()

  for (const d of items) {
    const key = d.template_key || `manual:${d.title}`
    if (!byStage.has(key)) {
      byStage.set(key, {
        key,
        title: d.title,
        phase: d.phase || OTHER_PHASE,
        sortOrder: d.sort_order ?? 500,
        type: d.type,
        items: [],
      })
    }
    byStage.get(key).items.push(d)
  }

  return [...byStage.values()]
    .map((stage) => ({
      ...stage,
      items: [...stage.items].sort((a, b) =>
        (a.clients?.name || '').localeCompare(b.clients?.name || '')
      ),
      ...progress(stage.items),
    }))
    .sort((a, b) => {
      const rank = phaseRank(a.phase) - phaseRank(b.phase)
      if (rank !== 0) return rank
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.title.localeCompare(b.title)
    })
}

/**
 * Put the real totals back on a filtered list.
 *
 * Grouping a filtered list gives each group progress over only what survived
 * the filter, and under the default "open" filter that reads "0/7" for a client
 * who has actually done 1 of 8 -- both numbers wrong, and in a way that looks
 * authoritative. A progress bar has to mean the same thing whatever is being
 * shown, so the counts come from the unfiltered set while the rows shown stay
 * filtered.
 */
export function mergeOverallProgress(filteredGroups, allGroups, key = 'clientId') {
  const overall = new Map(allGroups.map((g) => [g[key], g]))

  return filteredGroups.map((group) => {
    const all = overall.get(group[key])
    if (!all) return group

    return {
      ...group,
      done: all.done,
      total: all.total,
      percent: all.percent,
      phases: group.phases?.map((phase) => {
        const allPhase = all.phases?.find((x) => x.phase === phase.phase)
        return allPhase ? { ...phase, done: allPhase.done, total: allPhase.total } : phase
      }),
    }
  })
}

/**
 * The one-line read for the page header.
 *
 * Counts clients rather than rows. "62 open" says nothing you can act on;
 * "9 clients mid-launch, 4 fully launched" is the state of the business.
 */
export function launchSummary(groups) {
  return {
    clients: groups.length,
    launched: groups.filter((g) => g.total > 0 && g.done === g.total).length,
    inFlight: groups.filter((g) => g.done < g.total).length,
    notStarted: groups.filter((g) => g.done === 0 && g.total > 0).length,
  }
}
