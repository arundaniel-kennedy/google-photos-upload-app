/** @type {import('next').NextConfig} */

// Content Security Policy. All images are served from our own origin (admin
// previews via /api/image), so img-src stays locked to self.
const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  // Next.js injects small inline bootstrap scripts; 'unsafe-inline' is required
  // without a nonce setup. Scripts are otherwise restricted to our origin.
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  // better-sqlite3 is a native module and must not be bundled by webpack.
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
