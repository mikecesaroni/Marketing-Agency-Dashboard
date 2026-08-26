// supabase-js does not parse a response body when an Edge Function call comes
// back non-2xx — `data` is null and `error.message` is always the same generic
// "Edge Function returned a non-2xx status code", no matter what the function
// actually said. The real error is JSON on `error.context`, the raw Response
// object, and reading it is the only way to surface anything more useful.
export async function readFunctionError(error) {
  const status = error?.context?.status
  const parsed = await error?.context
    ?.json?.()
    // A proxy error page, a timeout, or a body that was never JSON in the
    // first place all land here — none of those are worth failing loudly over.
    .catch(() => null)

  return {
    status,
    detail: parsed?.error || error?.message || '',
  }
}
