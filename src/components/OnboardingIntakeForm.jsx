import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function OnboardingIntakeForm({ client, onSuccess, onClose }) {
  const [formData, setFormData] = useState({
    date_filled: new Date().toISOString().split('T')[0],
    contact_name: client.name || '',
    contact_phone: '',
    contact_email: '',
    website: '',
    industry_trade: '',
    service_area: client.market || '',
    years_in_business: '',

    services_offered: '',
    most_profitable_service: '',
    service_want_more: '',
    average_job_value: '',
    busy_season: '',

    meta_ad_budget_per_day: '',
    lsa_ad_budget_per_day: '',
    leads_needed_per_month: '',
    current_ads_what_works: '',

    ideal_customer: '',
    why_people_choose: '',
    most_common_objection: '',

    cta_offering: '',
    current_offers_guarantees: '',

    reviews_star_rating: '',
    reviews_count: '',
    has_before_after_photos: false,
    has_video_footage: false,
    has_logo: false,
    licensed_insured_certified: '',

    leads_go_to: '',
    who_answers_leads: '',
    response_time_to_lead: '',
    crm_system: '',

    has_meta_access: false,
    has_website_access: false,
    has_google_business: false,
    meta_status: 'Not started',
    lsa_status: 'Not started',
    google_status: 'Not started',

    main_goal: '',
    success_90_days: '',
    competitors_to_beat: '',
    bad_experience_past_marketers: '',
    call_notes: '',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [existingIntake, setExistingIntake] = useState(null)

  useEffect(() => {
    loadExistingIntake()
  }, [client.id])

  const loadExistingIntake = async () => {
    const { data } = await supabase
      .from('onboarding_intake')
      .select('*')
      .eq('client_id', client.id)
      .single()

    if (data) {
      setExistingIntake(data)
      setFormData(data)
    }
  }

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Clean up data: convert empty strings to null for text fields, empty to null for numbers
      const cleanData = {}
      for (const [key, value] of Object.entries(formData)) {
        if (typeof value === 'string' && value.trim() === '') {
          cleanData[key] = null
        } else if (typeof value === 'string' && ['average_job_value', 'meta_ad_budget_per_day', 'lsa_ad_budget_per_day'].includes(key)) {
          cleanData[key] = value ? parseFloat(value) : null
        } else {
          cleanData[key] = value
        }
      }

      if (existingIntake) {
        const { error } = await supabase
          .from('onboarding_intake')
          .update(cleanData)
          .eq('id', existingIntake.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('onboarding_intake').insert({
          client_id: client.id,
          ...cleanData,
        })
        if (error) throw error
      }

      // Auto-populate client budgets from intake
      if (cleanData.meta_ad_budget_per_day || cleanData.lsa_ad_budget_per_day) {
        const clientUpdate = {}
        if (cleanData.meta_ad_budget_per_day) clientUpdate.meta_budget_per_day = cleanData.meta_ad_budget_per_day
        if (cleanData.lsa_ad_budget_per_day) clientUpdate.lsa_budget_per_day = cleanData.lsa_ad_budget_per_day

        await supabase
          .from('clients')
          .update(clientUpdate)
          .eq('id', client.id)
      }

      onSuccess()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
      {/* BUSINESS */}
      <div className="border-b pb-4">
        <h3 className="font-bold text-slate-900 mb-3">BUSINESS</h3>
        <div className="space-y-2">
          <div className="col-span-2">
            <label className="text-xs font-medium text-slate-600 block mb-1">Date</label>
            <input type="date" name="date_filled" value={formData.date_filled} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Contact Name</label>
              <input type="text" name="contact_name" placeholder="John Doe" value={formData.contact_name} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Phone</label>
              <input type="text" name="contact_phone" placeholder="(555) 123-4567" value={formData.contact_phone} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Email</label>
            <input type="email" name="contact_email" placeholder="john@example.com" value={formData.contact_email} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Website</label>
            <input type="text" name="website" placeholder="www.example.com" value={formData.website} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Industry / Trade</label>
            <input type="text" name="industry_trade" placeholder="e.g. Plumbing, HVAC, Roofing" value={formData.industry_trade} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Service Area</label>
              <input type="text" name="service_area" placeholder="City/region" value={formData.service_area} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Years in Business</label>
              <input type="text" name="years_in_business" placeholder="e.g. 5" value={formData.years_in_business} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* SERVICE */}
      <div className="border-b pb-4">
        <h3 className="font-bold text-slate-900 mb-3">SERVICE</h3>
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Services Offered</label>
            <textarea name="services_offered" placeholder="List all services..." value={formData.services_offered} onChange={handleChange} rows="2" className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Most Profitable Service</label>
            <input type="text" name="most_profitable_service" placeholder="Which service makes the most money" value={formData.most_profitable_service} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Service They Want More Of</label>
            <input type="text" name="service_want_more" placeholder="Which service to push" value={formData.service_want_more} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Average Job Value</label>
            <input type="number" name="average_job_value" placeholder="$0.00" value={formData.average_job_value} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" step="0.01" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Busy / Slow Season</label>
            <input type="text" name="busy_season" placeholder="e.g. Summer/winter" value={formData.busy_season} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
        </div>
      </div>

      {/* MONEY */}
      <div className="border-b pb-4">
        <h3 className="font-bold text-slate-900 mb-3">MONEY & BUDGETS</h3>
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Meta Ad Budget ($/day)</label>
            <input type="number" name="meta_ad_budget_per_day" placeholder="$0.00" value={formData.meta_ad_budget_per_day} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" step="0.01" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">LSA Ad Budget ($/day)</label>
            <input type="number" name="lsa_ad_budget_per_day" placeholder="$0.00" value={formData.lsa_ad_budget_per_day} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" step="0.01" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Leads/Jobs Needed Per Month</label>
            <input type="text" name="leads_needed_per_month" placeholder="How many to break even" value={formData.leads_needed_per_month} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Current Ads - What's Working?</label>
            <textarea name="current_ads_what_works" placeholder="Running ads now? What works/doesn't work?" value={formData.current_ads_what_works} onChange={handleChange} rows="2" className="w-full px-2 py-1 border rounded text-sm" />
          </div>
        </div>
      </div>

      {/* CUSTOMER */}
      <div className="border-b pb-4">
        <h3 className="font-bold text-slate-900 mb-3">CUSTOMER</h3>
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Ideal Customer</label>
            <textarea name="ideal_customer" placeholder="Describe your best customer..." value={formData.ideal_customer} onChange={handleChange} rows="2" className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">What Makes Them Better Than Competitors?</label>
            <textarea name="why_people_choose" placeholder="Your unique advantages..." value={formData.why_people_choose} onChange={handleChange} rows="2" className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Most Common Objection</label>
            <input type="text" name="most_common_objection" placeholder="What do customers hesitate about?" value={formData.most_common_objection} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
        </div>
      </div>

      {/* OFFER & CTA */}
      <div className="border-b pb-4">
        <h3 className="font-bold text-slate-900 mb-3">OFFER & CTA</h3>
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">What Are We Offering to Get Leads?</label>
            <textarea name="cta_offering" placeholder="e.g. Free estimate, Paid consultation, Phone call, etc." value={formData.cta_offering} onChange={handleChange} rows="2" className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Current Offers / Guarantees</label>
            <textarea name="current_offers_guarantees" placeholder="Any current promotions or guarantees..." value={formData.current_offers_guarantees} onChange={handleChange} rows="2" className="w-full px-2 py-1 border rounded text-sm" />
          </div>
        </div>
      </div>

      {/* PROOF & ASSETS */}
      <div className="border-b pb-4">
        <h3 className="font-bold text-slate-900 mb-3">PROOF & ASSETS</h3>
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Reviews - Star Rating</label>
            <input type="text" name="reviews_star_rating" placeholder="e.g. 4.8" value={formData.reviews_star_rating} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Reviews - Count</label>
            <input type="text" name="reviews_count" placeholder="e.g. 45" value={formData.reviews_count} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="has_before_after_photos" checked={formData.has_before_after_photos} onChange={handleChange} />
            <span className="font-medium text-slate-700">Before/after photos</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="has_video_footage" checked={formData.has_video_footage} onChange={handleChange} />
            <span className="font-medium text-slate-700">Video footage</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="has_logo" checked={formData.has_logo} onChange={handleChange} />
            <span className="font-medium text-slate-700">Logo file</span>
          </label>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Licensed / Insured / Certified?</label>
            <input type="text" name="licensed_insured_certified" placeholder="e.g. Licensed & Insured" value={formData.licensed_insured_certified} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
        </div>
      </div>

      {/* LEADS & FOLLOW-UP */}
      <div className="border-b pb-4">
        <h3 className="font-bold text-slate-900 mb-3">LEADS & FOLLOW-UP</h3>
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Where Do Leads Go Now?</label>
            <input type="text" name="leads_go_to" placeholder="Phone / form / text / etc." value={formData.leads_go_to} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Who Answers Leads?</label>
            <input type="text" name="who_answers_leads" placeholder="Person/team name" value={formData.who_answers_leads} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Response Time to New Lead</label>
            <input type="text" name="response_time_to_lead" placeholder="e.g. Within 2 hours" value={formData.response_time_to_lead} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">CRM or Booking System</label>
            <input type="text" name="crm_system" placeholder="e.g. HubSpot, Calendly, etc." value={formData.crm_system} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
        </div>
      </div>

      {/* ACCESS & STATUS */}
      <div className="border-b pb-4">
        <h3 className="font-bold text-slate-900 mb-3">ACCESS & PLATFORM STATUS</h3>
        <div className="space-y-3">
          <div>
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" name="has_meta_access" checked={formData.has_meta_access} onChange={handleChange} />
              Meta Business Suite Manager
            </label>
            <select name="meta_status" value={formData.meta_status} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm">
              <option value="Not started">Not started</option>
              <option value="In progress">In progress</option>
              <option value="Active">Active</option>
              <option value="Paused">Paused</option>
              <option value="Needs work">Needs work</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-2">LSA Status</label>
            <select name="lsa_status" value={formData.lsa_status} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm">
              <option value="Not started">Not started</option>
              <option value="In progress">In progress</option>
              <option value="Active">Active</option>
              <option value="Paused">Paused</option>
              <option value="Needs work">Needs work</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" name="has_google_business" checked={formData.has_google_business} onChange={handleChange} />
              Google Business Profile
            </label>
            <select name="google_status" value={formData.google_status} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm">
              <option value="Not started">Not started</option>
              <option value="In progress">In progress</option>
              <option value="Active">Active</option>
              <option value="Paused">Paused</option>
              <option value="Needs work">Needs work</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="has_website_access" checked={formData.has_website_access} onChange={handleChange} />
            Website/landing page access
          </label>
        </div>
      </div>

      {/* GOALS */}
      <div className="pb-4">
        <h3 className="font-bold text-slate-900 mb-3">GOALS</h3>
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Main Goal</label>
            <input type="text" name="main_goal" placeholder="What's your #1 priority?" value={formData.main_goal} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Success in 90 Days Looks Like...</label>
            <input type="text" name="success_90_days" placeholder="How will you know this worked?" value={formData.success_90_days} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Competitors to Beat</label>
            <input type="text" name="competitors_to_beat" placeholder="Who's your main competition?" value={formData.competitors_to_beat} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Bad Experience with Past Marketers?</label>
            <textarea name="bad_experience_past_marketers" placeholder="Anything we should know..." value={formData.bad_experience_past_marketers} onChange={handleChange} rows="2" className="w-full px-2 py-1 border rounded text-sm" />
          </div>
        </div>
      </div>

      {/* NOTES */}
      <div className="border-t pt-4">
        <h3 className="font-bold text-slate-900 mb-3">Call Notes</h3>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Ad Creative Ideas, Follow-ups, Budget Notes</label>
          <textarea
            name="call_notes"
            placeholder="Anything else discussed on the call..."
            value={formData.call_notes}
            onChange={handleChange}
            rows="4"
            className="w-full px-2 py-1 border rounded text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-4 sticky bottom-0 bg-white border-t">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? 'Saving...' : existingIntake ? 'Update Intake' : 'Save Intake'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 bg-slate-200 text-slate-900 py-2 rounded font-medium hover:bg-slate-300 transition"
        >
          Close
        </button>
      </div>
    </form>
  )
}
