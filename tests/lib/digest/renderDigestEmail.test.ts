import { describe, it, expect } from 'vitest';
import { renderDigestEmail } from '@/lib/digest/renderDigestEmail';

describe('renderDigestEmail', () => {
  it('renders a "nothing new" message when empty', () => {
    const { subject, html } = renderDigestEmail({ recommendations: [], isEmpty: true });
    expect(subject).toContain('nothing new');
    expect(html).toContain('Nothing new matches your profile');
  });

  it('renders each recommendation when non-empty', () => {
    const { subject, html } = renderDigestEmail({
      isEmpty: false,
      recommendations: [
        {
          id: '1',
          title: 'Bun 2.0',
          url: 'https://bun.sh',
          category: 'maintain',
          blurb: 'Matters to you.',
          learningAction: 'Skim the docs',
          learningTimeEstimate: '20 minutes',
        },
      ],
    });
    expect(subject).toContain('1 new recommendation');
    expect(html).toContain('Bun 2.0');
    expect(html).toContain('Skim the docs');
  });
});
