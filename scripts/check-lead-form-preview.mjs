// Self-check for the instant form's live preview and the intro card: the
// pages a person taps through, drawn from the builder, and the extra parts
// of the create call. Run: node scripts/check-lead-form-preview.mjs

import { readFileSync } from 'node:fs'
import { SAMPLE_ANSWERS, coverShapeNote, formExtras, introLines, introStyle, previewPages, sampleCity } from '../src/lib/leadFormPreview.js'
import { formToBuilder, introOf } from '../src/lib/leadFormDetails.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// The intro lines and their style.
check('one line per line typed, blanks dropped, five at most', introLines(' A real person calls you back\n\n No obligation \nThree\nFour\nFive\nSix'), ['A real person calls you back', 'No obligation', 'Three', 'Four', 'Five'])
check('a list when there is more than one line, a paragraph otherwise', [introStyle(['a', 'b']), introStyle(['a']), introStyle([])], ['LIST_STYLE', 'PARAGRAPH_STYLE', 'PARAGRAPH_STYLE'])
check('the sample city comes from the market', [sampleCity('Manchester, NH'), sampleCity('Austin, Texas'), sampleCity('')], [{ city: 'Manchester', state: 'NH' }, { city: 'Austin', state: 'NH' }, { city: 'Manchester', state: 'NH' }])

// The extras on the create call.
check('nothing typed, nothing sent', formExtras({}), { headline: undefined, intro: undefined })
check('a headline alone is the question page headline, no card', formExtras({ headline: 'Where should we call you?' }), { headline: 'Where should we call you?', intro: undefined })
check('intro lines make a list card with the default button', formExtras({ introTitle: 'Free second opinion', introText: 'A real person calls back today\nNo obligation' }), { headline: undefined, intro: { title: 'Free second opinion', content: ['A real person calls back today', 'No obligation'], style: 'LIST_STYLE', button_text: 'Continue' } })
check('an intro with no title takes the headline as its title; one line is a paragraph', formExtras({ headline: 'Tell us about your system', introText: 'We call within the hour.', introButton: 'Get started' }), { headline: 'Tell us about your system', intro: { title: 'Tell us about your system', content: ['We call within the hour.'], style: 'PARAGRAPH_STYLE', button_text: 'Get started' } })

// The pages.
const base = { pageName: 'Belk Heating and Cooling', picked: ['FULL_NAME', 'PHONE', 'ZIP'], customs: [{ label: 'What is the unit doing?', options: ['No cooling', 'Weird noise'] }, { label: 'Anything else?', options: [] }], higherIntent: true, thankYou: 'We will call you shortly.', privacyUrl: 'https://belk.com/privacy', market: 'Manchester, NH' }
const plain = previewPages(base)
check('no intro and no cover: questions, review, thank you', plain.map((p) => p.key), ['questions', 'review', 'thanks'])
check('the prefilled fields carry the sample answers, the city from the market', plain[0].fields.filter((f) => f.prefilled).map((f) => `${f.label}: ${f.value}`), ['Full name: Jordan Lee', 'Phone number: (555) 014-2200', 'ZIP code: 03101'])
check('a custom question keeps its options; a typed one has none', plain[0].fields.filter((f) => !f.prefilled).map((f) => f.options), [['No cooling', 'Weird noise'], []])
check('Higher Intent: the questions page says Review and the review page says Submit', [plain[0].button, plain[1].button, plain[1].fields.length], ['Review', 'Submit', 5])
check('the thank-you page carries the message, and no button without a website', [plain[2].title, plain[2].body, plain[2].button], ['Thanks, we got it', 'We will call you shortly.', ''])
const volume = previewPages({ ...base, higherIntent: false, thankYou: '', websiteUrl: 'https://belk.com' })
check('More Volume: no review page, Submit on the questions, the default thank-you and a website button', [volume.map((p) => p.key), volume[0].button, volume[1].body, volume[1].button], [['questions', 'thanks'], 'Submit', 'We will be in touch shortly.', 'Visit website'])
const intro = previewPages({ ...base, headline: 'Where should we call you?', introTitle: 'Free second opinion on any quote', introText: 'A real person calls you back today\nNo obligation', introButton: '' })
check('an intro card leads with its title, its lines and Continue', [intro[0].key, intro[0].title, intro[0].lines, intro[0].button], ['intro', 'Free second opinion on any quote', ['A real person calls you back today', 'No obligation'], 'Continue'])
check('the headline sits over the questions', intro[1].headline, 'Where should we call you?')
check('a cover photo alone opens an intro page titled for the Page', previewPages({ ...base, hasCover: true })[0], { key: 'intro', label: 'Intro', title: 'Belk Heating and Cooling', lines: [], button: 'Continue' })
check('junk in is quiet', previewPages({}).map((p) => p.key), ['questions', 'review', 'thanks'])
check('the sample person has every standard field', Object.keys(SAMPLE_ANSWERS).length >= 13, true)

// The cover's shape.
check('a tall photo and a small photo each get a note; a wide one none', [coverShapeNote(1080, 1920).startsWith('A tall photo'), coverShapeNote(600, 400).startsWith('A small photo'), coverShapeNote(1600, 900), coverShapeNote(0, 0)], [true, true, '', ''])

// Reading an existing form's intro back, and starting from it.
const form = { name: 'WC_Belk', question_page_custom_headline: 'Where should we call you?', context_card: { title: 'Free second opinion', style: 'LIST_STYLE', content: ['Line one', 'Line two'], button_text: 'Get started' }, questions: [{ type: 'FULL_NAME' }] }
check('the intro card Meta returns, as the builder holds it', introOf(form), { title: 'Free second opinion', lines: ['Line one', 'Line two'], button: 'Get started' })
check('a lone string of content is one line; no card is empty', [introOf({ context_card: { title: 'T', content: 'One line' } }).lines, introOf({})], [['One line'], { title: '', lines: [], button: '' }])
const b = formToBuilder(form)
check('start from this form carries the headline and the intro', [b.headline, b.introTitle, b.introText, b.introButton], ['Where should we call you?', 'Free second opinion', 'Line one\nLine two', 'Get started'])

// The function and the Studio.
const fn = read('supabase/functions/lead-forms/index.ts')
check('the function sends the cover as a file, the intro as a context card and the headline, and reads them back on list', [fn.includes("fd.append('cover_photo'"), fn.includes('payload.context_card = JSON.stringify(card)'), fn.includes('payload.question_page_custom_headline = headline'), fn.includes('context_card{title,style,content,button_text}'), fn.includes('cover_refused')], [true, true, true, true, true])
check('a cover that is not a picture is refused before Meta sees it', fn.includes("/^data:(image\\/(?:jpeg|png|webp));base64,"), true)
const studio = read('src/components/LeadFormStudio.jsx')
check('the Studio draws the live preview and offers the cover picker', [studio.includes('<InstantFormPreview'), studio.includes('<AdImagePicker'), studio.includes('coverDataUrl(')], [true, true, true])
check('the recommender writes the intro card too', [read('supabase/functions/form-questions/index.ts').includes('intro_lines: z.array(z.string())'), read('src/lib/metaPublish.js').includes('introLines:')], [true, true])
check('no em dashes in the preview words', /[—–]/.test(read('src/components/InstantFormPreview.jsx') + read('src/lib/leadFormPreview.js')), false)

console.log(failures === 0 ? '\nAll lead form preview checks pass' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
