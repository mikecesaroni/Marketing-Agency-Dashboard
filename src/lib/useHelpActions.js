import { useEffect, useRef } from 'react'
import { registerHelpActions } from './helpActions'

/**
 * Registers what this component can do for the help chat, for as long as it
 * is mounted. `spec` is rebuilt every render and read through a ref, so the
 * tools always see the latest state and handlers without re-registering.
 *
 *   useHelpActions('publish', {
 *     label: 'Publish page',
 *     state: () => ({ ... }),
 *     tools: [{ name, description, input_schema, confirm?, run(input) }],
 *   })
 */
export function useHelpActions(scope, spec) {
  const latest = useRef(spec)
  latest.current = spec
  useEffect(() => {
    const names = (latest.current.tools || []).map((t) => t.name)
    const tools = names.map((name) => {
      const first = latest.current.tools.find((t) => t.name === name)
      return {
        name,
        description: first.description,
        input_schema: first.input_schema,
        confirm: Boolean(first.confirm),
        confirmText: first.confirmText,
        run: (input) => {
          const now = (latest.current.tools || []).find((t) => t.name === name)
          if (!now) return { error: `${name} is no longer on this page.` }
          return now.run(input)
        },
      }
    })
    return registerHelpActions(scope, {
      label: latest.current.label,
      tools,
      state: () => latest.current.state?.(),
    })
  }, [scope])
}
