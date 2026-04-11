#!/usr/bin/env node
'use strict';

const { loadRules } = require('./rules');
const { AgentProxy } = require('./proxy');

function usage() {
  console.error(`
agentcheck — behavioral guardrails for AI coding agents

Usage:
  agentcheck [options] -- <command> [args...]

Options:
  --config <path>    Path to .agentcheck.yml config (default: auto-detect)
  --verbose, -v      Show rule matches and injections on stderr
  --dry-run          Show what would be injected, but don't inject
  --shadow           Observe silently — log what would fire, don't inject
  --shadow-log <p>   Shadow log path (default: .agentcheck-shadow.log)
  --log <path>       Append injection log to file
  --rules            Print default rules and exit
  --help, -h         Show this help

Examples:
  agentcheck -- claude                     # Wrap Claude Code with defaults
  agentcheck --shadow -- claude            # Try it first — see what it would do
  agentcheck -v -- claude --dangerously-skip-permissions
  agentcheck --config ./myproject.yml -- claude
  agentcheck --dry-run -- claude           # Preview without injecting
  agentcheck -- cursor-agent --headless    # Works with any CLI agent

Config file (.agentcheck.yml):
  include_defaults: true   # include built-in rules (default: true)
  rules:
    - pattern: "TODO: fix later"
      inject: "Don't leave TODOs. Fix it now or file an issue."
      cooldown: 30    # seconds before this rule can fire again
`);
}

function printRules() {
  const { DEFAULT_RULES } = require('./rules');
  console.log('Default rules:\n');
  for (const rule of DEFAULT_RULES) {
    console.log(`  [${rule.id}]`);
    console.log(`    pattern: ${rule.pattern}`);
    console.log(`    inject:  ${rule.inject}`);
    console.log(`    cooldown: ${rule.cooldown}s`);
    console.log();
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(0);
  }

  if (args.includes('--rules')) {
    printRules();
    process.exit(0);
  }

  // Parse options
  let configPath = null;
  let verbose = false;
  let dryRun = false;
  let shadow = false;
  let shadowLog = '.agentcheck-shadow.log';
  let logFile = null;
  let separatorIdx = args.indexOf('--');

  const optArgs = separatorIdx >= 0 ? args.slice(0, separatorIdx) : args;
  const cmdArgs = separatorIdx >= 0 ? args.slice(separatorIdx + 1) : [];

  for (let i = 0; i < optArgs.length; i++) {
    switch (optArgs[i]) {
      case '--config':
        configPath = optArgs[++i];
        break;
      case '--verbose':
      case '-v':
        verbose = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--shadow':
        shadow = true;
        break;
      case '--shadow-log':
        shadowLog = optArgs[++i];
        break;
      case '--log':
        logFile = optArgs[++i];
        break;
      default:
        console.error(`[agentcheck] Unknown option: ${optArgs[i]}`);
        usage();
        process.exit(1);
    }
  }

  if (cmdArgs.length === 0) {
    console.error('[agentcheck] Error: no command specified after --');
    usage();
    process.exit(1);
  }

  const { rules } = loadRules(configPath);

  if (verbose) {
    console.error(`[agentcheck] Loaded ${rules.length} rules. Wrapping: ${cmdArgs.join(' ')}`);
    if (dryRun) console.error('[agentcheck] DRY RUN — injections will be shown but not sent');
    if (shadow) console.error(`[agentcheck] SHADOW MODE — observing only, logging to ${shadowLog}`);
  } else if (shadow) {
    console.error(`[agentcheck] Shadow mode active. Logging to ${shadowLog}`);
  }

  const proxy = new AgentProxy(rules, { verbose, dryRun, shadow, shadowLog, logFile });

  proxy.on('injection', ({ rule }) => {
    if (verbose) {
      process.stderr.write(`[agentcheck] ✓ Injected correction for rule '${rule.id}'\n`);
    }
  });

  proxy.start(cmdArgs[0], cmdArgs.slice(1));
}

main();
