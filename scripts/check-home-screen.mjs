// Self-check for "Add to Home Screen" on a client's page: the CRM manifest
// comes off, the icon is named for the page, and both come back on a CRM
// page. Run: node scripts/check-home-screen.mjs

import { applyHomeScreen, homeScreenLabel } from '../src/lib/homeScreen.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

check('each client page names its icon', ['/dashboard/abc', '/report/abc', '/approve/abc', '/onboarding/abc', '/scripts/abc', '/videos/abc'].map(homeScreenLabel), ['KPI Dashboard', 'Weekly Report', 'Ad Approval', 'Onboarding', 'Video Scripts', 'My Videos'])
check('a CRM page is left alone', ['/', '/clients', '/client/abc', '/dashboard', '/login'].map(homeScreenLabel), ['', '', '', '', ''])

// A stand-in for the document: a head with the manifest link and the iOS
// title, the way index.html has them.
function fakeDoc() {
  const head = { children: [] }
  const node = (tag, attrs) => {
    const el = { tag, attrs: { ...attrs }, parentNode: null, nextSibling: null }
    el.getAttribute = (k) => (k in el.attrs ? el.attrs[k] : null)
    el.setAttribute = (k, v) => {
      el.attrs[k] = v
    }
    return el
  }
  const link = node('link', { rel: 'manifest', href: '/manifest.webmanifest' })
  const meta = node('meta', { name: 'apple-mobile-web-app-title', content: 'Working Class' })
  const relink = () => {
    for (let i = 0; i < head.children.length; i++) {
      head.children[i].parentNode = head
      head.children[i].nextSibling = head.children[i + 1] || null
    }
  }
  head.removeChild = (el) => {
    head.children = head.children.filter((c) => c !== el)
    el.parentNode = null
    relink()
  }
  head.insertBefore = (el, before) => {
    const i = before ? head.children.indexOf(before) : -1
    if (i < 0) head.children.push(el)
    else head.children.splice(i, 0, el)
    relink()
  }
  head.children = [link, meta]
  relink()
  const doc = {
    head,
    querySelector: (sel) => {
      if (sel === 'link[rel="manifest"]') return head.children.find((c) => c.tag === 'link' && c.attrs.rel === 'manifest') || null
      if (sel === 'meta[name="apple-mobile-web-app-title"]') return head.children.find((c) => c.tag === 'meta') || null
      return null
    },
  }
  return { doc, head, link, meta }
}

const { doc, head, link, meta } = fakeDoc()
const restore = applyHomeScreen(doc, 'KPI Dashboard')
check('on a client page the CRM manifest is gone, so the icon saves the page itself', head.children.includes(link), false)
check('...and the icon is named for the page', meta.attrs.content, 'KPI Dashboard')
restore()
check('back on a CRM page the manifest is back where it was, first in the head', head.children.indexOf(link), 0)
check('...and the iOS title is the CRM again', meta.attrs.content, 'Working Class')
check('applying twice and restoring twice is harmless', (() => {
  const r1 = applyHomeScreen(doc, 'Weekly Report')
  const r2 = applyHomeScreen(doc, 'Weekly Report')
  r2()
  r1()
  return [head.children.filter((c) => c === link).length, meta.attrs.content]
})(), [1, 'Working Class'])
check('a document with neither tag is fine', (() => {
  const r = applyHomeScreen({ querySelector: () => null }, 'KPI Dashboard')
  r()
  return 'ok'
})(), 'ok')

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
