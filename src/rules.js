'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const DEFAULT_RULES = [
  {
    id: 'pragmatic-fix',
    pattern: /pragmatic\s+(fix|solution|approach)/i,
    inject: "Reminder: do the correct fix, not a pragmatic shortcut. If the right fix is complex, explain it and ask for clarification first.",
    cooldown: 60
  },
  {
    id: 'pre-existing',
    pattern: /pre-?existing\s+(issue|bug|problem)/i,
    inject: "This is likely NOT a pre-existing issue. Find the actual root cause in the changes you made.",
    cooldown: 60
  },
  {
    id: 'deleted-tests',
    pattern: /delet(e|ed|ing)\s+.*test/i,
    inject: "STOP. Do not delete tests. If a test is failing, fix the code to make it pass — not the test.",
    cooldown: 120
  },
  {
    id: 'skip-tests',
    pattern: /skip(ped|ping)?\s+.*test|\.skip\(|xit\(|xdescribe\(/,
    inject: "STOP. Do not skip tests. Fix the underlying issue instead.",
    cooldown: 120
  },
  {
    id: 'already-working',
    pattern: /already\s+(work(s|ing)|pass(es|ing))/i,
    inject: "Show me the specific test or command output that confirms it was already working.",
    cooldown: 90
  },
  {
    id: 'assume-no-test',
    pattern: /no\s+(need|reason)\s+(to|for)\s+test/i,
    inject: "Write a test. If you think it doesn't need testing, explain why and I'll decide.",
    cooldown: 60
  },
  {
    id: 'error-swallow',
    pattern: /catch\s*\(\s*\w+\s*\)\s*\{?\s*\}/,
    inject: "You have an empty catch block — this silently swallows errors. Either handle it properly or re-throw.",
    cooldown: 30
  }
];

function loadRules(configPath) {
  const searchPaths = [
    configPath,
    process.cwd() + '/.agentcheck.yml',
    process.cwd() + '/.agentcheck.yaml',
    process.env.HOME + '/.agentcheck.yml'
  ].filter(Boolean);

  for (const p of searchPaths) {
    if (p && fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        const config = yaml.load(raw);
        return parseUserRules(config, p);
      } catch (e) {
        console.error(`[agentcheck] Warning: failed to load ${p}: ${e.message}`);
      }
    }
  }

  return { rules: DEFAULT_RULES, includeDefaults: true };
}

function parseUserRules(config, configPath) {
  const includeDefaults = config.include_defaults !== false;
  const userRules = (config.rules || []).map((r, i) => {
    if (!r.pattern) throw new Error(`Rule ${i} missing 'pattern'`);
    if (!r.inject) throw new Error(`Rule ${i} missing 'inject'`);
    return {
      id: r.id || `user-rule-${i}`,
      pattern: new RegExp(r.pattern, r.flags || 'i'),
      inject: r.inject,
      cooldown: r.cooldown || 60
    };
  });

  const rules = includeDefaults ? [...DEFAULT_RULES, ...userRules] : userRules;
  return { rules, includeDefaults };
}

module.exports = { loadRules, DEFAULT_RULES };
