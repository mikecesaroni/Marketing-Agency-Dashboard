import { Link } from 'react-router-dom'
import { Card } from './ui'

/**
 * Clients whose ads could be running and are not.
 *
 * The rule, as asked for: the Meta ad account is connected, the ads are not
 * live, and GoHighLevel is either not part of their plan or is marked live.
 * That is a client with nothing in the way but us, and it used to sit in a
 * small list halfway down the page under "Backend built, ads still off",
 * where a client not on GHL never appeared at all.
 *
 * Two kinds of row. Ready: build and publish today. Waiting on the Page: the
 * ad account is in but the Facebook Page ID is not, and an ad is a Page post,
 * so the one thing to do is ask for it. Clients whose ad account itself is
 * missing are not "Meta connected" and are not here; the GHL queues cover
 * them.
 *
 * Renders nothing when the list is empty.
 */
export default function LaunchReadyAlerts({ ready = [], blocked = [] }) {
  // Only the blocked rows whose ad account IS connected belong under a
  // "Meta connected" heading.
  const pageOnly = blocked.filter((c) => c.meta?.missing?.length === 1 && c.meta.missing[0] === 'Facebook Page')
  const rows = [...ready.map((c) => ({ ...c, kind: 'ready' })), ...pageOnly.map((c) => ({ ...c, kind: 'page' }))]
  if (rows.length === 0) return null

  const n = rows.length
  return (
    <Card tone="info" padding="lg" className="mb-6 md:mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-slate-900">
          {n === 1 ? 'A client is ready to launch ads' : `${n} clients are ready to launch ads`}
        </p>
        <p className="text-xs text-slate-600">Meta connected, ads off, and GoHighLevel live or not part of the plan</p>
      </div>

      <div className="mt-3 space-y-2">
        {rows.map((c) => (
          <div key={c.id} className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className={`w-1 flex-shrink-0 ${c.kind === 'ready' ? 'bg-blue-500' : 'bg-amber-500'}`} />
            <div className="min-w-0 flex-1 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <Link to={`/client/${c.id}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline">
                  {c.name}
                </Link>
                <span className={`text-xs font-medium ${c.kind === 'ready' ? 'text-blue-700' : 'text-amber-700'}`}>
                  {c.kind === 'ready' ? 'Build and publish' : 'Ask for the Facebook Page ID'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                {c.kind === 'ready' ? c.note : `Ad account connected · ${c.onPlan ? 'GHL live' : 'no GHL build'} · Page ID missing, and an ad is a Page post`}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-600">
        Open the client, build in the Ad Studio and publish from the Publish tab. Ads publish paused; you switch them on in Ads Manager.
      </p>
    </Card>
  )
}
