const SITE_URL = 'https://go165.github.io/bounty-radar/';

export function buildRssFeed(feed, options = {}) {
  const siteUrl = options.siteUrl ?? SITE_URL;
  const feedUrl = options.feedUrl ?? `${siteUrl}feed/latest.xml`;
  const jsonUrl = options.jsonUrl ?? `${siteUrl}feed/latest.json`;
  const generatedAt = feed.generated_at ?? new Date().toISOString();
  const items = [...(feed.items ?? [])]
    .sort((a, b) => Date.parse(b.updated_at ?? generatedAt) - Date.parse(a.updated_at ?? generatedAt))
    .slice(0, options.limit ?? 40);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Bounty Radar</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>Daily GitHub bounty shortlist scored for payout clarity, payment rails, amount text, risk, and effort.</description>
    <language>en</language>
    <lastBuildDate>${formatRssDate(generatedAt)}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <atom:link href="${escapeXml(jsonUrl)}" rel="alternate" type="application/json" />
${items.map((item) => formatItem(item, generatedAt)).join('')}
  </channel>
</rss>
`;
}

function formatItem(item, fallbackDate) {
  const amount = item.payout_amount_usd ?? item.amount_usd;
  const notes = [
    `${item.repo ?? 'unknown/repo'} | score ${item.score ?? 0}`,
    item.opportunity_class ? `opportunity: ${item.opportunity_class}` : null,
    Number.isFinite(Number(item.effort_score)) ? `effort: ${item.effort_score}` : null,
    amount ? `amount: $${amount}` : null,
    item.signals?.length ? `signals: ${item.signals.join(', ')}` : null,
    item.risk_flags?.length ? `risk: ${item.risk_flags.map((flag) => flag.label).join(', ')}` : null,
    item.decision_notes?.length ? `notes: ${item.decision_notes.join('; ')}` : null,
  ].filter(Boolean);

  return `    <item>
      <title>${escapeXml(item.title ?? 'Untitled bounty issue')}</title>
      <link>${escapeXml(item.url ?? '')}</link>
      <guid isPermaLink="true">${escapeXml(item.url ?? '')}</guid>
      <pubDate>${formatRssDate(item.updated_at ?? fallbackDate)}</pubDate>
      <description>${escapeXml(notes.join('\n'))}</description>
    </item>
`;
}

function formatRssDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toUTCString();
  return date.toUTCString();
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
