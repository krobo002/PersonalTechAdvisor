import type { DigestContent } from './buildDigest';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : '#';
}

export function renderDigestEmail(content: DigestContent): { subject: string; html: string } {
  if (content.isEmpty) {
    return {
      subject: 'Tech Relevance Advisor: nothing new this week',
      html: '<p>Nothing new matches your profile this week.</p>',
    };
  }

  const items = content.recommendations
    .map(
      (rec) => `<li>
        <strong>[${escapeHtml(rec.category)}] <a href="${safeUrl(rec.url)}">${escapeHtml(rec.title)}</a></strong><br/>
        ${escapeHtml(rec.blurb)}<br/>
        <em>${escapeHtml(rec.learningAction)} (${escapeHtml(rec.learningTimeEstimate)})</em>
      </li>`
    )
    .join('');

  return {
    subject: `Tech Relevance Advisor: ${content.recommendations.length} new recommendation(s)`,
    html: `<ul>${items}</ul>`,
  };
}
