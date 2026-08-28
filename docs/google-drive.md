# Google Drive folders in the Ad Studio

Point a client at their Drive folder once, and every photo in it becomes
pickable in the Ad Studio — including one taken on a phone at a job site a
minute ago. Nothing is uploaded into the CRM and nothing is downloaded by hand.

The uploaded-files picker still works exactly as before. Drive is a second
source, not a replacement, and you can drag an image onto either picker to
upload it the old way.

## Why a service account and not "sign in with Google"

The app has no login, so there is no user whose Google account could consent to
an OAuth flow. A service account is a robot Google account that holds its own
credentials; the app authenticates as the robot, and you grant the robot access
to a folder by sharing it, exactly as you would with a person.

The credential never reaches the browser. It lives as a Supabase Edge Function
secret, and the browser only ever talks to the `drive-assets` function.

## Setup, once

1. Go to <https://console.cloud.google.com/> and create a project (or reuse
   one).
2. **Enable the Drive API**: APIs & Services → Library → "Google Drive API" →
   Enable. Skipping this is the most common cause of a `403` later.
3. **APIs & Services → Credentials → Create credentials → Service account.**
   Name it something recognisable like `crm-drive`. No roles are needed — Drive
   access comes from folder sharing, not from IAM roles.
4. Open the new service account → **Keys → Add key → Create new key → JSON.**
   A file downloads. It contains a private key; treat it like a password.
5. Copy the service account's email. For this project it is
   `crm-drive@marketing-dashboard-crm.iam.gserviceaccount.com`. You do not need
   to keep it handy — the Drive tab shows it and copies it on click.
6. In Supabase: **Project Settings → Edge Functions → Secrets → Add new
   secret.**
   - Name: `GOOGLE_SERVICE_ACCOUNT_JSON`
   - Value: the **entire contents** of the JSON file, pasted as one value.
     Do not reformat it or strip the newlines inside `private_key`.

## Setup, per client

1. In Drive, open the client's folder → **Share**.
2. Paste the service account email, set it to **Viewer**, and send. Drive may
   warn that this address is not a Google account; that is expected. The Drive
   tab in the Studio displays the address and copies it when clicked, so it does
   not have to be typed from memory.
3. Copy the folder link (`Share → Copy link`).
4. In the CRM, open the client → Ad Studio → the **Drive** tab on either image
   picker → paste the link → **Link**.

The app parses the folder ID out of the link, so any of Drive's URL shapes work.
Only the ID is stored.

## What it does and does not do

- **Read-only.** The token is scoped to `drive.readonly`. The app cannot
  modify, move or delete anything in the client's Drive.
- **Direct children only.** Subfolders are not searched. Drive has no cheap
  recursive listing, and walking a tree every time the picker opens would be
  slow. Keep the ad photos in one folder.
- **Images only.** The listing filters to `image/*`, and the byte proxy refuses
  anything that is not an image.
- **iPhone HEIC photos work.** They are the common case for job-site photos and
  no browser can decode them, so anything outside the set browsers can render
  (JPEG, PNG, WebP, GIF, BMP, AVIF) is served as Drive's own rendered JPEG at up
  to 2048px instead of the raw file. Thumbnails always come from Drive's
  renderer. Nothing needs converting by hand.
- **Nothing is duplicated.** The source photo stays in Drive and is read on
  demand. Only the *finished composited ad* is written to the Supabase bucket —
  that part is unchanged, and it has to happen because Meta fetches the final
  image by URL with no authentication.
- **A folder is scoped to its client.** The byte proxy checks that the requested
  file really is in that client's linked folder before returning it, so one
  client's `client_id` cannot be used to read another's photos even though a
  single service account can see all of them.

## Saved ads

A saved ad stores which photo it used. When the photo came from Drive it stores
a reference, not a copy, so **deleting the photo from Drive will break
re-editing that saved ad.** The ad images already exported or published are
unaffected — those are PNGs in the bucket.

## Troubleshooting

| What you see | Cause |
| --- | --- |
| "not deployed yet" | `drive-assets` has not been deployed to this project. |
| "GOOGLE_SERVICE_ACCOUNT_JSON is not set" | The secret is missing. Step 6 above. |
| "not valid JSON" | The key file was reformatted on paste. Paste it raw. |
| "Google refused the service account credentials" | Usually a deleted or disabled key. Create a new JSON key. |
| `404` / "check the folder is shared" | The folder was never shared with the service account email, or the Drive API is not enabled. |
| "browsers cannot display ... Re-save it as a JPEG" | A format outside the renderable set that Drive also has no preview for. Rare; re-save the file. |
| Folder lists 0 photos | The link pointed at the wrong folder, the images sit in a subfolder, or the files are not images. |
| "That file is not in this client's Drive folder" | The client's linked folder was changed after the ad was built. Re-pick the photo. |

## Verified

The credential chain (PEM key -> RS256 JWT -> Google token exchange ->
authenticated Drive call) has been exercised against this project's real
secret. `whoami` returns the service account address, and a request for a
folder that does not exist comes back as Drive's own "File not found" rather
than a credentials error — which is only reachable once Google has accepted the
token.

Still unproven until a real folder is shared: listing an actual folder,
thumbnails, and compositing a Drive photo onto an artboard.

## Shared drives

Folders on a Shared drive work — the listing passes `supportsAllDrives`. Share
the folder with the service account the same way. Without those parameters a
Shared drive folder returns an empty list rather than an error, which is a
confusing way to discover the folder was fine all along.
