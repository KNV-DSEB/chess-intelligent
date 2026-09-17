import type { NextConfig } from 'next';

import { resolveNextOutputMode } from './next-output-mode';

const output = resolveNextOutputMode();

const nextConfig: NextConfig = {
  ...(output === undefined ? {} : { output }),
  transpilePackages: ['@chess-intelligent/ui'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return [];
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://127.0.0.1:4000'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
