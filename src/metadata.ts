import { MetadataSignals } from './types.js';
import { runCommand } from './process.js';

const GENERIC_COMMIT_RE = /^(initial commit|init|update|updates|fix|fixes|bugfix|changes|wip|cleanup|refactor|work|misc|stuff|checkpoint)$/i;

interface CommitInfo {
  unixSeconds: number;
  author: string;
  subject: string;
}

export async function analyzeMetadata(repoPath: string): Promise<MetadataSignals> {
  const [logResult, contributorResult, changedFilesResult] = await Promise.all([
    runCommand('git', ['log', '--pretty=format:%ct%x09%an%x09%s'], { cwd: repoPath }),
    runCommand('git', ['shortlog', '-sn', '--all'], { cwd: repoPath }).catch(() => ({ stdout: '', stderr: '' })),
    runCommand('git', ['log', '--shortstat', '--pretty=format:commit'], { cwd: repoPath }).catch(() => ({
      stdout: '',
      stderr: ''
    }))
  ]);

  const commits = parseCommitLog(logResult.stdout);
  const timestamps = commits.map((commit) => commit.unixSeconds).sort((a, b) => a - b);
  const first = timestamps[0] ?? null;
  const last = timestamps[timestamps.length - 1] ?? null;
  const activitySpanMinutes = first !== null && last !== null ? Math.round((last - first) / 60) : null;
  const genericCommitMessageCount = commits.filter((commit) => GENERIC_COMMIT_RE.test(commit.subject.trim())).length;

  return {
    commit_count: commits.length,
    contributor_count: parseContributorCount(contributorResult.stdout, commits),
    activity_span_minutes: activitySpanMinutes,
    first_commit_at: first === null ? null : new Date(first * 1000).toISOString(),
    last_commit_at: last === null ? null : new Date(last * 1000).toISOString(),
    generic_commit_messages: genericCommitMessageCount > 0,
    generic_commit_message_count: genericCommitMessageCount,
    single_session_clustering: commits.length >= 2 && activitySpanMinutes !== null && activitySpanMinutes <= 90,
    few_giant_commits: detectFewGiantCommits(commits.length, changedFilesResult.stdout),
    recent_commit_count: countRecentCommits(timestamps)
  };
}

export function parseCommitLog(stdout: string): CommitInfo[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [timestamp, author, ...subjectParts] = line.split('\t');
      return {
        unixSeconds: Number(timestamp),
        author: author || 'unknown',
        subject: subjectParts.join('\t') || ''
      };
    })
    .filter((commit) => Number.isFinite(commit.unixSeconds));
}

function parseContributorCount(stdout: string, commits: CommitInfo[]): number {
  const fromShortlog = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length;

  if (fromShortlog > 0) {
    return fromShortlog;
  }

  return new Set(commits.map((commit) => commit.author)).size;
}

function detectFewGiantCommits(commitCount: number, shortstatOutput: string): boolean {
  if (commitCount === 0 || commitCount > 5) {
    return false;
  }

  const changedFileCounts = shortstatOutput
    .split('\n')
    .map((line) => line.match(/(\d+) files? changed/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => Number(match[1]));

  return changedFileCounts.some((count) => count >= 25);
}

function countRecentCommits(sortedTimestamps: number[]): number {
  const newest = sortedTimestamps[sortedTimestamps.length - 1];
  if (!newest) {
    return 0;
  }

  const sevenDaysSeconds = 7 * 24 * 60 * 60;
  return sortedTimestamps.filter((timestamp) => newest - timestamp <= sevenDaysSeconds).length;
}
