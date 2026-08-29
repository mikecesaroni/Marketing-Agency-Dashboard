import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

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

// Somebody asking for a task outright. The wording people actually use, not a
// command syntax nobody would remember.
const ASKS_FOR_A_TASK =
  /\b(make|add|create|log)\b[^.!?]{0,20}\b(task|to-?do|action item|reminder)|\bremind me\b|\bremember (to|this|that)\b|\bput (this|that|it) on the (task|to-?do)\b|\bfollow[- ]up on\b/i

// The vocabulary of a meeting recap rather than a conversation.
const SOUNDS_LIKE_A_RECAP =
  /\b(fireflies|otter\.ai|meeting (summary|notes|recap)|call (summary|notes|recap)|attendees|action items|next steps|transcript|recording|discussion points|agenda)\b/i

/**
 * Whether a message the agency just sent is one to pull tasks from.
 *
 * This used to run after every single turn, which is why the task list filled
 * up with things nobody meant to commit to: asking the chat to rewrite a hook
 * five times reads, to an extraction pass, as five action items. A question is
 * not a commitment, and the chat is mostly questions.
 *
 * Two things are: a call summary pasted in, and somebody saying outright that
 * this should be a task. Everything else goes through the button on the client
 * page, where a person has decided they want the sweep.
 *
 * Returns 'request', 'summary', or null.
 */
export function taskTrigger(text) {
  const body = String(text || '').trim()
  if (!body) return null

  if (ASKS_FOR_A_TASK.test(body)) return 'request'

  // A recap is bulk pasted text. The length and the line count are what
  // separate "here are the notes from the call" from somebody mentioning the
  // word "recap" in a sentence.
  const lines = body.split(/\n/).filter((l) => l.trim()).length
  const looksPasted = body.length > 400 && lines >= 4
  if (looksPasted && SOUNDS_LIKE_A_RECAP.test(body)) return 'summary'

  // Long enough to be notes and structured like them -- bullets or numbered
  // lines -- counts even without the vocabulary, since not every recap
  // announces itself.
  const bullets = body.split(/\n/).filter((l) => /^\s*([-*\u2022]|\d+[.)])\s+/.test(l)).length
  if (looksPasted && bullets >= 3) return 'summary'

  return null
}

/**
 * Asks Claude to read a call summary, an explicit request, or (from the button
 * on the client page) the whole chat history, and pull out what is still an
 * open action item. Returns however many new rows it found; an empty result is
 * a normal, common outcome, not an error.
 *
 * `focus` is the single message that triggered this, when one did. Passing it
 * keeps the pass to the thing somebody actually meant, instead of re-reading
 * months of conversation and finding new things to do in it every time.
 */
export async function extractTasksFromChat(clientId, { focus, reason } = {}) {
  const { data, error } = await supabase.functions.invoke('extract-tasks', {
    body: { client_id: clientId, focus: focus || undefined, reason: reason || undefined },
  })

  if (error) {
    const { status, detail } = await readFunctionError(error)
    if (status === 404 || /not found|404/i.test(detail)) {
      throw new Error('The extract-tasks function is not deployed yet. Deploy supabase/functions/extract-tasks.')
    }
    throw new Error(detail || 'Could not pull tasks from chat')
  }
  if (data?.error) throw new Error(data.error)
  return data
}
