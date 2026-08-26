import { supabase } from './supabaseClient'

export async function fetchTasks(clientId) {
  const { data, error } = await supabase
    .from('client_tasks')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function addTask(clientId, taskName) {
  const { data, error } = await supabase
    .from('client_tasks')
    .insert({ client_id: clientId, task_name: taskName, source: 'manual' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function toggleTask(taskId, currentDone) {
  const { error } = await supabase
    .from('client_tasks')
    .update({
      done: !currentDone,
      date_completed: !currentDone ? new Date().toISOString().split('T')[0] : null,
    })
    .eq('id', taskId)

  if (error) throw error
}

export async function deleteTask(taskId) {
  const { error } = await supabase.from('client_tasks').delete().eq('id', taskId)
  if (error) throw error
}

/**
 * Asks Claude to read this client's chat history — the Fireflies summaries
 * and "remember this" asides pasted into it — and pull out anything that's
 * still an open action item. Returns however many new rows it found; an
 * empty result is a normal, common outcome, not an error.
 */
export async function extractTasksFromChat(clientId) {
  const { data, error } = await supabase.functions.invoke('extract-tasks', {
    body: { client_id: clientId },
  })

  if (error) {
    const detail = data?.error || error.message || ''
    if (/not found|404/i.test(detail)) {
      throw new Error('The extract-tasks function is not deployed yet. Deploy supabase/functions/extract-tasks.')
    }
    throw new Error(detail || 'Could not pull tasks from chat')
  }
  if (data?.error) throw new Error(data.error)
  return data
}
