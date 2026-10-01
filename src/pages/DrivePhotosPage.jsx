import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { listDriveImages, driveObjectUrl } from "../lib/driveAssets";
import { driveFolders, folderUrl } from "../lib/contentHub";
import { groupByAdded, kindOf, sortNewestAdded } from "../lib/drivePhotos";
import { cached, keys } from "../lib/pageCache";
import DriveThumbImage from "../components/DriveThumb";
import Layout from "../components/Layout";
import { Card } from "../components/ui";

// Every photo in a client's linked Drive folders, newest added first, big
// enough to see, grouped by the day it was added. Click one for a full-size
// look with a way out to Drive.
//
// Read-only on purpose: the Drive token is drive.readonly, so the honest
// screen is a viewer with a door to Drive where things can be changed.

const fileUrl = (id) => `https://drive.google.com/file/d/${id}/view`;

export default function DrivePhotosPage() {
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [files, setFiles] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      await cached(
        `${keys.client(clientId)}:drive`,
        async () => {
          const { data: c, error: cErr } = await supabase
            .from("clients")
            .select("id,name,industry,drive_folder_id,extra_drive_folder_ids")
            .eq("id", clientId)
            .single();
          if (cErr) throw cErr;
          const list = driveFolders(c).length
            ? await listDriveImages(clientId)
            : [];
          return { client: c, files: list };
        },
        (d) => {
          setClient(d.client);
          setFiles(sortNewestAdded(d.files));
          setLoading(false);
        },
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFiles(null);
    setOpen(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const groups = useMemo(() => groupByAdded(files || []), [files]);
  const folders = driveFolders(client);
  const photos = (files || []).filter((f) => kindOf(f) === "photo").length;

  // Arrow keys move through the lightbox, Escape closes it.
  useEffect(() => {
    if (open === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight")
        setOpen((i) => Math.min((files?.length || 1) - 1, i + 1));
      if (e.key === "ArrowLeft") setOpen((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, files]);

  const subtitle = files
    ? `${photos} photo${photos === 1 ? "" : "s"}${files.length > photos ? `, ${files.length - photos} other file${files.length - photos === 1 ? "" : "s"}` : ""}. Newest added first, live from Drive.`
    : "Reading the folder…";
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {folders.map((f, i) => (
        <a
          key={f}
          href={folderUrl(f)}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100"
        >
          {folders.length > 1 ? `Folder ${i + 1}` : "Open in Drive"} ↗
        </a>
      ))}
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {loading ? "Reading…" : "Refresh"}
      </button>
      {client && (
        <Link
          to={`/client/${client.id}`}
          className="text-xs text-slate-500 hover:text-slate-900 hover:underline"
        >
          Client page →
        </Link>
      )}
    </div>
  );

  return (
    <Layout
      title={client ? client.name : "Drive photos"}
      subtitle={subtitle}
      actions={actions}
    >
      <div className="space-y-5">
        <Link
          to="/content?tab=drive"
          className="inline-block text-xs text-slate-500 hover:text-slate-900 hover:underline"
        >
          ← Google Drive
        </Link>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {client && folders.length === 0 && (
          <Card>
            <p className="text-sm text-slate-700">
              No Drive folder is linked for {client.name} yet.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Link one from the Google Drive door on the Content tab, or from
              the client&apos;s Ad Studio.
            </p>
          </Card>
        )}

        {files &&
          files.length === 0 &&
          folders.length > 0 &&
          !error &&
          !loading && (
            <Card>
              <p className="text-sm text-slate-700">
                The folder is connected but has no photos in it yet.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Subfolders are included. Anything added shows up on Refresh.
              </p>
            </Card>
          )}

        {groups.map((g) => (
          <section key={g.key}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {g.label}{" "}
              <span className="font-normal normal-case text-slate-400">
                · {g.files.length}
              </span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {g.files.map((f) => {
                const index = files.indexOf(f);
                const kind = kindOf(f);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setOpen(index)}
                    title={f.name}
                    className="group relative block aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-left shadow-sm transition hover:-translate-y-px hover:border-slate-400 hover:shadow"
                  >
                    <DriveThumbImage clientId={clientId} file={f} />
                    {kind !== "photo" && (
                      <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">
                        {kind}
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-[11px] text-white opacity-0 transition group-hover:opacity-100">
                      {f.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {open !== null && files?.[open] && (
          <Lightbox
            clientId={clientId}
            file={files[open]}
            index={open}
            count={files.length}
            onClose={() => setOpen(null)}
            onPrev={() => setOpen((i) => Math.max(0, i - 1))}
            onNext={() => setOpen((i) => Math.min(files.length - 1, i + 1))}
          />
        )}
      </div>
    </Layout>
  );
}

/** One file, as large as the screen allows, with its name, date and a door to Drive. */
function Lightbox({ clientId, file, index, count, onClose, onPrev, onNext }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  const kind = kindOf(file);

  useEffect(() => {
    let cancelled = false;
    setSrc("");
    setFailed(false);
    // A video or PDF has no full-size image to show, so Drive's poster is it.
    driveObjectUrl(clientId, file.id, { thumb: kind !== "photo" })
      .then((u) => !cancelled && setSrc(u))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [clientId, file.id, kind]);

  const when = file.created_time || file.modified_time;
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{file.name}</p>
          <p className="text-xs text-white/60">
            {when
              ? `Added ${new Date(when).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
              : ""}
            {file.size ? ` · ${(file.size / 1024 / 1024).toFixed(1)} MB` : ""}
            {` · ${index + 1} of ${count}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <a
            href={fileUrl(file.id)}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/25"
          >
            Open in Drive ↗
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/25"
          >
            Close
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-6">
        {src ? (
          <img
            src={src}
            alt={file.name}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p className="text-sm text-white/60">
            {failed
              ? "Drive has no preview for this file. Open it in Drive instead."
              : "Loading…"}
          </p>
        )}
        {index > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            aria-label="Previous"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-lg hover:bg-white/25"
          >
            ‹
          </button>
        )}
        {index < count - 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            aria-label="Next"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-lg hover:bg-white/25"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}
