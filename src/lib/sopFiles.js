import { supabase } from './supabaseClient'

export const BUCKET = 'client-files'

// PDFs are the point, but a procedure often ships with the spreadsheet or slide
// deck it refers to, so those are allowed rather than forcing a re-export.
export const ACCEPTED = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'image/png',
  'image/jpeg',
]

// Comfortably under Supabase's own 50MB limit, and past the point where a
// document belongs in a document store rather than an SOP.
export const MAX_BYTES = 25 * 1024 * 1024

export function publicUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export function isPdf(file) {
  return file.file_type === 'application/pdf' || /\.pdf$/i.test(file.file_name)
}

export function formatSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export async function fetchSopFiles(sopId) {
  const { data, error } = await supabase
    .from('sop_files')
    .select('*')
    .eq('sop_id', sopId)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Uploads one file and records it.
 *
 * The storage write is checked, and so is the row insert: supabase-js returns
 * errors rather than throwing them, and an unchecked insert leaves a file in
 * the bucket that nothing in the app can ever see.
 */
export async function uploadSopFile(sopId, file) {
  if (file.size > MAX_BYTES) {
    throw new Error(`${file.name} is ${formatSize(file.size)}. The limit is ${formatSize(MAX_BYTES)}.`)
  }
  if (file.type && !ACCEPTED.includes(file.type)) {
    throw new Error(`${file.type || 'That file type'} is not accepted. PDFs and documents only.`)
  }

  // The original name is kept in the row; the path is made safe and unique so
  // two people uploading "checklist.pdf" do not overwrite each other.
  const safe = file.name.replace(/[^\w.-]/g, '_')
  const path = `sops/${sopId}/${Date.now()}-${safe}`

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/pdf',
  })
  if (upErr) throw upErr

  const { data, error } = await supabase
    .from('sop_files')
    .insert({
      sop_id: sopId,
      file_name: file.name,
      file_type: file.type || 'application/pdf',
      file_size: file.size,
      storage_path: path,
    })
    .select()
    .single()

  if (error) {
    // Do not leave the bucket holding a file no row points at.
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  return data
}

export async function deleteSopFile(file) {
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([file.storage_path])
  if (rmErr) throw rmErr
  const { error } = await supabase.from('sop_files').delete().eq('id', file.id)
  if (error) throw error
}
