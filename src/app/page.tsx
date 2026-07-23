'use client';
import { useEffect, useState } from 'react';

type Result = { name: string; ok: boolean; message: string };

export default function UploadPortal() {
  const [name, setName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error');
    if (err) setError(decodeURIComponent(err));
  }, []);

  const uploadOne = async (file: File): Promise<Result> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name.trim());
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) return { name: file.name, ok: true, message: 'Uploaded — awaiting review' };

      // A JSON error comes from our API; a proxy limit (e.g. Nginx 413) returns
      // HTML, so fall back to a status-based message instead of swallowing it.
      let serverMsg = '';
      if ((res.headers.get('content-type') || '').includes('application/json')) {
        serverMsg = (await res.json().catch(() => ({}))).error || '';
      }
      const byStatus: Record<number, string> = {
        403: 'Upload was blocked by the server (origin check).',
        413: 'This photo is too large to upload.',
        415: 'That file type is not supported.',
      };
      return {
        name: file.name,
        ok: false,
        message: serverMsg || byStatus[res.status] || `Upload failed (HTTP ${res.status}).`,
      };
    } catch {
      return { name: file.name, ok: false, message: 'Could not reach the server' };
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;
    if (!name.trim()) {
      setError('Please enter your name first.');
      return;
    }
    setError(null);
    setIsUploading(true);
    setResults([]);
    const collected: Result[] = [];
    for (const file of files) {
      collected.push(await uploadOne(file));
      setResults([...collected]);
    }
    setIsUploading(false);
  };

  const nameMissing = !name.trim();

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <h1 className="text-2xl font-medium mb-2">Share the Photos with Dany</h1>
        <p className="text-gray-500 mb-6 text-sm">
          Photos will be reviewed before syncing to Google Photos.
        </p>

        {error && (
          <p className="mb-4 text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>
        )}

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={60}
          className="w-full mb-4 px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-gphoto/40"
        />

        <label
          className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl transition-colors ${
            nameMissing
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
              : 'border-blue-300 bg-blue-50 hover:bg-blue-100 cursor-pointer'
          }`}
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <svg className="w-8 h-8 mb-3 text-blue-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2" />
            </svg>
            <p className="mb-1 text-sm text-blue-600 font-medium">
              {isUploading ? 'Uploading…' : nameMissing ? 'Enter your name to upload' : 'Click to upload'}
            </p>
            <p className="text-xs text-blue-400">You can select multiple images</p>
          </div>
          <input type="file" className="hidden" onChange={handleUpload} accept="image/*" multiple disabled={isUploading || nameMissing} />
        </label>

        {results.length > 0 && (
          <ul className="mt-4 space-y-2 text-left">
            {results.map((r, i) => (
              <li key={i} className={`text-sm p-3 rounded-lg flex items-start gap-2 ${r.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                <span aria-hidden>{r.ok ? '✓' : '✕'}</span>
                <span>
                  <span className="font-medium break-all">{r.name}</span>
                  <br />
                  {r.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
