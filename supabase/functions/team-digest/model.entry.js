// What the team-digest function needs from the CRM's own code, bundled by
// rolldown into model.js (`npm run brief`) so the function runs the SAME
// pipeline, flags, weekly status and brief the screens do. Edit the modules
// under src/lib, never model.js; rebuild before deploying.
export { fetchStatusRows, statusFromRows } from '../../../src/lib/statusRows.js'
export { fetchWeeklyRows } from '../../../src/lib/weeklyRows.js'
export { buildWeeklyStatus, weeklyText } from '../../../src/lib/weeklyStatus.js'
// Every name index.ts imports must be listed here: a name missing from the
// bundle fails the function at boot (BOOT_ERROR), not at the call.
export { alertKeys, alertsSlack, briefHtml, briefSlack, briefSubject, briefText, buildBrief, clientAddedSlack, diffAlerts, liveClientIds } from '../../../src/lib/teamBrief.js'
