// The app is noindex (see app/layout.js); crawlers may fetch pages to read that, but not the API.
export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: 'https://www.nexoclip.com/sitemap.xml',
  };
}
