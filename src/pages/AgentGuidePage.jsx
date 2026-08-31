import { useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { Button, Card } from '../components/ui'
import { copyText } from '../lib/intakeSummary'
import {
  DOWNLOADS,
  GOTCHAS,
  GUIDE_INTRO,
  GUIDE_TITLE,
  LOOKUPS,
  ROUTES,
  formatAgentGuide,
} from '../lib/agentGuide'

// The guide, rendered.
//
// Written to be read straight through by something that cannot see the layout,
// so the order of the DOM is the order of the argument: what this is, then the
// pages, then where to find a thing, then how to get it out, then what will
// catch you out. No columns that read down instead of across, no information
// carried only by colour or position, and real headings rather than styled
// divs, because a heading is how a reader skips.
//
// The plain-text copy at /llms.txt is the same content and needs no JavaScript
// at all; it is linked from the top for anything that would rather have that.

function Heading({ children, id }) {
  return (
    <h2 id={id} className="mb-3 mt-8 text-lg font-semibold tracking-tight text-slate-900">
      {children}
    </h2>
  )
}

function RouteCard({ route }) {
  const paths = [route.path, ...(route.aliases || [])]

  return (
    <Card padding="lg" className="space-y-3">
      <div>
        <h3 className="font-semibold text-slate-900">{route.name}</h3>
        <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 font-mono text-xs text-blue-700">
          {paths.map((p) => (
            <span key={p}>{p}</span>
          ))}
        </p>
        {route.nav && (
          <p className="mt-1 text-[11px] text-slate-500">
            In the sidebar as &ldquo;{route.nav}&rdquo;
          </p>
        )}
      </div>

      <p className="text-sm text-slate-700">{route.purpose}</p>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          What is on it
        </p>
        <ul className="mt-1 space-y-1">
          {route.contains.map((item) => (
            <li key={item} className="text-sm text-slate-700">
              &middot; {item}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          What you can do
        </p>
        <ul className="mt-1 space-y-1">
          {route.actions.map((item) => (
            <li key={item} className="text-sm text-slate-700">
              &middot; {item}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

export default function AgentGuidePage() {
  const [copied, setCopied] = useState('')

  const handleCopy = async () => {
    const ok = await copyText(formatAgentGuide())
    setCopied(ok ? 'ok' : 'fail')
    setTimeout(() => setCopied(''), 2000)
  }

  const copyButton = (
    <Button onClick={handleCopy}>
      {copied === 'ok' ? '✓ Copied' : copied === 'fail' ? 'Copy failed' : 'Copy as plain text'}
    </Button>
  )

  return (
    <Layout
      title={GUIDE_TITLE}
      subtitle="For anyone — or anything — using this CRM for the first time"
      actions={copyButton}
    >
      <Card padding="lg" className="mb-6 space-y-3">
        {GUIDE_INTRO.map((para) => (
          <p key={para} className="text-sm leading-relaxed text-slate-700">
            {para}
          </p>
        ))}
        <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">
          Reading this without running JavaScript?{' '}
          <a href="/llms.txt" className="font-medium text-blue-600 underline hover:text-blue-800">
            /llms.txt
          </a>{' '}
          is the same guide as plain text, served as a real file.
        </p>
      </Card>

      <Heading id="pages">Pages</Heading>
      <div className="grid gap-3 md:gap-4 lg:grid-cols-2">
        {ROUTES.map((route) => (
          <RouteCard key={route.path} route={route} />
        ))}
      </div>

      <Heading id="where">Where to find a particular thing</Heading>
      <div className="space-y-2">
        {LOOKUPS.map((l) => (
          <Card key={l.need} padding="lg">
            <p className="font-medium text-slate-900">{l.need}</p>
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-medium text-slate-500">Go to:</span> {l.where}
            </p>
            <p className="mt-1 text-sm text-slate-600">{l.how}</p>
          </Card>
        ))}
      </div>

      <Heading id="downloads">Getting things out</Heading>
      <div className="space-y-2">
        {DOWNLOADS.map((d) => (
          <Card key={d.what} padding="lg">
            <p className="font-medium text-slate-900">{d.what}</p>
            <p className="mt-1 text-sm text-slate-600">{d.how}</p>
          </Card>
        ))}
      </div>

      <Heading id="gotchas">Things that will catch you out</Heading>
      <div className="space-y-2">
        {GOTCHAS.map((g) => (
          <Card key={g.title} padding="lg" tone="warning">
            <p className="font-medium text-slate-900">{g.title}</p>
            <p className="mt-1 text-sm text-slate-700">{g.body}</p>
          </Card>
        ))}
      </div>

      <p className="mt-8 text-sm text-slate-500">
        Start at the <Link to="/" className="text-blue-600 underline hover:text-blue-800">Dashboard</Link>{' '}
        if you do not know where to begin.
      </p>
    </Layout>
  )
}
