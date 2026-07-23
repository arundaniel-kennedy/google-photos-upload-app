# Google Photos Portal: Project Blueprint & Agent Instructions

## 1. Architectural Thinking & Rationale

**Goal:** Create a portal where users can upload photos to a temporary staging area, allowing an admin to review and push them to Google Photos.

**Design Decisions:**
1.  **Next.js App Router:** Utilized for a unified full-stack architecture. API routes handle the backend logic, while React Server/Client components handle the UI.
2.  **SQLite (better-sqlite3):** Chosen for lightweight, zero-configuration local state management. It avoids the overhead of a dedicated database server (like Postgres) while providing reliable ACID transactions for tracking `pending` vs `approved` file states.
3.  **Local File Staging:** Files are temporarily stored on the local disk (`/public/temp/` for this MVP, though outside `/public` is better for strict security) before being pushed to Google.
4.  **Modular Services:** Google Photos API calls and Database queries are separated into `src/lib/` to keep API route handlers clean and maintain single-responsibility principles.
5.  **Production Readiness:** An `ecosystem.config.js` is included for PM2 process management, assuming a standard Nginx reverse proxy deployment environment on a Linux VPS.

---

## 2. Directory Structure

\`\`\`text
/
├── package.json
├── tailwind.config.ts
├── ecosystem.config.js       # PM2 configuration for production deployment
├── data/
│   └── .gitkeep              # Directory for SQLite database file
├── public/
│   └── temp/                 # Temporary storage for uploaded images
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx          # Public upload portal
│   │   ├── admin/
│   │   │   └── page.tsx      # Admin approval dashboard
│   │   └── api/
│   │       ├── upload/
│   │       │   └── route.ts  # Endpoint to receive files
│   │       └── approve/
│   │           └── route.ts  # Endpoint to push to Google Photos
│   └── lib/
│       ├── db.ts             # SQLite logic
│       ├── google-photos.ts  # Google API logic
│       └── errors.ts         # Custom error classes
\`\`\`

---

## 3. Configuration Files

### `package.json`
\`\`\`json
{
  "name": "google-photos-portal",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18",
    "react-dom": "^18",
    "better-sqlite3": "^10.0.0",
    "uuid": "^9.0.1",
    "formidable": "^3.5.1"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/better-sqlite3": "^7.6.10",
    "@types/uuid": "^9.0.8",
    "@types/formidable": "^3.4.5",
    "typescript": "^5",
    "tailwindcss": "^3.4.1",
    "postcss": "^8",
    "autoprefixer": "^10.0.1"
  }
}
\`\`\`

### `ecosystem.config.js`
*Thinking: Included to ensure a smooth transition to a production server environment using PM2.*
\`\`\`javascript
module.exports = {
  apps: [
    {
      name: "google-photos-portal",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};
\`\`\`

---

## 4. Library & Service Layer (`src/lib/`)

### `src/lib/errors.ts`
\`\`\`typescript
export class AppError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}
\`\`\`

### `src/lib/db.ts`
*Thinking: better-sqlite3 runs synchronously, making it incredibly fast for Next.js API routes.*
\`\`\`typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'photos.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS pending_photos (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export interface PhotoRecord {
  id: string;
  filename: string;
  filepath: string;
  status: string;
  uploaded_at: string;
}

export function insertPhoto(id: string, filename: string, filepath: string) {
  const stmt = db.prepare('INSERT INTO pending_photos (id, filename, filepath) VALUES (?, ?, ?)');
  return stmt.run(id, filename, filepath);
}

export function getPendingPhotos(): PhotoRecord[] {
  return db.prepare("SELECT * FROM pending_photos WHERE status = 'pending' ORDER BY uploaded_at DESC").all() as PhotoRecord[];
}

export function markAsApproved(id: string) {
  const stmt = db.prepare("UPDATE pending_photos SET status = 'approved' WHERE id = ?");
  return stmt.run(id);
}
\`\`\`

### `src/lib/google-photos.ts`
*Thinking: Isolated API calls. This strictly handles the two-step binary upload and media creation required by the appendonly scope.*
\`\`\`typescript
import { AppError } from './errors';

const UPLOAD_URL = "https://photoslibrary.googleapis.com/v1/uploads";
const BATCH_CREATE_URL = "https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate";

export async function uploadToGooglePhotos(fileBuffer: Buffer, fileName: string, accessToken: string) {
  const uploadRes = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${accessToken}\`,
      "Content-Type": "application/octet-stream",
      "X-Goog-Upload-File-Name": fileName,
      "X-Goog-Upload-Protocol": "raw"
    },
    body: fileBuffer
  });
  
  if (!uploadRes.ok) {
    throw new AppError("Failed to upload bytes to Google Photos", 502);
  }
  
  const uploadToken = await uploadRes.text();
  
  const createRes = await fetch(BATCH_CREATE_URL, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${accessToken}\`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      newMediaItems: [{
        description: "Uploaded via Friends Portal",
        simpleMediaItem: { uploadToken, fileName }
      }]
    })
  });
  
  if (!createRes.ok) {
    throw new AppError("Failed to create media item in Google Photos", 502);
  }
  
  return createRes.json();
}
\`\`\`

---

## 5. API Routes (`src/app/api/`)

### `src/app/api/upload/route.ts`
*Thinking: Handles the multipart form data from friends uploading on the main page. Saves temporarily to disk and logs to SQLite.*
\`\`\`typescript
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { insertPhoto } from '@/lib/db';
import path from 'path';
import fs from 'fs/promises';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = uuidv4();
    const safeFilename = \`\${id}-\${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}\`;
    const uploadDir = path.join(process.cwd(), 'public', 'temp');
    
    await fs.mkdir(uploadDir, { recursive: true });
    const filepath = path.join(uploadDir, safeFilename);
    
    await fs.writeFile(filepath, buffer);
    insertPhoto(id, safeFilename, filepath);

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
\`\`\`

### `src/app/api/approve/route.ts`
*Thinking: Validates auth, reads local file, pushes via Google Photos lib, updates SQLite, and deletes local file.*
\`\`\`typescript
import { NextResponse } from 'next/server';
import { markAsApproved } from '@/lib/db';
import { uploadToGooglePhotos } from '@/lib/google-photos';
import fs from 'fs/promises';

export async function POST(request: Request) {
  try {
    // SECURITY: Add proper session/OAuth token retrieval here.
    // For MVP, we assume a hardcoded or header-passed token.
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.split('Bearer ')[1];
    
    if (!accessToken) {
      return NextResponse.json({ error: "Missing Google Access Token" }, { status: 401 });
    }

    const { id, filename, filepath } = await request.json();

    const fileBuffer = await fs.readFile(filepath);
    await uploadToGooglePhotos(fileBuffer, filename, accessToken);
    
    markAsApproved(id);
    await fs.unlink(filepath).catch(e => console.error("Cleanup error:", e));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Approval error:", error);
    const status = error.statusCode || 500;
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status });
  }
}
\`\`\`

---

## 6. Frontend Components (`src/app/`)

### `src/app/layout.tsx`
\`\`\`tsx
import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Photo Drop',
  description: 'Upload photos for approval',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#f8f9fa] text-gray-800 antialiased">{children}</body>
    </html>
  )
}
\`\`\`

### `src/app/page.tsx`
*Thinking: Public drag-and-drop interface. Styled to look clean and minimalistic.*
\`\`\`tsx
'use client';
import { useState } from 'react';

export default function UploadPortal() {
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState("");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setIsUploading(true);
    setStatus("Uploading...");
    
    const formData = new FormData();
    formData.append('file', e.target.files[0]);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        setStatus("Upload successful! Awaiting approval.");
      } else {
        setStatus("Upload failed.");
      }
    } catch (error) {
      setStatus("Error connecting to server.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <h1 className="text-2xl font-medium mb-2">Share a Photo</h1>
        <p className="text-gray-500 mb-8 text-sm">Photos will be reviewed before syncing.</p>
        
        <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-blue-300 rounded-xl bg-blue-50 hover:bg-blue-100 cursor-pointer transition-colors">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <svg className="w-8 h-8 mb-4 text-blue-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
            </svg>
            <p className="mb-2 text-sm text-blue-600 font-medium">Click to upload</p>
          </div>
          <input type="file" className="hidden" onChange={handleUpload} accept="image/*" disabled={isUploading} />
        </label>
        
        {status && (
          <div className="mt-4 text-sm font-medium text-gray-700 p-3 bg-gray-50 rounded-lg">
            {status}
          </div>
        )}
      </div>
    </main>
  );
}
\`\`\`

### `src/app/admin/page.tsx`
*Thinking: Admin review interface mapped to Google Photos' visual style (rounded corners, blue primary actions).*
\`\`\`tsx
'use client';
import { useState, useEffect } from 'react';

// You would typically fetch this token via OAuth in a real app
const GOOGLE_TOKEN = "INSERT_OAUTH_TOKEN_HERE"; 

export default function AdminDashboard() {
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a full implementation, you'd have a GET /api/pending route
    // to fetch the SQLite rows. Mocking the fetch logic here:
    // fetch('/api/pending').then(res => res.json()).then(setPhotos);
    setLoading(false);
  }, []);

  const handleApprove = async (photo: any) => {
    try {
      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${GOOGLE_TOKEN}\`
        },
        body: JSON.stringify(photo)
      });
      if (res.ok) {
        setPhotos(photos.filter(p => p.id !== photo.id));
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-white p-8">
      <header className="flex items-center justify-between mb-8 pb-4 border-b border-gray-100">
        <h1 className="text-2xl tracking-tight">Review Pending Photos</h1>
      </header>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative aspect-square rounded-2xl overflow-hidden bg-gray-100 border border-gray-200">
              <img 
                src={\`/temp/\${photo.filename}\`} 
                alt="Pending" 
                className="object-cover w-full h-full"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button 
                  onClick={() => handleApprove(photo)}
                  className="bg-[#1a73e8] text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
\`\`\`