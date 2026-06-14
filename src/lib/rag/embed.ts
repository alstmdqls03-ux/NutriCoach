import OpenAI from 'openai';

const MODEL = 'text-embedding-3-small';

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const res = await client.embeddings.create({ model: MODEL, input: texts.slice(i, i + 100) });
    for (const d of res.data) out.push(d.embedding as number[]);
  }
  return out;
}
