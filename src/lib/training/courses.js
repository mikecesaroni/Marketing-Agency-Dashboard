// The courses, in the order Training shows them.
//
// To add a course: write it in its own file in the shape engine.js
// describes, add it here, and scripts/check-training.mjs will tell you what
// is wrong with it before anybody opens it.

import { FIELD_SERVICES_COURSE } from './fieldServices.js'
import { GOOGLE_COURSE } from './google.js'
import { META_COURSE } from './meta.js'

export const COURSES = [META_COURSE, GOOGLE_COURSE, FIELD_SERVICES_COURSE]

export const findCourse = (id) => COURSES.find((c) => c.id === id) || null
