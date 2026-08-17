// Renders an SOP written as ordinary text.
//
// Deliberately not a markdown parser: these get pasted from notes, emails and
// Google Docs, where headings are ALL CAPS or "STEP 2:" and lists are just
// lines starting with a number. Requiring markdown syntax would mean retyping
// every SOP. Markdown that happens to be there (#, **bold**, `code`) still
// works, so both styles render.

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s<>()]+|[\w.+-]+@[\w-]+\.[\w.]+)/g

function inline(text, keyPrefix) {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={key} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-[0.9em] font-mono">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={key}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline break-all"
        >
          {part}
        </a>
      )
    }
    if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(part)) {
      return (
        <a key={key} href={`mailto:${part}`} className="text-blue-600 hover:text-blue-800 underline">
          {part}
        </a>
      )
    }
    return part
  })
}

const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/
const BULLET = /^\s*[-*•]\s+(.*)$/

// A line is a heading when it's short and either markdown-marked, shouted in
// caps, or a "STEP 2:" style label — the three ways people actually write them.
function headingLevel(line) {
  const md = line.match(/^(#{1,3})\s+(.*)$/)
  if (md) return { level: md[1].length, text: md[2] }

  if (line.length > 70) return null

  const letters = line.replace(/[^A-Za-z]/g, '')
  if (letters.length >= 3 && letters === letters.toUpperCase()) {
    return { level: 2, text: line.replace(/^#+\s*/, '') }
  }
  if (/^(step|phase|part)\s+\d+/i.test(line)) return { level: 3, text: line }

  return null
}

const RULE = /^\s*(---+|===+|___+)\s*$/

function classify(line) {
  if (RULE.test(line)) return 'rule'
  if (ORDERED.test(line)) return 'ordered'
  if (BULLET.test(line)) return 'bullet'
  if (/^\s*>\s?/.test(line)) return 'quote'
  if (headingLevel(line)) return 'heading'
  return 'para'
}

// Groups consecutive lines of the same kind rather than treating each
// blank-line-separated block as one thing. People write a heading and its steps
// with no blank line between them, and splitting only on blank lines turned
// that whole run into a single paragraph.
function group(text) {
  const groups = []
  let current = null

  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (!line.trim()) {
      current = null
      continue
    }

    const type = classify(line)

    // A heading or rule is always its own group — never absorbed into a run.
    if (type === 'heading' || type === 'rule') {
      groups.push({ type, lines: [line] })
      current = null
      continue
    }

    if (!current || current.type !== type) {
      current = { type, lines: [] }
      groups.push(current)
    }
    current.lines.push(line)
  }

  return groups
}

export default function SopContent({ text }) {
  if (!text?.trim()) {
    return <p className="text-slate-500 italic">This SOP is empty.</p>
  }

  return (
    <div className="space-y-4">
      {group(text).map(({ type, lines }, b) => {
        if (type === 'rule') {
          return <hr key={b} className="border-slate-200" />
        }

        if (type === 'ordered') {
          return (
            <ol key={b} className="space-y-2">
              {lines.map((l, i) => {
                const [, num, body] = l.match(ORDERED)
                return (
                  <li key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-800 text-xs font-bold flex items-center justify-center mt-0.5">
                      {num}
                    </span>
                    <span className="text-slate-700 leading-relaxed">{inline(body, `${b}-${i}`)}</span>
                  </li>
                )
              })}
            </ol>
          )
        }

        if (type === 'bullet') {
          return (
            <ul key={b} className="space-y-1.5">
              {lines.map((l, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 text-blue-500 mt-1.5 leading-none">•</span>
                  <span className="text-slate-700 leading-relaxed">
                    {inline(l.match(BULLET)[1], `${b}-${i}`)}
                  </span>
                </li>
              ))}
            </ul>
          )
        }

        if (type === 'quote') {
          return (
            <blockquote
              key={b}
              className="border-l-4 border-amber-300 bg-amber-50 px-4 py-3 rounded-r-lg text-slate-700"
            >
              {inline(lines.map((l) => l.replace(/^\s*>\s?/, '')).join(' '), `${b}`)}
            </blockquote>
          )
        }

        if (type === 'heading') {
          const h = headingLevel(lines[0])
          {
            if (h.level === 1) {
              return (
                <h2 key={b} className="text-2xl font-bold text-slate-900 pt-2">
                  {h.text}
                </h2>
              )
            }
            if (h.level === 2) {
              return (
                <h3
                  key={b}
                  className="text-xs font-bold text-blue-700 uppercase tracking-wider pt-3 pb-1 border-b border-slate-200"
                >
                  {h.text}
                </h3>
              )
            }
            return (
              <h4 key={b} className="text-base font-bold text-slate-900 pt-2">
                {h.text}
              </h4>
            )
          }
        }

        return (
          <p key={b} className="text-slate-700 leading-relaxed">
            {lines.map((l, i) => (
              <span key={i}>
                {inline(l, `${b}-${i}`)}
                {i < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}
