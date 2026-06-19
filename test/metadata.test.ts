import { parseCommitLog } from '../src/metadata.js';

describe('parseCommitLog', () => {
  it('parses git log tab-separated rows', () => {
    const commits = parseCommitLog('1710000000\tAlice\tinitial commit\n1710000600\tBob\tAdd API');

    expect(commits).toEqual([
      { unixSeconds: 1710000000, author: 'Alice', subject: 'initial commit' },
      { unixSeconds: 1710000600, author: 'Bob', subject: 'Add API' }
    ]);
  });
});
