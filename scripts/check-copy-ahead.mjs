// Self-check for the words written ahead of the click. Run: node scripts/check-copy-ahead.mjs
//
// The function is Deno and talks to three other functions, so this pins
// the shape of the source: it claims a row before asking for its words, it
// asks for the same three lists the publish page asks for, it keeps words
// already typed as option one, it leaves published and cleared drops alone,
// and the drop boxes nudge it the moment a drop lands.

import { readFileSync } from 'node:fs'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// The one ask, word for word, in the function and on the publish page.
const INSTRUCTION_MARK = 'Write three primary texts, three headlines and three descriptions for this ad. Meta mixes them, so each list stands on its own.'
const fn = read('supabase/functions/copy-ahead/index.ts')
check('the ask is the publish page’s ask, word for word', read('src/lib/adCopy.js').includes(INSTRUCTION_MARK), true)
check(
  'a row is claimed before the copy assistant is asked, and the claim is what a second run at once loses',
  [fn.includes("if (!(await claim('saved_ads', s.id, 'copy_requested_at'))) return"), fn.includes("if (!(await claim('ad_videos', v.id, 'copy_requested_at'))) return"), fn.includes("if (!(await claim('ad_videos', v.id, 'transcribe_requested_at'))) return"), fn.includes('.or(`${column}.is.null,${column}.lt.${inFlightBefore}`)')],
  [true, true, true, true]
)
check(
  'the same ask the publish page makes: text options, image or video, the client’s facts, the painted words or the transcript',
  [fn.includes("mode: 'text_options'"), fn.includes("medium: 'image'"), fn.includes("medium: 'video'"), fn.includes('transcript: v.transcript || \'\''), fn.includes("services: i.service_want_more || i.most_profitable_service || i.services_offered"), fn.includes(INSTRUCTION_MARK)],
  [true, true, true, true, true, true]
)
check('words already typed stay as option one; the written lines become the extras', [fn.includes('if (first) return { main: first, more: list.filter((s) => s !== first).slice(0, 2) }'), fn.includes('more_copy: { primary_texts: p.more, headlines: h.more, descriptions: d.more }'), fn.includes('more_primary_texts: p.more, more_headlines: h.more, more_descriptions: d.more')], [true, true, true])
check('published and cleared drops are left alone, and only drops: dropped_by on a static, a CRM upload for a clip', [fn.includes("publishedStamps.has(`${s.client_id}:${s.stamp}`) || clearedStamps.has(`${s.client_id}:${s.stamp}`)"), fn.includes('if (v.meta_video_id && publishedVideos.has(v.meta_video_id)) continue'), fn.includes(".not('dropped_by', 'is', null)"), fn.includes('if (!droppedPaths.has(v.storage_path) || clearedPaths.has(v.storage_path)) continue')], [true, true, true, true])
check('a clip is transcribed first and written on the next run; one transcription gave up on is written from the note and the facts', [fn.includes("callFn('transcribe-video', { client_id: v.client_id, storage_path: v.storage_path })"), fn.includes('const heard = Boolean(clean(v.transcript) || clean(v.transcript_error))')], [true, true])
check('a few per run, in parallel', [fn.includes('const MAX_WRITES = 3'), fn.includes('const MAX_TRANSCRIBES = 2'), fn.includes('await Promise.allSettled([...writes.map((w) => w.run()), ...transcribeTodo.slice(0, MAX_TRANSCRIBES).map((v) => transcribe(v))])')], [true, true, true])

check('the drop boxes nudge it the moment a drop lands', [read('src/components/StaticDropBoard.jsx').includes('writeCopyAhead(chosen.id)'), read('src/components/VideoDropBoard.jsx').includes('writeCopyAhead(chosen.id)'), read('src/lib/copyAhead.js').includes("invoke('copy-ahead', { body: { action: 'sweep', client_id: clientId || undefined } })")], [true, true, true])
check('the columns and the schedule are in the SQL', [read('supabase/copy-ahead.sql').includes('add column if not exists copy_requested_at timestamptz'), read('supabase/copy-ahead.sql').includes("'1-59/2 * * * *'")], [true, true])

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nAll copy-ahead checks passed.')
