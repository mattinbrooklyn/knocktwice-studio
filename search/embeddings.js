// OpenAI embeddings over plain fetch. text-embedding-3-small, 1536 dimensions.

export const EMBEDDING_MODEL = 'text-embedding-3-small';

export function makeEmbedder({ apiKey = process.env.OPENAI_API_KEY, fetchImpl = globalThis.fetch, model = EMBEDDING_MODEL } = {}) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  return async function embed(texts) {
    if (texts.length === 0) return [];
    const res = await fetchImpl('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, input: texts.map((t) => t.slice(0, 8000)) }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI embeddings ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  };
}

export function toVectorLiteral(embedding) {
  return `[${embedding.join(',')}]`;
}
