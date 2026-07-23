'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';

interface Photo {
  id: string;
  originalName: string;
  uploaderName: string;
  sizeBytes: number;
  uploadedAt: string;
}

export default function AdminDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    const res = await fetch('/api/pending');
    if (res.ok) setPhotos((await res.json()).photos);
    setLoading(false);
  }, []);

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error');
    if (err) setError(decodeURIComponent(err));
    (async () => {
      const data = await (await fetch('/api/auth/me')).json();
      setAuthed(Boolean(data.authenticated && data.isAdmin));
      setEmail(data.email);
      if (data.authenticated && data.isAdmin) await loadPending();
      else setLoading(false);
    })();
  }, [loadPending]);

  // Group pending photos by uploader, preserving the server's ordering.
  const groups = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const p of photos) {
      const list = map.get(p.uploaderName) ?? [];
      list.push(p);
      map.set(p.uploaderName, list);
    }
    return Array.from(map.entries());
  }, [photos]);

  const setRowBusy = (ids: string[], value: boolean) =>
    setBusy((b) => {
      const next = { ...b };
      for (const id of ids) next[id] = value;
      return next;
    });

  const act = async (endpoint: string, id: string) => {
    setRowBusy([id], true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setPhotos((prev) => prev.filter((p) => p.id !== id));
      else setError((await res.json().catch(() => ({}))).error || 'Action failed');
    } catch {
      setError('Could not reach the server');
    } finally {
      setRowBusy([id], false);
    }
  };

  const approveAll = async (uploaderName: string, ids: string[]) => {
    setRowBusy(ids, true);
    setError(null);
    try {
      const res = await fetch('/api/approve-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: uploaderName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not approve all');
      // Refetch so any items that failed to upload remain visible.
      await loadPending();
      if (data.failed) setError(`${data.failed} photo(s) could not be approved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not approve all');
    } finally {
      setRowBusy(ids, false);
    }
  };

  if (authed === null) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <h1 className="text-2xl font-medium mb-2">Admin Sign-in</h1>
          <p className="text-gray-500 mb-6 text-sm">Connect the Google account that owns the destination library.</p>
          {error && <p className="mb-4 text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
          <a href="/api/auth/login" className="inline-block bg-gphoto text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors">
            Sign in with Google
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-8">
      <header className="flex items-center justify-between mb-8 pb-4 border-b border-gray-100">
        <div>
          <h1 className="text-2xl tracking-tight">Review Pending Photos</h1>
          {email && <p className="text-sm text-gray-400">{email}</p>}
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="text-sm text-gray-500 hover:text-gray-800">Sign out</button>
        </form>
      </header>

      {error && <p className="mb-6 text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-gray-500">No pending photos. All caught up.</p>
      ) : (
        <div className="space-y-10">
          {groups.map(([uploaderName, groupPhotos]) => {
            const ids = groupPhotos.map((p) => p.id);
            const groupBusy = ids.some((id) => busy[id]);
            return (
              <section key={uploaderName}>
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-lg font-medium truncate">
                    {uploaderName}
                    <span className="ml-2 text-sm text-gray-400 font-normal">
                      ({groupPhotos.length})
                    </span>
                  </h2>
                  <button
                    onClick={() => approveAll(uploaderName, ids)}
                    disabled={groupBusy}
                    className="shrink-0 bg-gphoto text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {groupBusy ? 'Working…' : 'Approve all'}
                  </button>
                </div>
                <hr className="my-4 border-gray-200" />

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {groupPhotos.map((photo) => (
                    <div key={photo.id} className="group relative aspect-square rounded-2xl overflow-hidden bg-gray-100 border border-gray-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/image/${photo.id}`} alt={photo.originalName} loading="lazy" className="object-cover w-full h-full" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                        <button
                          onClick={() => act('/api/approve', photo.id)}
                          disabled={busy[photo.id]}
                          className="bg-gphoto text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {busy[photo.id] ? 'Working…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => act('/api/reject', photo.id)}
                          disabled={busy[photo.id]}
                          className="bg-white/90 text-gray-800 px-5 py-2 rounded-full text-sm font-medium hover:bg-white transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
