import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPullNumbers,
  parseIssueRef,
  summarizeCompetition,
} from '../scripts/audit-candidate.mjs';

test('parseIssueRef accepts URL and repo-number forms', () => {
  assert.deepEqual(
    parseIssueRef({ issueUrl: 'https://github.com/owner/repo/issues/123' }),
    { repo: 'owner/repo', number: 123 },
  );
  assert.deepEqual(parseIssueRef({ repo: 'owner/repo', issue: '456' }), { repo: 'owner/repo', number: 456 });
  assert.throws(() => parseIssueRef({ issueUrl: 'https://example.com/owner/repo/issues/1' }), /issue-url/);
});

test('extractPullNumbers reads pull links and PR references', () => {
  assert.deepEqual(
    extractPullNumbers('Submitted https://github.com/owner/repo/pull/11 plus PR #9 and pull request #10'),
    [9, 10, 11],
  );
});

test('summarizeCompetition recommends avoiding crowded claims', () => {
  const summary = summarizeCompetition({
    issue: {
      number: 1,
      title: 'Bounty',
      state: 'open',
      html_url: 'https://github.com/owner/repo/issues/1',
      updated_at: '2026-06-14T00:00:00Z',
    },
    comments: [
      { body: '/claim\nSubmitted #2', author_association: 'NONE' },
      { body: 'Submitted https://github.com/owner/repo/pull/3', author_association: 'NONE' },
    ],
    pullRequests: [
      { number: 2, title: 'Solution', state: 'open', draft: false, merged_at: null, user: { login: 'a' }, html_url: 'x' },
      { number: 3, title: 'Solution', state: 'open', draft: false, merged_at: null, user: { login: 'b' }, html_url: 'y' },
    ],
  });

  assert.equal(summary.recommendation, 'avoid-unless-clearly-superior');
  assert.equal(summary.counts.open_pull_requests, 2);
});

test('summarizeCompetition does not treat open-for-accepted-work as a winner', () => {
  const summary = summarizeCompetition({
    issue: {
      number: 1,
      title: 'Bounty',
      state: 'open',
      html_url: 'https://github.com/owner/repo/issues/1',
      updated_at: '2026-06-14T00:00:00Z',
    },
    comments: [
      {
        body: 'Claims are now open for accepted work that matches this bounty criteria.',
        author_association: 'OWNER',
      },
    ],
    pullRequests: [],
  });

  assert.equal(summary.recommendation, 'consider');
  assert.equal(summary.counts.maintainer_accepted_comments, 0);
});
