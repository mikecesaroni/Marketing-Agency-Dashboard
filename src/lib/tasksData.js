// Reading and writing the task board. Thin; the rules are in tasks.js.
//
// Everything is read in one go and filtered in the browser. A five-person
// agency's task list is a few hundred rows, and reading it whole means every
// view, group and count is computed from the same data and can never
// disagree. The paged read is there for the day it passes a thousand.

import { supabase } from './supabaseClient'
import { fetchAllRows } from './pagedQuery'

export async function fetchBoard() {
  const [tasks, lists, clients, members] = await Promise.all([
    fetchAllRows(() => supabase.from('tasks').select('*').order('created_at', { ascending: true }).order('id')),
    supabase.from('task_lists').select('*').is('archived_at', null).order('sort_order').order('name'),
    supabase.from('clients').select('id,name,status').order('name'),
    supabase.from('team_members').select('*').eq('active', true).order('sort_order').order('name'),
  ])
  if (lists.error) throw lists.error
  if (clients.error) throw clients.error
  if (members.error) throw members.error
  return { tasks, lists: lists.data || [], clients: clients.data || [], members: members.data || [] }
}

// ---------------------------------------------------------------- the team

export async function createMember({ name, title, color }) {
  const { data, error } = await supabase
    .from('team_members')
    .insert({ name: name.trim(), title: title?.trim() || null, color: color || 'slate' })
    .select()
    .single()
  if (error) {
    if (String(error.code) === '23505') throw new Error(`${name.trim()} is already on the team.`)
    throw error
  }
  return data
}

export async function updateMember(id, patch) {
  const { data, error } = await supabase.from('team_members').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

/** Renames the member AND the name on every task, in one database call. */
export async function renameMember(id, newName) {
  const { error } = await supabase.rpc('rename_team_member', { member_id: id, new_name: newName.trim() })
  if (error) throw error
}

/** Off the roster, not deleted: their name stays on the tasks they had. */
export async function removeMember(id) {
  return updateMember(id, { active: false })
}

export async function createTask(fields) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: fields.title,
      description: fields.description || null,
      status: fields.status || 'todo',
      priority: fields.priority || 'normal',
      client_id: fields.client_id || null,
      list_id: fields.list_id || null,
      parent_id: fields.parent_id || null,
      assignees: fields.assignees || [],
      tags: fields.tags || [],
      start_date: fields.start_date || null,
      due_date: fields.due_date || null,
      checklist: fields.checklist || [],
      created_by: fields.created_by || null,
      repeat: fields.repeat || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Patch one task. Only the keys given are written. */
export async function updateTask(id, patch) {
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

export async function createList(name, color = 'slate') {
  const { data, error } = await supabase.from('task_lists').insert({ name, color }).select().single()
  if (error) throw error
  return data
}

export async function updateList(id, patch) {
  const { data, error } = await supabase.from('task_lists').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

/** Archive, not delete: the tasks in it go back to the inbox via on delete set null only if deleted; archiving keeps them attached. */
export async function archiveList(id) {
  return updateList(id, { archived_at: new Date().toISOString() })
}

export async function fetchComments(taskId) {
  const { data, error } = await supabase
    .from('task_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function addComment(taskId, body, author) {
  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, body, author: author || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteComment(id) {
  const { error } = await supabase.from('task_comments').delete().eq('id', id)
  if (error) throw error
}

// "Who am I" for created_by, comment authors and Me mode. Login is off, so
// this is a name typed once and kept in the browser. The SAME key the
// deliverables board uses for who ticked a step (lib/completeStep.js whoAmI),
// so a person is one name across the CRM, not one per page.
const ME_KEY = 'crm.me'

export function readMe() {
  try {
    return localStorage.getItem(ME_KEY) || ''
  } catch {
    return ''
  }
}

export function saveMe(name) {
  try {
    if (name) localStorage.setItem(ME_KEY, name)
    else localStorage.removeItem(ME_KEY)
  } catch {
    /* private window; the name just is not remembered */
  }
}
