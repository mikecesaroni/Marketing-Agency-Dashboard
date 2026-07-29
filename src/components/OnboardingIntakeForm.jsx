import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function OnboardingIntakeForm({ client, onSuccess, onClose }) {
  const [formData, setFormData] = useState({
    date_filled: new Date().toISOString().split('T')[0],
    contact_name: client.name || '',
    contact_phone: '',
    contact_email: '',
    website: '',
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
    what_makes_different: '',

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
        <div className="grid grid-cols-2 gap-3">
          <input type="date" name="date_filled" value={formData.date_filled} onChange={handleChange} className="col-span-2 px-2 py-1 border rounded text-sm" />
          <input type="text" name="contact_name" placeholder="Contact name" value={formData.contact_name} onChange={handleChange} className="px-2 py-1 border rounded text-sm" />
          <input type="text" name="contact_phone" placeholder="Phone" value={formData.contact_phone} onChange={handleChange} className="px-2 py-1 border rounded text-sm" />
          <input type="email" name="contact_email" placeholder="Email" value={formData.contact_email} onChange={handleChange} className="col-span-2 px-2 py-1 border rounded text-sm" />
          <input type="text" name="website" placeholder="Website" value={formData.website} onChange={handleChange} className="col-span-2 px-2 py-1 border rounded text-sm" />
          <input type="text" name="service_area" placeholder="Service area" value={formData.service_area} onChange={handleChange} className="px-2 py-1 border rounded text-sm" />
          <input type="text" name="years_in_business" placeholder="Years in business" value={formData.years_in_business} onChange={handleChange} className="px-2 py-1 border rounded text-sm" />
        </div>
      </div>

      {/* SERVICE */}
      <div className="border-b pb-4">
        <h3 className="font-bold text-slate-900 mb-3">SERVICE</h3>
        <div className="space-y-2">
          <textarea name="services_offered" placeholder="Services offered" value={formData.services_offered} onChange={handleChange} rows="2" className="w-full px-2 py-1 border rounded text-sm" />
          <input type="text" name="most_profitable_service" placeholder="Most profitable service" value={formData.most_profitable_service} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          <input type="text" name="service_want_more" placeholder="Service they want more of" value={formData.service_want_more} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          <input type="number" name="average_job_value" placeholder="Average job value ($)" value={formData.average_job_value} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" step="0.01" />
          <input type="text" name="busy_season" placeholder="Busy/slow season" value={formData.busy_season} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
        </div>
      </div>

      {/* MONEY */}
      <div className="border-b pb-4">
        <h3 className="font-bold text-slate-900 mb-3">MONEY & BUDGETS</h3>
        <div className="space-y-2">
          <input type="number" name="meta_ad_budget_per_day" placeholder="Meta ad budget ($/day)" value={formData.meta_ad_budget_per_day} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" step="0.01" />
          <input type="number" name="lsa_ad_budget_per_day" placeholder="LSA ad budget ($/day)" value={formData.lsa_ad_budget_per_day} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" step="0.01" />
          <input type="text" name="leads_needed_per_month" placeholder="Leads/jobs per month to make it worth it" value={formData.leads_needed_per_month} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          <textarea name="current_ads_what_works" placeholder="Running ads now? What's working/not?" value={formData.current_ads_what_works} onChange={handleChange} rows="2" className="w-full px-2 py-1 border rounded text-sm" />
        </div>
      </div>

      {/* CUSTOMER */}
      <div className="border-b pb-4">
        <h3 className="font-bold text-slate-900 mb-3">CUSTOMER</h3>
        <div className="space-y-2">
          <textarea name="ideal_customer" placeholder="Ideal customer" value={formData.ideal_customer} onChange={handleChange} rows="2" className="w-full px-2 py-1 border rounded text-sm" />
          <textarea name="why_people_choose" placeholder="What makes them better than competitors" value={formData.why_people_choose} onChange={handleChange} rows="2" className="w-full px-2 py-1 border rounded text-sm" />
          <input type="text" name="most_common_objection" placeholder="Most common objection" value={formData.most_common_objection} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          <input type="text" name="what_makes_different" placeholder="What makes them different" value={formData.what_makes_different} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
        </div>
      </div>

      {/* PROOF & ASSETS */}
      <div className="border-b pb-4">
        <h3 className="font-bold text-slate-900 mb-3">PROOF & ASSETS</h3>
        <div className="space-y-2">
          <input type="text" name="reviews_star_rating" placeholder="Reviews: star rating" value={formData.reviews_star_rating} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          <input type="text" name="reviews_count" placeholder="Reviews: count" value={formData.reviews_count} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="has_before_after_photos" checked={formData.has_before_after_photos} onChange={handleChange} />
            Before/after photos
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="has_video_footage" checked={formData.has_video_footage} onChange={handleChange} />
            Video footage
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="has_logo" checked={formData.has_logo} onChange={handleChange} />
            Logo file
          </label>
          <input type="text" name="licensed_insured_certified" placeholder="Licensed/insured/certified?" value={formData.licensed_insured_certified} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
        </div>
      </div>

      {/* LEADS & FOLLOW-UP */}
      <div className="border-b pb-4">
        <h3 className="font-bold text-slate-900 mb-3">LEADS & FOLLOW-UP</h3>
        <div className="space-y-2">
          <input type="text" name="leads_go_to" placeholder="Where leads go now (phone/form/text)" value={formData.leads_go_to} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          <input type="text" name="who_answers_leads" placeholder="Who answers leads" value={formData.who_answers_leads} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          <input type="text" name="response_time_to_lead" placeholder="Response time to new lead" value={formData.response_time_to_lead} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          <input type="text" name="crm_system" placeholder="CRM or booking system" value={formData.crm_system} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
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
          <input type="text" name="main_goal" placeholder="Main goal" value={formData.main_goal} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          <input type="text" name="success_90_days" placeholder="Success in 90 days looks like..." value={formData.success_90_days} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          <input type="text" name="competitors_to_beat" placeholder="Competitors to beat" value={formData.competitors_to_beat} onChange={handleChange} className="w-full px-2 py-1 border rounded text-sm" />
          <textarea name="bad_experience_past_marketers" placeholder="Bad experience with past marketers?" value={formData.bad_experience_past_marketers} onChange={handleChange} rows="2" className="w-full px-2 py-1 border rounded text-sm" />
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
