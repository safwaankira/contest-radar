// Text scoring shared by every source: payout signals, rails, amounts, risk flags,
// effort and opportunity class. Extracted unchanged from build-feed.mjs (go165/bounty-radar)
// so GitHub issues, poidh bounties and social posts are judged by the same rules.

export const signalPatterns = [
  { label: 'bounty', regex: /\b(bounty|reward|prize|paid|payout|compensation)\b/i, points: 12 },
  { label: 'USDC/Base', regex: /\b(USDC|Base|Coinbase|onchain|stablecoin)\b/i, points: 18 },
  { label: 'x402', regex: /\b(x402|HTTP 402|402 Payment Required|paid API)\b/i, points: 18 },
  { label: 'MRWK/MergeWork', regex: /\b(MRWK|MergeWork|mrwk:bounty|mrwk1)\b/i, points: 18 },
  { label: 'amount', regex: /(\$|USD|USDC|MRWK)[ \t]?\d|\d+[ \t]?(USD|USDC|MRWK)/i, points: 16 },
];

export const riskPatterns = [
  {
    label: 'hidden-context-leak',
    severity: 'blocker',
    penalty: 90,
    regex: /\b(system prompt|system instructions|developer message|startup instructions|boot context|boot_context|_provenance|provenance\.json|initial prompt|hidden instructions|before first human message|full conversation transcript)\b|paste.{0,80}\b(system|developer|prompt|instructions)\b/i,
  },
  {
    label: 'secret-or-wallet-risk',
    severity: 'blocker',
    penalty: 70,
    regex: /\b(private key|seed phrase|mnemonic|wallet private|export.*key|sign transaction|send funds|mainnet transaction|transfer .*USDC)\b/i,
  },
  {
    label: 'requires-signup-confirmation',
    severity: 'manual',
    penalty: 28,
    regex: /\b(sign up|signup|register before|developer access|access pending|maintainer confirmation|approval required|must be approved|wait for approval|claim required|must claim)\b/i,
  },
  {
    label: 'kyc-or-account-friction',
    severity: 'manual',
    penalty: 24,
    regex: /\b(KYC|identity verification|tax form|W-9|W8BEN|bank account|invoice required|manual payout|Upwork|freelancer profile|Devpost account|login required|account required|needs-human)\b/i,
  },
  {
    label: 'competition-noise',
    severity: 'high',
    penalty: 22,
    regex: /\b(duplicate|already implemented|winner selected|accepted solution|merged solution|many PRs|first come first served|first to merge|assigned to|claimed by)\b/i,
  },
  {
    label: 'internal-agent-dispatch',
    severity: 'blocker',
    penalty: 70,
    regex: /\b(GOLD STANDARD AUTOPILOT|SHIP TO MAIN|parallel\s+\d+h\s+session|autopilot-(?:next|bd)|internal dispatch|agent dispatch)\b/i,
  },
];

const easyEffortPatterns = [
  { label: 'good-first-issue', regex: /\b(good first issue|first-timers?|beginner friendly|starter issue|easy|low[- ]hanging|small change|simple fix)\b/i, points: -14 },
  { label: 'docs-or-tests', regex: /\b(docs?|readme|changelog|example|template|unit tests?|test coverage|smoke test)\b/i, points: -10 },
  { label: 'narrow-scope', regex: /\b(one file|single file|minimal change|small patch|stub|typo|copy edit)\b/i, points: -8 },
];

const hardEffortPatterns = [
  { label: 'security-sensitive', regex: /\b(security|vulnerability|exploit|private key|seed phrase|wallet|smart contract|mainnet|sign transaction)\b/i, points: 24 },
  { label: 'infra-or-migration', regex: /\b(migration|refactor|architecture|distributed|database|production|scalability|performance|e2e|flaky|race condition)\b/i, points: 18 },
  { label: 'external-access', regex: /\b(sign up|signup|KYC|approval required|account required|manual payout|developer access)\b/i, points: 14 },
];

const addressPatterns = [
  { type: 'EVM', regex: /0x[a-fA-F0-9]{40}/g },
  { type: 'Stellar', regex: /G[A-Z2-7]{55}/g },
  { type: 'MRWK', regex: /mrwk1[a-z0-9]{20,80}/gi },
];

export function assessOpportunity({ text, labelText, score, rawScore, riskScore, riskFlags, manualFriction, signals, amountUsd, payoutAmountUsd }) {
  const haystack = `${text}\n${labelText}`;
  const effortSignals = [];
  let effortScore = 40;

  for (const pattern of easyEffortPatterns) {
    if (pattern.regex.test(haystack)) {
      effortSignals.push(pattern.label);
      effortScore += pattern.points;
    }
  }

  for (const pattern of hardEffortPatterns) {
    if (pattern.regex.test(haystack)) {
      effortSignals.push(pattern.label);
      effortScore += pattern.points;
    }
  }

  if (manualFriction) effortScore += 12;
  if (riskScore >= 50) effortScore += 16;
  effortScore = clamp(effortScore, 0, 100);

  const amount = payoutAmountUsd ?? amountUsd ?? 0;
  const hasRail = signals.some((signal) => /USDC|Base|x402|MRWK|MergeWork/i.test(signal));
  const blocker = riskFlags.some((flag) => flag.severity === 'blocker') || riskScore >= 70;
  let opportunityClass = 'standard';

  if (blocker) opportunityClass = 'avoid';
  else if (manualFriction || riskScore > 25) opportunityClass = 'manual-review';
  else if (amount >= 250 && score >= 36) opportunityClass = 'high-value';
  else if (effortScore <= 28 && amount >= 50 && score >= 30) opportunityClass = 'quick-win';
  else if (hasRail && rawScore >= 36) opportunityClass = 'rail-watch';

  const decisionNotes = [];
  if (amount > 0) decisionNotes.push(`parsed payout amount: $${amount}`);
  else decisionNotes.push('no explicit USD/USDC amount parsed');
  if (hasRail) decisionNotes.push('payment rail signal present');
  if (effortSignals.length > 0) decisionNotes.push(`effort signals: ${effortSignals.join(', ')}`);
  if (riskFlags.length > 0) decisionNotes.push(`risk flags: ${riskFlags.map((flag) => flag.label).join(', ')}`);
  if (manualFriction) decisionNotes.push('manual signup or approval friction detected');

  return {
    opportunity_class: opportunityClass,
    effort_score: effortScore,
    effort_signals: [...new Set(effortSignals)],
    decision_notes: decisionNotes.slice(0, 5),
  };
}

export function analyzeRisk(text, labelText) {
  const haystack = `${text}\n${labelText}`;
  return riskPatterns
    .filter((risk) => risk.regex.test(haystack))
    .map((risk) => ({
      label: risk.label,
      severity: risk.severity,
      penalty: risk.penalty,
    }));
}

export function extractAddresses(text) {
  const matches = [];
  for (const pattern of addressPatterns) {
    for (const match of text.match(pattern.regex) ?? []) {
      matches.push({ type: pattern.type, value: match });
    }
  }
  return uniqueBy(matches, (item) => `${item.type}:${item.value.toLowerCase()}`);
}

export function extractLargestAmountUsd(text) {
  const amounts = [];
  const patterns = [
    /\$[ \t]?([\d,]+(?:\.\d+)?)/g,
    /\b([\d,]+(?:\.\d+)?)[ \t]?(?:USD|USDC)\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(String(match[1]).replaceAll(',', ''));
      if (Number.isFinite(value)) amounts.push(value);
    }
  }
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

export function extractLargestPayoutAmountUsd(text, labelText = '') {
  const payoutContext = /\b(bounty|reward|prize|payout|compensation|paid|price|fee|grant|award)\b/i;
  const explicitPayoutLabel = payoutContext.test(labelText);
  const amounts = [];
  for (const line of text.split(/\r?\n/)) {
    const lineHasPayout = payoutContext.test(line);
    for (const match of amountMatches(line)) {
      const start = Math.max(0, match.index - 80);
      const end = Math.min(line.length, match.index + match.raw.length + 80);
      const nearby = line.slice(start, end);
      if (lineHasPayout || explicitPayoutLabel || payoutContext.test(nearby)) {
        amounts.push(match.value);
      }
    }
  }
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

export function amountMatches(text) {
  const matches = [];
  const patterns = [
    /\$[ \t]?([\d,]+(?:\.\d+)?)/g,
    /\b([\d,]+(?:\.\d+)?)[ \t]?(?:USD|USDC)\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(String(match[1]).replaceAll(',', ''));
      if (Number.isFinite(value)) {
        matches.push({ value, index: match.index ?? 0, raw: match[0] });
      }
    }
  }
  return matches;
}

export function uniqueBy(items, keyFn) {
  const seenKeys = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}


/**
 * Score any listing from its text. Returns the base feed fields
 * (score, raw_score, risk_score, opportunity_class, effort_score, signals, ...).
 */
export function scoreText({ title = '', body = '', labels = [], updatedAt = null, extraSignals = [] }) {
  const text = `${title ?? ''}\n${body ?? ''}`;
  const labelText = labels.join(' ');
  const signals = [...extraSignals];
  let rawScore = 0;

  for (const signal of signalPatterns) {
    if (signal.regex.test(text) || signal.regex.test(labelText)) {
      signals.push(signal.label);
      rawScore += signal.points;
    }
  }

  if (/\b(bounty|reward|paid|help wanted)\b/i.test(labelText)) {
    signals.push('label match');
    rawScore += 8;
  }

  const addresses = extractAddresses(text);
  if (addresses.length > 0) {
    signals.push('payout address');
    rawScore += 20;
  }

  if (updatedAt) {
    const daysOld = (Date.now() - new Date(updatedAt).getTime()) / 86400000;
    if (daysOld > 120) {
      signals.push('stale');
      rawScore -= 8;
    }
  }

  const riskFlags = analyzeRisk(text, labelText);
  const riskScore = riskFlags.reduce((total, flag) => total + flag.penalty, 0);
  const manualFriction = riskFlags.some((flag) => flag.severity === 'manual');
  const amountUsd = extractLargestAmountUsd(text);
  const payoutAmountUsd = extractLargestPayoutAmountUsd(text, labelText);
  const opportunity = assessOpportunity({
    text, labelText,
    score: Math.max(0, rawScore - riskScore),
    rawScore: Math.max(0, rawScore),
    riskScore, riskFlags, manualFriction, signals, amountUsd, payoutAmountUsd,
  });

  return {
    score: Math.max(0, rawScore - riskScore),
    raw_score: Math.max(0, rawScore),
    risk_score: riskScore,
    opportunity_class: opportunity.opportunity_class,
    effort_score: opportunity.effort_score,
    effort_signals: opportunity.effort_signals,
    decision_notes: opportunity.decision_notes,
    risk_flags: riskFlags,
    manual_friction: manualFriction,
    labels,
    signals: [...new Set(signals)],
    addresses,
    amount_usd: amountUsd,
    payout_amount_usd: payoutAmountUsd,
  };
}
