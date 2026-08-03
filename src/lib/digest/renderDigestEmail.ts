import type { DigestContent } from './buildDigest';

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
        <strong>[${rec.category}] <a href="${rec.url}">${rec.title}</a></strong><br/>
        ${rec.blurb}<br/>
        <em>${rec.learningAction} (${rec.learningTimeEstimate})</em>
      </li>`
    )
    .join('');

  return {
    subject: `Tech Relevance Advisor: ${content.recommendations.length} new recommendation(s)`,
    html: `<ul>${items}</ul>`,
  };
}
