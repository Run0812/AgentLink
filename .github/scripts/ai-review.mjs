#!/usr/bin/env node
/**
 * AI-powered PR review using Claude.
 *
 * Exits 0 on pass or skipped.
 * Exits 1 only when a BLOCKING issue is found (high-severity bugs,
 * build failures, version inconsistencies, Obsidian guideline violations).
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY  – Anthropic API key (optional: review is skipped if absent)
 *   GITHUB_TOKEN       – GitHub token (automatically set by Actions)
 *   REPO               – owner/repo (e.g. Run0812/AgentLink)
 *   PR_NUMBER          – pull request number
 */

const apiKey   = process.env.ANTHROPIC_API_KEY;
const token    = process.env.GITHUB_TOKEN;
const repo     = process.env.REPO;
const prNumber = process.env.PR_NUMBER;

if (!apiKey) {
  console.log('ANTHROPIC_API_KEY not configured – AI review skipped.');
  process.exit(0);
}

async function main() {
  // ── Fetch PR diff ────────────────────────────────────────────────
  const diffRes = await fetch(
    `https://api.github.com/repos/${repo}/pulls/${prNumber}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3.diff',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  const diff = await diffRes.text();

  if (!diff || diff.trim().length < 5) {
    console.log('Empty diff – AI review skipped.');
    process.exit(0);
  }

  // Truncate to stay within Claude context limits
  const truncated =
    diff.length > 10000 ? diff.slice(0, 10000) + '\n\n... (diff truncated)' : diff;

  // ── Build prompt ─────────────────────────────────────────────────
  const prompt = [
    'You are a code reviewer for an Obsidian community plugin called AgentLink (TypeScript/Preact).',
    '',
    'Review the PR diff below. Classify issues into two tiers:',
    '',
    'TIER 1 – BLOCKING (set block=true ONLY for these):',
    '- High-probability severe bug: crash, data loss, secret leakage, security vulnerability',
    '- Obvious build failure risk: broken import, missing export, syntax/type error visible in diff',
    '- manifest.json / package.json / versions.json version number inconsistency',
    '- Clear violation of Obsidian community plugin publishing guidelines',
    '',
    'TIER 2 – SUGGESTIONS (block=false):',
    '- Code style, naming, formatting',
    '- Refactoring or abstraction opportunities',
    '- Performance improvements',
    '- Minor maintainability concerns',
    '',
    'Respond with valid JSON ONLY (no markdown fences, no extra text):',
    '{',
    '  "block": false,',
    '  "blockReason": "",',
    '  "summary": "2-3 sentence overall assessment of the PR",',
    '  "suggestions": []',
    '}',
    '',
    'PR Diff:',
    '```diff',
    truncated,
    '```',
  ].join('\n');

  // ── Call Claude ──────────────────────────────────────────────────
  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const apiData = await apiRes.json();
  if (!apiRes.ok) {
    console.error('Claude API error:', JSON.stringify(apiData));
    console.log('Skipping AI review due to API error.');
    process.exit(0);
  }

  const rawText = apiData.content?.[0]?.text ?? '';
  let review;
  try {
    review = JSON.parse(rawText);
  } catch (_) {
    console.error('Failed to parse Claude response as JSON:', rawText);
    console.log('Skipping AI review due to parse error.');
    process.exit(0);
  }

  // ── Build PR comment ─────────────────────────────────────────────
  const icon  = review.block ? '\uD83D\uDEAB' : '\u2705'; // 🚫 / ✅
  const title = review.block
    ? 'AI Review: **BLOCKING issues found** – merge is blocked'
    : 'AI Review: Passed';

  let body = `## ${icon} ${title}\n\n${review.summary ?? ''}\n`;

  if (review.suggestions?.length) {
    body += '\n### Suggestions\n';
    for (const s of review.suggestions) body += `- ${s}\n`;
  }

  if (review.block && review.blockReason) {
    body += `\n### Blocking Reason\n${review.blockReason}\n`;
  }

  body +=
    '\n---\n*This review was generated automatically. It blocks only on high-severity issues.*';

  // ── Post comment ─────────────────────────────────────────────────
  await fetch(`https://api.github.com/repos/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ body }),
  });

  if (review.block) {
    console.error('AI Review blocked this PR:', review.blockReason);
    process.exit(1);
  }

  console.log('AI Review passed.');
}

main().catch((err) => {
  console.error('Unexpected error in AI review:', err);
  // Non-blocking on unexpected errors – do not fail the CI
  process.exit(0);
});
