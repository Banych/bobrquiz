import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bobr Quiz',
    short_name: 'Bobr Quiz',
    description:
      'Host live multiplayer quiz sessions with real-time scoring, speed bonuses, and instant leaderboards.',
    start_url: '/',
    display: 'standalone',
    background_color: '#1a120b',
    theme_color: '#c98a3e',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
