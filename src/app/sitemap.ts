import type { MetadataRoute } from 'next';
import { SITE_URL } from '@lib/site-url';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/join`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/host`, changeFrequency: 'monthly', priority: 0.8 },
  ];
}
