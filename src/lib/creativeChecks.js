// What the account's own results say about an ad before it is saved.
//
// Every rule here came out of one study of the CRM's ad_daily table on
// 2026-09-06: 40 ads with $50 or more behind them, $18,600 of spend across
// eight clients, 436 leads. Nothing here is a marketing opinion; each warning
// names the pattern that lost money and what beat it.
//
// The findings, so the thresholds below can be argued with:
//
//   * FORMAT. Video: $37 per lead, 2.99% CTR over $10,083, one ad in
//     fourteen with no leads. Image: $53 per lead, 2.32% CTR over $8,573,
//     seven ads in twenty-six with none. Video was cheaper at five of the
//     seven clients that ran both, and paid a higher CPM to do it.
//   * OFFER SIZE. Every image ad under $100 off either produced nothing
//     ("Repair Discount" $50, 0 leads; "$500 OFF condenser swap" 0 leads) or
//     ran expensive ("$100 OFF New Furnace" $78 a lead). The winners led with
//     a number that changes a decision: "$2,500 OFF" ($34 a lead, 87 leads),
//     "FREE AIR HANDLER" ($46), "NO PAYMENTS 6 MONTHS" ($37), a "$1,200"
//     upgrade "YOURS FREE" (6.9% CTR).
//   * HOOK EMOTION ON A STATIC. Problem and fear hooks painted on an image
//     were the worst ads in the account: "Problem-Question Hook B" $258 a
//     lead, "Cost of Waiting" $66 for 0 leads, "Stop Paying To Patch A Dying
//     AC" 0.57% CTR. The same emotion WORKED in video ("Furnace Fear 60 days"
//     $40 a lead), where the clip can show the symptom. On an image the
//     hooks that pulled were offer-led and trust-led: "You Deal With The
//     Owner, Not A Call Center" 5.88% CTR, "Hard Water Is Coating Your Skin"
//     6.90%.
//   * PROOF. 8 of the 15 Studio-built ads shipped with an empty proof strip.
//     Every top-quartile ad in the account carried a rating, a review count
//     or a named guarantee somewhere in the creative.
//
// Pure on purpose: scripts/check-creative-checks.mjs imports this, so nothing
// here may touch the DOM, React or supabaseClient.

// A dollar-off below this did not move anyone in this account. Percent-off
// reads weaker still (the playbook already says so), so its bar is higher.
export const WEAK_DOLLARS_OFF = 250
export const WEAK_PERCENT_OFF = 20

// Words that mark a hook as problem- or fear-led. Matched as whole words so
// "signs" catches "3 Signs Your AC..." and not "designs".
const FEAR_WORDS =
  /\b(signs?|symptoms?|warning|dying|die|fail(s|ing|ure)?|before it'?s too late|cost of waiting|don'?t wait|struggling|breaks?( down)?|broken|leak(s|ing)?|emergency|too late|won'?t survive|problem)\b/i

// An amount that is a discount rather than a price or a give-away: "$500",
// "$1,200 off", "50% off". A bare price ("$29.95" tune-up, "$3,495") is a
// tripwire price and is judged by the playbook's price rules, not here.
function parseDiscount(amount, detail) {
  const a = String(amount || '').trim()
  const d = String(detail || '').trim()
  const isOff = /\boff\b/i.test(`${a} ${d}`)
  if (!isOff) return null
  const pct = a.match(/(\d+(?:\.\d+)?)\s*%/)
  if (pct) return { kind: 'percent', value: Number(pct[1]) }
  const usd = a.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d+)?)/)
  if (usd) return { kind: 'dollars', value: Number(usd[1]) }
  return null
}

function words(s) {
  return String(s || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function normalise(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Warnings for one ad as it stands on the artboard. Each is
 * { code, text } where text is the sentence shown to the person building
 * it, and it says what the data showed rather than "consider".
 *
 * content: { hook, offerAmount, offerDetail, subhead, proof }
 * opts.medium: 'image' (default) | 'video'. A video has no artboard, so
 * the painted-slot rules do not apply and only the offer is judged.
 */
export function creativeWarnings(content = {}, opts = {}) {
  const medium = opts.medium === 'video' ? 'video' : 'image'
  const out = []
  const { hook, offerAmount, offerDetail, subhead, proof } = content

  const discount = parseDiscount(offerAmount, offerDetail)
  if (discount) {
    const weak =
      (discount.kind === 'dollars' && discount.value < WEAK_DOLLARS_OFF) ||
      (discount.kind === 'percent' && discount.value < WEAK_PERCENT_OFF)
    if (weak) {
      out.push({
        code: 'weak_offer',
        text:
          `A ${discount.kind === 'percent' ? `${discount.value}%` : `$${discount.value}`} discount did not ` +
          `pull in this account: every image ad under $100 off produced no leads or ran over $75 a lead. ` +
          `The winners led with a number that changes a decision: "$2,500 OFF", a free component, or months with no payments.`,
      })
    }
  }

  if (medium === 'video') return out

  const h = String(hook || '').trim()
  if (h) {
    const n = words(h).length
    // Ten, not eight: "You Deal With The Owner, Not A Call Center" is nine
    // words and had the best CTR of any Studio ad. The layout fits it at
    // three lines; it is past ten that the type hits its floor.
    if (n > 10) {
      out.push({
        code: 'long_hook',
        text: `The hook is ${n} words. Past ten it drops to the smallest size the layout allows and stops reading as a headline on a phone.`,
      })
    }
    if (FEAR_WORDS.test(h) || /\?\s*$/.test(h)) {
      out.push({
        code: 'fear_static',
        text:
          'A problem or fear hook on a still image was the worst pattern in this account ("Problem-Question Hook B" $258 a lead, "Cost of Waiting" 0 leads). ' +
          'That angle works in video, where the clip shows the symptom. On an image, the hooks that pulled led with the offer or with trust: ' +
          '"You Deal With The Owner, Not A Call Center", "Hard Water Is Coating Your Skin".',
      })
    }
  }

  if (subhead?.trim() && h) {
    const hs = new Set(normalise(h).split(' '))
    const sw = normalise(subhead).split(' ').filter((w) => w.length > 3)
    const shared = sw.filter((w) => hs.has(w)).length
    if (sw.length >= 3 && shared / sw.length >= 0.6) {
      out.push({
        code: 'subhead_restates',
        text: 'The subhead restates the hook. Its job is a different fact: a timeframe, a guarantee, a number.',
      })
    }
  }

  if (!String(proof || '').trim()) {
    out.push({
      code: 'no_proof',
      text:
        'No proof strip. Every top-quartile ad in this account carried a rating, a review count or a named guarantee; 8 of 15 Studio ads shipped without one.',
    })
  }

  return out
}
