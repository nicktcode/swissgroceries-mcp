// Keeps the nightly-smoke issues in step with the latest run. Failures get
// one rolling issue that closes itself on the next green night. Chains that
// only ever report an outage never fail the suite, so they are counted across
// nights in smoke-state.json and get an issue of their own.
const fs = require('fs');

const UNAVAILABLE_NIGHTS = 3;
const STATE_FILE = 'smoke-state.json';
const UNAVAILABLE_LOG = 'smoke-unavailable.log';
const FAILED_TITLE = 'Nightly smoke failed';
const CHAIN_TITLE = 'Chain unavailable: ';

const readOr = (path, fallback) => (fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : fallback);

module.exports = async ({ github, context, smokeFailed }) => {
  const { owner, repo } = context.repo;
  const runLink = `[#${context.runId}](https://github.com/${owner}/${repo}/actions/runs/${context.runId})`;
  const open = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, state: 'open', labels: 'nightly-smoke', per_page: 100,
  });

  const comment = (issue, body) =>
    github.rest.issues.createComment({ owner, repo, issue_number: issue.number, body });
  const close = async (issue, body) => {
    await comment(issue, body);
    await github.rest.issues.update({ owner, repo, issue_number: issue.number, state: 'closed' });
  };

  const failedIssue = open.find((i) => i.title.startsWith(FAILED_TITLE));
  if (smokeFailed) {
    const log = readOr('smoke.log', '').slice(-4000);
    const body = [`Nightly smoke run ${runLink} failed.`, '', '**Last 4 KB of log:**', '', '```', log, '```'].join('\n');
    if (failedIssue) {
      await comment(failedIssue, body);
    } else {
      const today = new Date().toISOString().split('T')[0];
      await github.rest.issues.create({
        owner, repo,
        title: `${FAILED_TITLE} on ${today}`,
        body: `${body}\n\nTriggered by automation. Closes itself on the next green run.`,
        labels: ['nightly-smoke', 'adapter-broken'],
      });
    }
  } else if (failedIssue) {
    await close(failedIssue, `Nightly smoke run ${runLink} passed.`);
  }

  const previous = JSON.parse(readOr(STATE_FILE, '{}'));
  const unavailable = new Set(readOr(UNAVAILABLE_LOG, '').split('\n').filter(Boolean));
  const nights = Object.fromEntries([...unavailable].map((c) => [c, (previous[c] ?? 0) + 1]));
  fs.writeFileSync(STATE_FILE, JSON.stringify(nights));

  for (const [chain, count] of Object.entries(nights)) {
    if (count < UNAVAILABLE_NIGHTS || open.some((i) => i.title === `${CHAIN_TITLE}${chain}`)) continue;
    await github.rest.issues.create({
      owner, repo,
      title: `${CHAIN_TITLE}${chain}`,
      body: `\`${chain}\` has reported an upstream outage for ${count} nights in a row (latest run ${runLink}). Check whether the shop or its API is gone.\n\nTriggered by automation. Closes itself once the chain answers again.`,
      labels: ['nightly-smoke', 'chain-unavailable'],
    });
  }
  for (const issue of open.filter((i) => i.title.startsWith(CHAIN_TITLE))) {
    if (unavailable.has(issue.title.slice(CHAIN_TITLE.length))) continue;
    await close(issue, `Chain answered again in run ${runLink}.`);
  }
};
