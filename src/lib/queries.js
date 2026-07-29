import { supabase } from './supabaseClient'

function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

function formatDate(date) {
  return date.toISOString().split('T')[0]
}

export async function fetchClientsWithKPIs() {
  const thisMonday = formatDate(getMonday(new Date()))

  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('*')
    .order('date_added', { ascending: false })

  if (clientsError) throw clientsError

  const clientsWithKPIs = await Promise.all(
    clients.map(async (client) => {
      const { data: kpis, error: kpisError } = await supabase
        .from('weekly_kpis')
        .select('*')
        .eq('client_id', client.id)
        .eq('week_of', thisMonday)

      if (kpisError) throw kpisError

      const metaKPIs = kpis.filter((k) => k.channel === 'Meta')
      const lsaKPIs = kpis.filter((k) => k.channel === 'LSA')

      const metaSpend = metaKPIs.reduce((sum, k) => sum + (k.ad_spend || 0), 0)
      const metaLeads = metaKPIs.reduce((sum, k) => sum + (k.leads || 0), 0)

      const lsaSpend = lsaKPIs.reduce((sum, k) => sum + (k.ad_spend || 0), 0)
      const lsaLeads = lsaKPIs.reduce((sum, k) => sum + (k.leads || 0), 0)

      const totalSpend = metaSpend + lsaSpend
      const totalLeads = metaLeads + lsaLeads
      const costPerLead = totalLeads > 0 ? totalSpend / totalLeads : 0

      return {
        ...client,
        thisWeekMetaSpend: metaSpend,
        thisWeekMetaLeads: metaLeads,
        thisWeekLsaSpend: lsaSpend,
        thisWeekLsaLeads: lsaLeads,
        thisWeekTotalSpend: totalSpend,
        thisWeekTotalLeads: totalLeads,
        thisWeekCostPerLead: costPerLead,
        hasMissingKPIs: totalSpend === 0 && totalLeads === 0,
      }
    })
  )

  return clientsWithKPIs
}
