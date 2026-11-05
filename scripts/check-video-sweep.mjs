// Self-check for the video sweep: the function that sends every clip dropped
// into the CRM to Meta and marks it ready on its own. The function runs in
// Deno, so this pins what it reads, what it never sends, and that it hands a
// video over the same way the two other senders do.
// Run: node scripts/check-video-sweep.mjs

import { readFileSync } from 'node:fs'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const src = readFileSync(new URL('../supabase/functions/video-sweep/index.ts', import.meta.url), 'utf8')
const publish = readFileSync(new URL('../supabase/functions/meta-publish/index.ts', import.meta.url), 'utf8')
const register = readFileSync(new URL('../supabase/functions/drive-video-register/index.ts', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../supabase/video-sweep.sql', import.meta.url), 'utf8')

// --- what it sends ---------------------------------------------------------------
check('only CRM uploads: video rows of client_files, never a Drive path', [src.includes(".ilike('file_type', 'video/%')"), src.includes("!f.storage_path.startsWith('drive:')")], [true, true])
check('a drop waved off as published by hand is not sent', src.includes('if (f.drop_dismissed_at) continue'), true)
check('an archived client, or one with no ad account, is left alone', [src.includes("not('meta_ad_account_id', 'is', null)"), src.includes('if (!account || c.archived) continue')], [true, true])
check('a clip Meta already has is never sent twice', src.includes('!row.meta_video_id && row.status === \'error\' && row.updated_at < retryBefore'), true)

// --- the same handover as the other two senders ------------------------------------
check('Meta is handed a URL and downloads the bytes itself, as meta-publish and drive-video-register do', [src.includes('/advideos'), src.includes('file_url'), publish.includes('file_url: fileUrl'), register.includes('file_url: fileUrl')], [true, true, true, true])
check('the row is keyed the way meta-publish looks it up', [src.includes("onConflict: 'storage_path,meta_account_id'"), publish.includes('on_conflict=storage_path,meta_account_id')], [true, true])
check('the account id carries act_, as every ad_videos row does', src.includes('return bare ? `act_${bare}` : \'\''), true)
check('the Meta name is the client then the file, as everywhere else', [src.includes('`${s.client.name} — ${fileName}`'), publish.includes('`${client.name} — ${fileName}`')], [true, true])

// --- what it writes --------------------------------------------------------------
check('a sent clip is processing with no error; a refused one is an error with no id, so the publish page can retry it', [src.includes("status: 'processing', error: null"), src.includes("meta_video_id: null, status: 'error'")], [true, true])
check('a poll writes status, the preferred frame and the error, the fields the picker reads', [src.includes("fields: 'thumbnails{uri,is_preferred}'"), src.includes('status: state.status, thumb_url: state.thumbUrl || null, error: state.error || null')], [true, true])
check('a ready row with no cover frame is asked again', src.includes("(v.status === 'ready' && !v.thumb_url)"), true)

// --- the pace --------------------------------------------------------------------
check('bounded per run, with the backlog reported', [/const MAX_SENDS = \d+/.test(src), /const MAX_POLLS = \d+/.test(src), src.includes('backlog:')], [true, true, true])
check('preview touches nothing', [src.includes("const preview = action === 'preview'"), src.includes('if (preview) {')], [true, true])
check('scheduled every two minutes', sql.includes("'*/2 * * * *'"), true)

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
