export interface OllamaChatClient {
  generate(prompt: string): Promise<string>;
}

export function createOllamaChatClient(baseUrl: string, model: string): OllamaChatClient {
  return {
    async generate(prompt: string): Promise<string> {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          format: 'json',
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama chat API returned ${response.status}`);
      }

      const data = (await response.json()) as { message: { content: string } };
      return data.message.content;
    },
  };
}
