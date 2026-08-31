// Did the client actually grant what they said they granted?
//
// "They only gave me half of what I need" was the complaint, and until now the
// only way to find out was to try to build something and watch it fail. Meta
// will tell us directly: the business's client_pages and client_ad_accounts
// edges each report permitted_tasks, so the exact permission level on every
// asset any client has shared is readable.
//
// It found a live example the first time it was pointed at the real account.
// One client's Page came back with:
//
//   ["PROFILE_PLUS_ANALYZE", "PROFILE_PLUS_ADVERTISE"]
//
// against another client's ten, which include MANAGE, CREATE_CONTENT and
// FACEBOOK_ACCESS. Shared, present in the partner list, looks done from both
// ends -- and missing the task needed to publish anything as that Page. That is
// the failure this exists to name, and it was sitting there unnoticed.
//
// The verdicts are here rather than in the Edge Function so they can be tested
// without a network -- see scripts/check-meta-access.mjs. The function stays
// thin: it fetches the granted lists and the CRM's mapping, and this decides
// what the combination means.

/**
 * Meta names Page tasks two ways depending on how old the Page is: MANAGE and
 * CREATE_CONTENT on the classic experience, PROFILE_PLUS_MANAGE and
 * PROFILE_PLUS_CREATE_CONTENT on the new one. Same permission, different
 * spelling, and a client on either side of that split is not a different
 * situation -- so the prefix is dropped before anything is compared.
 */
export function normaliseTask(task) {
  return String(task || '')
    .toUpperCase()
    .replace(/^PROFILE_PLUS_/, '')
}

export const normaliseTasks = (tasks) => (tasks || []).map(normaliseTask)

// What the CRM actually does with each asset, and therefore what it cannot do
// without. Kept to what the code really needs rather than asking for everything
// on principle: a client who declines full control but grants these can still
// be worked with, and telling them otherwise would be crying wolf.
export const PAGE_REQUIRED = ['ADVERTISE', 'CREATE_CONTENT']
export const PAGE_FULL = 'MANAGE'

export const AD_ACCOUNT_REQUIRED = ['ADVERTISE']
export const AD_ACCOUNT_FULL = 'MANAGE'

const TASK_LABELS = {
  ADVERTISE: 'run ads',
  CREATE_CONTENT: 'post as the Page',
  MANAGE: 'full control',
  ANALYZE: 'see reporting only',
  MANAGE_LEADS: 'download leads',
  FACEBOOK_ACCESS: 'act as the Page',
  DRAFT: 'draft campaigns',
}

export const describeTask = (task) => TASK_LABELS[normaliseTask(task)] || normaliseTask(task).toLowerCase().replace(/_/g, ' ')

/**
 * One asset's verdict.
 *
 * Four outcomes, and the difference between the middle two is the whole point:
 *
 *   not_connected  the CRM has no ID for this asset, so there is nothing to
 *                  check. Not a problem, just not started.
 *   missing        the CRM names an asset that is NOT in the granted list.
 *                  Either it was never shared or the access has been revoked,
 *                  and both look identical from inside the CRM until something
 *                  breaks.
 *   partial        shared, but without a task the CRM needs. This is the one
 *                  that used to be invisible.
 *   ok             everything needed is there. `full` says whether that
 *                  includes full control, which is worth knowing but is not a
 *                  problem on its own.
 */
export function assetVerdict({ crmId, granted, required, fullTask }) {
  if (!crmId) return { state: 'not_connected' }

  const match = (granted || []).find((g) => sameId(g.id, crmId))
  if (!match) return { state: 'missing' }

  return { ...taskCheck(match.permitted_tasks, required, fullTask), name: match.name || null }
}

/**
 * Is this permission level enough, whoever it belongs to?
 *
 * Split out of assetVerdict so it also works on an asset no client is connected
 * to yet. That matters: one Page sitting in the granted list right now carries
 * only ANALYZE and ADVERTISE, and connecting it to a client would turn a
 * cheerful "granted!" into a broken publish. Better to say so on the row that
 * invites you to connect it.
 */
export function taskCheck(permittedTasks, required, fullTask) {
  const tasks = normaliseTasks(permittedTasks)
  const lacking = required.filter((task) => !tasks.includes(task))

  return {
    state: lacking.length > 0 ? 'partial' : 'ok',
    full: tasks.includes(fullTask),
    tasks,
    lacking,
  }
}

// act_123 and 123 are the same ad account. This has bitten every part of the
// Meta code that compares IDs.
export function sameId(a, b) {
  const bare = (v) => String(v || '').replace(/^act_/i, '')
  return bare(a) !== '' && bare(a) === bare(b)
}

/**
 * The whole picture: every client, plus anything granted that no client claims.
 *
 * That last part matters more than it sounds. A client can grant access
 * perfectly and the CRM still does nothing with it, because nobody went and
 * connected the ad account afterwards. From inside the CRM that is
 * indistinguishable from the client never having replied -- so the assets Meta
 * says we hold but the CRM has not claimed are listed separately, as work to
 * do rather than a fault.
 */
export function accessReport({ clients, pages, adAccounts }) {
  const rows = (clients || []).map((client) => {
    const page = assetVerdict({
      crmId: client.meta_page_id,
      granted: pages,
      required: PAGE_REQUIRED,
      fullTask: PAGE_FULL,
    })
    const adAccount = assetVerdict({
      crmId: client.meta_ad_account_id,
      granted: adAccounts,
      required: AD_ACCOUNT_REQUIRED,
      fullTask: AD_ACCOUNT_FULL,
    })

    return {
      clientId: client.id,
      clientName: client.name,
      page,
      adAccount,
      needsAttention: [page.state, adAccount.state].some((s) =>
        ['missing', 'partial'].includes(s)
      ),
    }
  })

  const claimedPages = new Set(
    (clients || []).map((c) => c.meta_page_id).filter(Boolean).map(String)
  )
  const claimedAccounts = (clients || []).map((c) => c.meta_ad_account_id).filter(Boolean)

  const withLevel = (asset, required, fullTask) => ({
    ...asset,
    level: taskCheck(asset.permitted_tasks, required, fullTask),
  })

  return {
    clients: rows.sort((a, b) => {
      if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1
      return a.clientName.localeCompare(b.clientName)
    }),
    // Granted, but not wired to anybody.
    unclaimedPages: (pages || [])
      .filter((p) => !claimedPages.has(String(p.id)))
      .map((p) => withLevel(p, PAGE_REQUIRED, PAGE_FULL)),
    unclaimedAdAccounts: (adAccounts || [])
      .filter((a) => !claimedAccounts.some((id) => sameId(id, a.id)))
      .map((a) => withLevel(a, AD_ACCOUNT_REQUIRED, AD_ACCOUNT_FULL)),
    summary: {
      clients: rows.length,
      attention: rows.filter((r) => r.needsAttention).length,
      partial: rows.filter((r) =>
        [r.page.state, r.adAccount.state].includes('partial')
      ).length,
      missing: rows.filter((r) =>
        [r.page.state, r.adAccount.state].includes('missing')
      ).length,
    },
  }
}

/**
 * What to say to the client, in one line.
 *
 * The value of the whole check is being able to chase one named thing instead
 * of asking somebody to go through the sharing flow again, so the sentence has
 * to be specific enough to forward as-is.
 */
export function chaseLine(row) {
  const asks = []

  if (row.adAccount.state === 'missing') asks.push('share the ad account')
  else if (row.adAccount.state === 'partial') {
    asks.push(
      `raise the ad account permissions so we can ${row.adAccount.lacking
        .map(describeTask)
        .join(' and ')}`
    )
  }

  if (row.page.state === 'missing') asks.push('share the Facebook Page')
  else if (row.page.state === 'partial') {
    asks.push(
      `raise the Page permissions so we can ${row.page.lacking.map(describeTask).join(' and ')}`
    )
  }

  if (asks.length === 0) return ''

  const list = asks.length === 1 ? asks[0] : `${asks.slice(0, -1).join(', ')} and ${asks.at(-1)}`
  return `${row.clientName}: needs to ${list}.`
}
