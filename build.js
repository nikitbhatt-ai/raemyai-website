#!/usr/bin/env node
// Static site builder for Raemy AI
// - Generates /posts/{slug}.html from posts.json
// - Generates sitemap.xml
// Run: node build.js

const fs = require('fs');
const path = require('path');

const SITE = 'https://raemyai.com';
const ROOT = __dirname;
const POSTS_JSON = path.join(ROOT, 'posts.json');
const POSTS_DIR = path.join(ROOT, 'posts');
const SITEMAP = path.join(ROOT, 'sitemap.xml');

const posts = JSON.parse(fs.readFileSync(POSTS_JSON, 'utf8'));

if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeAttr = (s) => escapeHtml(s);
const formatDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

function relatedFor(post) {
  const sameCat = posts.filter(p => p.slug !== post.slug && p.category === post.category).slice(0, 3);
  if (sameCat.length >= 3) return sameCat;
  const fill = posts.filter(p => p.slug !== post.slug && !sameCat.includes(p)).slice(0, 3 - sameCat.length);
  return sameCat.concat(fill);
}

function renderPostHtml(post) {
  const url = `${SITE}/posts/${post.slug}.html`;
  const description = post.excerpt.replace(/\s+/g, ' ').trim().slice(0, 158);
  const ogImage = `${SITE}/og-image.png`;
  const bodyParagraphs = post.content.split('\n\n').map(p => `<p>${escapeHtml(p)}</p>`).join('\n        ');
  const dateDisplay = formatDate(post.date);
  const related = relatedFor(post).map(p => `
        <div class="related-card">
          <span class="post-category">${escapeHtml(p.category)}</span>
          <h4><a href="/posts/${p.slug}.html">${escapeHtml(p.title)}</a></h4>
          <p>${escapeHtml(p.excerpt)}</p>
          <a href="/posts/${p.slug}.html" class="read-more">Read →</a>
        </div>`).join('');

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": post.excerpt,
    "image": ogImage,
    "datePublished": post.date,
    "dateModified": post.date,
    "author": { "@type": "Organization", "name": "Raemy AI", "url": SITE },
    "publisher": {
      "@type": "Organization",
      "name": "Raemy AI",
      "logo": { "@type": "ImageObject", "url": ogImage }
    },
    "mainEntityOfPage": { "@type": "WebPage", "@id": url },
    "articleSection": post.category,
    "keywords": post.keywords || ""
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/" },
      { "@type": "ListItem", "position": 2, "name": "Blog", "item": SITE + "/blog.html" },
      { "@type": "ListItem", "position": 3, "name": post.title, "item": url }
    ]
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(post.title)} — Raemy AI</title>
<meta name="description" content="${escapeAttr(description)}">
${post.keywords ? `<meta name="keywords" content="${escapeAttr(post.keywords)}">` : ''}
<meta name="author" content="Raemy AI">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="${url}">

<meta property="og:type" content="article">
<meta property="og:title" content="${escapeAttr(post.title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Raemy AI">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="article:published_time" content="${post.date}">
<meta property="article:section" content="${escapeAttr(post.category)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(post.title)}">
<meta name="twitter:description" content="${escapeAttr(description)}">
<meta name="twitter:image" content="${ogImage}">

<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>

<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #0B1F3A; --navy-mid: #152E52; --navy-light: #1E3D6B;
    --green: #2D6A4F; --green-mid: #40916C; --green-light: #74C69D;
    --green-pale: #D8F3DC; --cream: #F8F6F1; --white: #FFFFFF;
    --gray-100: #F4F4F2; --gray-200: #E8E8E4; --gray-400: #9A9A94;
    --gray-600: #5C5C58; --gray-800: #2C2C2A;
    --serif: 'DM Serif Display', Georgia, serif;
    --sans: 'DM Sans', system-ui, sans-serif;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: var(--sans); color: var(--gray-800); background: var(--white); line-height: 1.7; -webkit-font-smoothing: antialiased; }
  nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; background: rgba(255,255,255,0.96); backdrop-filter: blur(12px); border-bottom: 1px solid var(--gray-200); padding: 0 5%; height: 68px; display: flex; align-items: center; justify-content: space-between; }
  .nav-logo { font-family: var(--serif); font-size: 22px; color: var(--navy); text-decoration: none; }
  .nav-logo span { color: var(--green-mid); }
  .nav-links { display: flex; align-items: center; gap: 36px; list-style: none; }
  .nav-links a { font-size: 14px; color: var(--gray-600); text-decoration: none; transition: color 0.2s; }
  .nav-links a:hover { color: var(--navy); }
  .nav-cta { background: var(--navy) !important; color: var(--white) !important; padding: 10px 22px !important; border-radius: 6px !important; font-weight: 500 !important; }
  .post-hero { padding: 120px 5% 60px; background: var(--cream); border-bottom: 1px solid var(--gray-200); }
  .post-hero-inner { max-width: 760px; margin: 0 auto; }
  .back-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--gray-400); text-decoration: none; margin-bottom: 32px; transition: color 0.2s; }
  .back-link:hover { color: var(--navy); }
  .post-meta { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  .post-category { font-size: 12px; font-weight: 500; background: var(--green-pale); color: var(--green); padding: 3px 10px; border-radius: 4px; }
  .post-date, .post-read { font-size: 13px; color: var(--gray-400); }
  .post-hero h1 { font-family: var(--serif); font-size: clamp(30px, 4vw, 46px); color: var(--navy); line-height: 1.15; letter-spacing: -0.5px; }
  .post-body { padding: 60px 5%; }
  .post-body-inner { max-width: 760px; margin: 0 auto; }
  .post-content { font-size: 17px; color: #3a3a36; line-height: 1.85; font-weight: 300; }
  .post-content p { margin-bottom: 24px; }
  .post-cta { background: var(--navy); border-radius: 16px; padding: 48px; margin: 60px 0; text-align: center; }
  .post-cta h3 { font-family: var(--serif); font-size: 28px; color: var(--white); margin-bottom: 12px; }
  .post-cta p { font-size: 15px; color: rgba(255,255,255,0.55); font-weight: 300; margin-bottom: 24px; }
  .post-cta a { display: inline-block; background: var(--green-mid); color: var(--white); padding: 13px 28px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500; transition: background 0.2s; }
  .post-cta a:hover { background: var(--green); }
  .related-section { border-top: 1px solid var(--gray-200); padding: 60px 5%; }
  .related-inner { max-width: 1200px; margin: 0 auto; }
  .related-title { font-family: var(--serif); font-size: 28px; color: var(--navy); margin-bottom: 32px; }
  .related-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .related-card { border: 1px solid var(--gray-200); border-radius: 12px; padding: 24px; transition: all 0.2s; }
  .related-card:hover { border-color: var(--green-mid); transform: translateY(-2px); }
  .related-card .post-category { margin-bottom: 12px; display: inline-block; }
  .related-card h4 { font-family: var(--serif); font-size: 17px; color: var(--navy); line-height: 1.3; margin-bottom: 12px; }
  .related-card h4 a { text-decoration: none; color: inherit; }
  .related-card h4 a:hover { color: var(--green-mid); }
  .related-card p { font-size: 13px; color: var(--gray-600); line-height: 1.6; font-weight: 300; margin-bottom: 16px; }
  .read-more { color: var(--navy); font-size: 13px; font-weight: 500; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
  .read-more:hover { color: var(--green-mid); }
  footer { background: var(--gray-800); padding: 48px 5%; }
  .footer-inner { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 24px; }
  .footer-logo { font-family: var(--serif); font-size: 20px; color: var(--white); text-decoration: none; }
  .footer-logo span { color: var(--green-light); }
  .footer-links { display: flex; gap: 28px; list-style: none; flex-wrap: wrap; }
  .footer-links a { font-size: 13px; color: rgba(255,255,255,0.4); text-decoration: none; }
  .footer-copy { font-size: 12px; color: rgba(255,255,255,0.25); width: 100%; text-align: center; margin-top: 24px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.06); }
  @media (max-width: 900px) { .related-grid { grid-template-columns: 1fr; } .nav-links { display: none; } }
</style>
</head>
<body>

<nav>
  <a href="/index.html" class="nav-logo">raemy<span>ai</span></a>
  <ul class="nav-links">
    <li><a href="/index.html#solutions">Solutions</a></li>
    <li><a href="/health.html">Health</a></li>
    <li><a href="/legal.html">Legal</a></li>
    <li><a href="/trades.html">Trades</a></li>
    <li><a href="/hospitality.html">Hospitality</a></li>
    <li><a href="/about.html">About</a></li>
    <li><a href="/blog.html">Blog</a></li>
    <li><a href="/index.html#audit" class="nav-cta">Get Free Audit</a></li>
  </ul>
</nav>

<article>
<div class="post-hero">
  <div class="post-hero-inner">
    <a href="/blog.html" class="back-link">← Back to Blog</a>
    <div class="post-meta">
      <span class="post-category">${escapeHtml(post.category)}</span>
      <time class="post-date" datetime="${post.date}">${dateDisplay}</time>
      <span class="post-read">${escapeHtml(post.readTime)}</span>
    </div>
    <h1>${escapeHtml(post.title)}</h1>
  </div>
</div>

<div class="post-body">
  <div class="post-body-inner">
    <div class="post-content">
        ${bodyParagraphs}
    </div>
    <div class="post-cta">
      <h3>Ready to reclaim your time?</h3>
      <p>Get a free 60-minute operations audit — we'll map exactly where your business is losing time and money, and show you how automation fixes it.</p>
      <a href="/index.html#audit">Get Your Free Audit</a>
    </div>
  </div>
</div>
</article>

<aside class="related-section">
  <div class="related-inner">
    <h2 class="related-title">More from the blog</h2>
    <div class="related-grid">${related}
    </div>
  </div>
</aside>

<footer>
  <div class="footer-inner">
    <a href="/index.html" class="footer-logo">raemy<span>ai</span></a>
    <ul class="footer-links">
      <li><a href="/index.html#solutions">Solutions</a></li>
      <li><a href="/health.html">Health</a></li>
      <li><a href="/legal.html">Legal</a></li>
      <li><a href="/trades.html">Trades</a></li>
      <li><a href="/hospitality.html">Hospitality</a></li>
      <li><a href="/about.html">About</a></li>
      <li><a href="/blog.html">Blog</a></li>
      <li><a href="/glossary.html">Glossary</a></li>
      <li><a href="/index.html#audit">Free Audit</a></li>
    </ul>
    <div class="footer-copy">© 2026 Raemy AI. Houston, TX.</div>
  </div>
</footer>

</body>
</html>
`;
}

// Generate post pages
let writtenCount = 0;
for (const post of posts) {
  const outPath = path.join(POSTS_DIR, `${post.slug}.html`);
  fs.writeFileSync(outPath, renderPostHtml(post));
  writtenCount++;
}
console.log(`Wrote ${writtenCount} post pages to /posts/`);

// Generate sitemap
const today = new Date().toISOString().slice(0, 10);
const staticUrls = [
  { loc: `${SITE}/`, lastmod: today, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE}/index.html`, lastmod: today, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE}/health.html`, lastmod: today, changefreq: 'monthly', priority: '0.9' },
  { loc: `${SITE}/legal.html`, lastmod: today, changefreq: 'monthly', priority: '0.9' },
  { loc: `${SITE}/trades.html`, lastmod: today, changefreq: 'monthly', priority: '0.9' },
  { loc: `${SITE}/hospitality.html`, lastmod: today, changefreq: 'monthly', priority: '0.9' },
  { loc: `${SITE}/about.html`, lastmod: today, changefreq: 'monthly', priority: '0.8' },
  { loc: `${SITE}/services/ai-strategy.html`, lastmod: today, changefreq: 'monthly', priority: '0.8' },
  { loc: `${SITE}/services/ai-implementation.html`, lastmod: today, changefreq: 'monthly', priority: '0.8' },
  { loc: `${SITE}/services/fractional-ai-officer.html`, lastmod: today, changefreq: 'monthly', priority: '0.8' },
  { loc: `${SITE}/glossary.html`, lastmod: today, changefreq: 'monthly', priority: '0.7' },
  { loc: `${SITE}/ai-readiness-assessment.html`, lastmod: today, changefreq: 'monthly', priority: '0.8' },
  { loc: `${SITE}/blog.html`, lastmod: today, changefreq: 'weekly', priority: '0.8' }
];

const postUrls = posts.map(p => ({
  loc: `${SITE}/posts/${p.slug}.html`,
  lastmod: p.date,
  changefreq: 'monthly',
  priority: '0.7'
}));

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...postUrls].map(u => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

fs.writeFileSync(SITEMAP, sitemap);
console.log(`Wrote sitemap.xml with ${staticUrls.length + postUrls.length} URLs`);
