import { describe, it, expect } from 'vitest';
import { handleAddAlias } from '@/lib/coach/handlers';

const fakeAliases = () => {
  const added: { alias: string; exerciseId: string }[] = [];
  return {
    repo: {
      listAliases: async () => [],
      addAlias: async (_u: string, alias: string, exerciseId: string) => { added.push({ alias, exerciseId }); },
      removeAlias: async () => {},
    },
    added,
  };
};

describe('handleAddAlias', () => {
  it('400s on empty alias', async () => {
    const { repo } = fakeAliases();
    const r = await handleAddAlias({ body: { alias: '  ', exerciseId: 'Butterfly' }, aliases: repo });
    expect(r.status).toBe(400);
  });
  it('400s when exerciseId is not in the dataset', async () => {
    const { repo } = fakeAliases();
    const r = await handleAddAlias({ body: { alias: '펙덱기계', exerciseId: 'Not_Real' }, aliases: repo });
    expect(r.status).toBe(400);
  });
  it('adds a normalized alias for a valid exercise', async () => {
    const { repo, added } = fakeAliases();
    const r = await handleAddAlias({ body: { alias: '  내 펙덱 ', exerciseId: 'Butterfly' }, aliases: repo });
    expect(r.status).toBe(200);
    expect(added[0]).toEqual({ alias: '내 펙덱', exerciseId: 'Butterfly' });
  });
});
