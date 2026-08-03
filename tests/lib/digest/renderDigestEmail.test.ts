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

  it('escapes HTML-significant characters in third-party content and rejects unsafe URL schemes', () => {
    const { html } = renderDigestEmail({
      isEmpty: false,
      recommendations: [
        {
          id: '2',
          title: '<script>alert(1)</script>',
          url: 'javascript:alert(1)',
          category: 'grow',
          blurb: '<img src=x onerror=alert(2)>',
          learningAction: 'Read "the" docs & <learn>',
          learningTimeEstimate: '10 minutes',
        },
      ],
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(2)>');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).not.toContain('href="javascript:alert(1)"');
    expect(html).toContain('href="#"');
    expect(html).toContain('&quot;the&quot;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;learn&gt;');
  });
});
