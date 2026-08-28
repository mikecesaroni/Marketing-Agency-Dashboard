import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { driveServiceAccount } from '../lib/driveAssets'
import { copyText } from '../lib/intakeSummary'

// The photos half of onboarding, on the client's own form.
//
// Asking a client to email photos means someone here saves attachments, renames
// them and uploads them, once per batch, forever. A shared folder is asked for
// once and then keeps working: whatever they drop in it later is usable in an
// ad the moment it appears.
//
// The folder link is collected here rather than "reply and tell us the link",
// because a reply is a step that gets forgotten and then nobody notices the
// folder was shared. Saving goes through the same token-gated function the rest
// of this page uses; the client never touches a table directly.

export default function DriveFolderStep({ token, connected: initialConnected }) {
  const [connected, setConnected] = useState(Boolean(initialConnected))
  const [url, setUrl] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    driveServiceAccount()
      .then(setEmail)
      // The instructions still make sense without it; the address is the one
      // part they would have to ask us for, so it is worth not blocking on.
      .catch(() => setEmail(''))
  }, [])

  const handleCopy = async () => {
    if (!(await copyText(email))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const connect = async () => {
    setSaving(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('onboarding_link_save_drive', {
        p_token: token,
        p_url: url,
      })
      if (rpcError) throw rpcError
      setConnected(true)
      setUrl('')
    } catch (err) {
      // The function raises a bare tag rather than prose, so the wording that
      // reaches a client is chosen here.
      setError(
        /not_a_drive_folder_link/.test(err.message || '')
          ? "That does not look like a Google Drive folder link. It should start with drive.google.com and have /folders/ in it."
          : err.message || 'Could not save that link.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
      <div>
        <h3 className="font-bold text-slate-900">Photos for your ads</h3>
        <p className="text-sm text-slate-600 mt-1">
          Share one Google Drive folder with us and we can pull photos straight from it. Anything
          you add later shows up automatically, so you never have to email us pictures.
        </p>
      </div>

      {connected ? (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
          <strong>Folder connected.</strong> Add photos to it any time and we can use them right
          away. Send us a message if you want to swap it for a different folder.
        </div>
      ) : (
        <>
          <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-5">
            <li>
              In Google Drive, make a folder with your best job photos, your logo, and any team
              pictures. Photos straight off a phone are fine.
            </li>
            <li>
              Right-click the folder, choose <strong>Share</strong>, and paste in this address:
              <span className="block mt-1">
                {email ? (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="font-mono text-xs bg-white border border-slate-300 rounded px-2 py-1 hover:bg-slate-100 break-all text-left"
                  >
                    {copied ? '✓ Copied' : email}
                  </button>
                ) : (
                  <span className="text-slate-500 text-xs">
                    (ask us for the address to share with)
                  </span>
                )}
              </span>
              <span className="block text-xs text-slate-500 mt-1">
                Set it to <strong>Viewer</strong> and send. Google may warn that it is not a
                regular Google account — that is expected, it is our system. Viewer means we can
                only look at the folder; we cannot change or delete anything in it.
              </span>
            </li>
            <li>
              Then copy the folder&apos;s link (<strong>Share → Copy link</strong>) and paste it
              below.
            </li>
          </ol>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm min-w-0"
            />
            <button
              type="button"
              onClick={connect}
              disabled={saving || !url.trim()}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition whitespace-nowrap"
            >
              {saving ? 'Connecting...' : 'Connect folder'}
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <p className="text-xs text-slate-500">
            Not ready? Skip it — you can come back to this link later, and the rest of the form
            still submits without it.
          </p>
        </>
      )}
    </div>
  )
}
