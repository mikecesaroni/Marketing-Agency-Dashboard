// The dead end on the client-facing site: any address that is not one of
// the public pages. Says nothing about what else exists.
export default function NothingHerePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070b14] px-6 text-slate-300">
      <div className="max-w-sm rounded-2xl border border-white/10 bg-[#0f1626] p-6 text-sm">
        <p className="font-semibold text-white">Nothing here.</p>
        <p className="mt-2 text-slate-400">If you were sent a link, open it exactly as it was sent. Otherwise reply to the email it came in and a real person will help.</p>
      </div>
    </div>
  )
}
