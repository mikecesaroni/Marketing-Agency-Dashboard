import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../supabaseClient'
import { moduleKey, nextProgress, progressChanged } from './engine'

/**
 * Everything the Training page reads and writes.
 *
 * Loads the progress rows and quiz attempts row-level security allows (your
 * own; everybody's for an admin) and hands back two ways to write: `save`,
 * called every time somebody moves on a card, and `recordAttempt`, called
 * when a quiz is submitted.
 *
 * SAVING IS AUTOMATIC AND IN ORDER. The screen moves on at once and the write
 * follows; writes are chained one behind the other so two quick clicks cannot
 * land out of order and leave the older position in the table. If a write
 * fails the page says so, and the next card's write carries the whole
 * position again, so nothing needs retrying by hand.
 */
export function useTraining() {
  const { user, profile } = useAuth()
  // With login switched off there is nobody to save against. Progress is
  // kept for the visit under a stand-in id and never written.
  const uid = user?.id || 'local'
  const name = profile?.name || profile?.email || user?.email || null

  const [rows, setRows] = useState([])
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const queue = useRef(Promise.resolve())

  const loadAttempts = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('quiz_attempts')
      .select('id, user_id, name, quiz_id, score, total, passed, wrong, created_at')
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setAttempts(data || [])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error: err } = await supabase
        .from('training_progress')
        .select('user_id, module_key, name, step, total, done, version, updated_at, completed_at')
      if (cancelled) return
      if (err) setError(err.message)
      else setRows(data || [])
      await loadAttempts()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [loadAttempts])

  const save = useCallback(
    (courseId, mod, cardsDone) => {
      const key = moduleKey(courseId, mod.id)
      const row = rowsRef.current.find((r) => r.user_id === uid && r.module_key === key) || null
      const next = { ...nextProgress(courseId, mod, row, cardsDone, { name }), user_id: uid }
      if (!progressChanged(row, next)) return
      const merged = [...rowsRef.current.filter((r) => !(r.user_id === uid && r.module_key === key)), next]
      rowsRef.current = merged
      setRows(merged)
      if (!user) {
        setSaveState('error')
        return
      }
      setSaveState('saving')
      queue.current = queue.current.then(async () => {
        const { error: err } = await supabase.from('training_progress').upsert(next, { onConflict: 'user_id,module_key' })
        setSaveState(err ? 'error' : 'saved')
      })
    },
    [uid, name, user]
  )

  /** Saves one graded quiz attempt. Returns '' or the reason it was not saved. */
  const recordAttempt = useCallback(
    async (quiz, graded) => {
      if (!user) return 'Nobody is signed in, so this attempt was not saved.'
      const { error: err } = await supabase.from('quiz_attempts').insert({
        user_id: user.id,
        name,
        quiz_id: quiz.id,
        score: graded.score,
        total: graded.total,
        passed: graded.passed,
        wrong: graded.wrong,
      })
      if (err) return `This attempt was not saved: ${err.message}`
      await loadAttempts()
      return ''
    },
    [user, name, loadAttempts]
  )

  const myRows = useMemo(() => rows.filter((r) => r.user_id === uid), [rows, uid])
  const myAttempts = useMemo(() => attempts.filter((a) => a.user_id === uid), [attempts, uid])

  return { uid, loading, error, rows, attempts, myRows, myAttempts, save, saveState, recordAttempt, signedIn: Boolean(user) }
}
