// The standard instant-form fields the CRM offers. Pure, so the check scripts
// and leadFormDetails can import it without the Supabase client.
export const FORM_QUESTIONS = [
  { type: 'FULL_NAME', label: 'Full name', prefilled: true },
  { type: 'PHONE', label: 'Phone number', prefilled: true },
  { type: 'EMAIL', label: 'Email', prefilled: true },
  { type: 'STREET_ADDRESS', label: 'Street address', prefilled: true },
  { type: 'CITY', label: 'City', prefilled: true },
  { type: 'ZIP', label: 'ZIP code', prefilled: true },
]
