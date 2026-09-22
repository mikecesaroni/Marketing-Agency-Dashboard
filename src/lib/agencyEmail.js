// The address clients grant access to.
//
// One constant, because this has now moved three times -- a personal Gmail,
// then another personal Gmail, then the agency's own domain -- and each move
// had to be chased through the LSA message, the GBP message, the GBP agent
// brief and a row in app_settings. The row is what let them drift apart: the
// code said one thing and the database said another, and the message a client
// actually received was whichever the panel happened to read.
//
// So it lives here. Changing it is a one-line edit, which is the same trip as
// asking for the database row to be updated, and this way every message says
// the same thing the moment it ships.
//
// The domain matters on its own: Google Local Services blocks invitations from
// outside domains until the client allows one, and the message has to name the
// right domain to allow.

export const AGENCY_EMAIL = 'marketing@workingclassgroup.com'

export const AGENCY_EMAIL_DOMAIN = AGENCY_EMAIL.split('@')[1] || ''
