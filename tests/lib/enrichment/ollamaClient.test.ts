import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOllamaChatClient } from '@/lib/enrichment/ollamaClient';

describe('createOllamaChatClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the prompt to /api/chat with the expected request shape and returns the content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{"blurb":"hello"}' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaChatClient('http://localhost:11434', 'llama3.1');
    const result = await client.generate('a prompt');

    expect(result).toBe('{"blurb":"hello"}');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.1',
          messages: [{ role: 'user', content: 'a prompt' }],
          format: 'json',
          stream: false,
        }),
      })
    );
  });

  it('throws when the API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const client = createOllamaChatClient('http://localhost:11434', 'llama3.1');

    await expect(client.generate('a prompt')).rejects.toThrow('500');
  });
});
