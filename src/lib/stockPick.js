// Which of a client's uploads look like a photo of equipment or a job, from
// the file name alone: the stock library's "From client photos" section
// puts these first. Pure, so scripts/check-stock.mjs can pin it.

const EQUIPMENT = /condenser|furnace|boiler|heat ?pump|mini.?split|water ?heater|tankless|\btank\b|\bunit\b|install|hvac|\bac\b|a\/c|thermostat|compressor|air ?handler|duct|generator|\bpanel\b|roof|sewer|drain|pipe|shower|softener|filter/i
const JOB = /truck|van|crew|team|owner|tech|job|work|site|before|after|selfie/i
// Finished ads come back with a size in the name; logos, screenshots and
// iPhone HEICs (which the browser cannot paint) are not stock either.
const NOT_PHOTO = /logo|screenshot|invoice|receipt|\.(heic|heif)$|-(4x5|1x1|9x16|1080)\b/i

/** 2 for equipment, 1 for a job or the crew, 0 for anything else, -1 for not a photo to use. */
export function photoScore(name) {
  const n = String(name || '')
  if (!n || NOT_PHOTO.test(n)) return -1
  if (EQUIPMENT.test(n)) return 2
  if (JOB.test(n)) return 1
  return 0
}

/** A name for the library copy: the client's file name, cleaned, no client id in it. */
export function stockName(fileName) {
  return String(fileName || 'photo')
    .replace(/^\d{10,}-/, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}
