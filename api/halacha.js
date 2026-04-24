/**
 * Vercel serverless function — Daily Halacha from פניני הלכה (ph.yhb.org.il)
 *
 * The site cycles through all 3696 posts in ID order, 2 per day.
 * Anchor: April 24, 2026 = offset 172 (posts #172 and #173 by ID order)
 * So cycle start = April 24, 2026 - 86 days = January 28, 2026
 */

const WP_API = 'https://ph.yhb.org.il/wp-json/wp/v2/posts';
const TOTAL_POSTS = 3696;
const POSTS_PER_DAY = 2;
const CYCLE_LENGTH = TOTAL_POSTS / POSTS_PER_DAY; // 1848 days

// Anchor: on this date, the offset is this value
const ANCHOR_DATE = new Date('2026-01-28T00:00:00Z'); // cycle start (day 0)

function getTodayOffset() {
  const now = new Date();
  const israelTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const today = new Date(israelTime.getFullYear(), israelTime.getMonth(), israelTime.getDate());
  const anchorDay = new Date(ANCHOR_DATE.getFullYear(), ANCHOR_DATE.getMonth(), ANCHOR_DATE.getDate());
  const daysSince = Math.floor((today - anchorDay) / 86400000);
  const dayInCycle = ((daysSince % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH;
  return dayInCycle * POSTS_PER_DAY;
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\[[\d,]+\]/g, '') // remove footnote refs like [4]
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlToSafeHtml(html) {
  // Keep paragraph structure but strip dangerous tags
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\[[\d,]+\]/g, '') // remove footnote refs
    .replace(/<(hr|div|section|header|footer|nav|aside)[^>]*>/gi, '<br>')
    .replace(/<\/(div|section|header|footer|nav|aside)>/gi, '')
    .trim();
}

export default async function handler(req, res) {
  // CORS — allow our Vercel site
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const offset = getTodayOffset();
    const url = `${WP_API}?per_page=${POSTS_PER_DAY}&orderby=id&order=asc&offset=${offset}&_fields=id,slug,title,content`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'YoelAssistant/1.0' }
    });

    if (!response.ok) {
      throw new Error(`WP API error: ${response.status}`);
    }

    const posts = await response.json();

    if (!posts || posts.length === 0) {
      return res.status(404).json({ error: 'No posts found for today' });
    }

    const result = posts.map(post => ({
      id: post.id,
      slug: post.slug,
      title: stripHtml(post.title?.rendered || ''),
      html: htmlToSafeHtml(post.content?.rendered || ''),
      text: stripHtml(post.content?.rendered || ''),
      url: `https://ph.yhb.org.il/${post.slug}/`,
    }));

    return res.status(200).json({
      date: new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }),
      offset,
      halachot: result,
    });

  } catch (err) {
    console.error('Halacha API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
