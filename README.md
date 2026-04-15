# AgentCheck

[![CI](https://github.com/paprika-org/agentcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/paprika-org/agentcheck/actions/workflows/ci.yml)

> "All of my unsupervised worker agents have sidecars that inject messages when thinking tokens match some heuristics. Any time Opus says 'pragmatic', it's instant — 'Pragmatic fix is always wrong, do the Correct fix'."
>
> — gck1 on Hacker News, April 2026

Your AI coding agent will take shortcuts. It'll call them "pragmatic fixes." It'll blame "pre-existing issues." It'll delete a failing test rather than fix it. When you're watching, you catch these. When you're not, it ships them.

AgentCheck is a stdin/stdout proxy that intercepts bad patterns in your agent's output and injects corrections — before the damage is done.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Without AgentCheck                                                  │
│                                                                      │
│  Agent: "I'll apply a pragmatic fix here..."                        │
│  Agent: [writes hacky workaround]                                   │
│  Agent: "Done ✓"                                                    │
│                                                                      │
│  You: [comes back an hour later to review garbage]                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  With AgentCheck                                                     │
│                                                                      │
│  Agent: "I'll apply a pragmatic fix here..."                        │
│  ↳ [agentcheck injects]: "Reminder: do the correct fix, not a      │
│    pragmatic shortcut. If complex, explain and ask first."          │
│  Agent: "You're right. Let me think about the proper approach..."  │
│  Agent: [writes correct solution]                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Install

```bash
npm install -g agentcheck
```

Or without installing:

```bash
npx agentcheck -- claude
```

## Usage

Just prefix your agent command with `agentcheck --`:

```bash
# Try it first — see what would fire without injecting anything
agentcheck --shadow -- claude

# Wrap Claude Code (live corrections)
agentcheck -- claude

# With verbose logging (see what's being intercepted)
agentcheck -v -- claude

# Any CLI agent works
agentcheck -- cursor-agent --headless
agentcheck -- aider --model gpt-5.4

# Preview injections without sending them
agentcheck --dry-run -v -- claude

# Log all matches to a file
agentcheck --log ~/.agentcheck.log -- claude
```

**Shadow mode** (`--shadow`) runs your agent normally but silently logs every rule that *would* have fired to `.agentcheck-shadow.log`. Nothing is injected. Use this to build confidence in your ruleset before enabling live corrections.

## Rule Packs

Pre-built rule packs in the `rules/` directory:

| Pack | What it catches |
|------|----------------|
| `rules/protect-git.yaml` | Destructive git ops: force push, hard reset, branch delete, checkout dot |
| `rules/no-secrets.yaml` | Hardcoded credentials, API keys, tokens, private keys, connection strings |
| `rules/stay-in-scope.yaml` | Out-of-scope file edits: lockfiles, .env, CI/CD, migrations, sudo, rm -rf |

```bash
# Use a rule pack
agentcheck --config rules/protect-git.yaml -- claude

# Shadow mode with a rule pack (observe before committing)
agentcheck --shadow --config rules/no-secrets.yaml -- claude
```

## Default Rules

AgentCheck ships with rules for the most common agent failure modes:

| Rule | Triggers on | Injects |
|------|-------------|---------|
| `pragmatic-fix` | "pragmatic fix/solution/approach" | Reminder to do the correct fix |
| `pre-existing` | "pre-existing issue/bug/problem" | Don't blame pre-existing issues |
| `deleted-tests` | Deleting tests | STOP. Fix the code, not the test. |
| `skip-tests` | `.skip()`, `xit()`, `xdescribe()` | STOP. Fix the issue, don't skip. |
| `already-working` | "already works/passes" | Show me the test that proves it. |
| `error-swallow` | Empty catch blocks | Handle or re-throw errors. |

See all rules: `agentcheck --rules`

## Custom Rules

Create `.agentcheck.yml` in your project root:

```yaml
include_defaults: true  # keep built-in rules (default)

rules:
  # Your team's rules
  - pattern: "TODO: fix later"
    inject: "Don't leave TODOs. Fix it now or file an issue with a ticket number."
    cooldown: 30

  - pattern: "I'll leave this for now"
    inject: "Finish this before moving on. What specifically would you leave and why?"
    cooldown: 60

  - pattern: "assuming .* works"
    inject: "Don't assume — verify. Run the thing and check the output."
    cooldown: 60
```

## How It Works

AgentCheck is a transparent proxy:

1. Spawns your agent as a subprocess
2. Pipes your terminal's stdin → agent stdin (your input goes through unchanged)
3. Pipes agent stdout → your terminal (you see everything)
4. Scans each line of agent output against your ruleset
5. When a rule matches: injects the correction text into agent stdin
6. Per-rule cooldowns prevent injection spam

The agent receives your correction as if you typed it — no framework changes, no API keys, no agent-specific integration.

## Why Not Just Use a Watchdog?

Tools like [TruPal](https://github.com/logpie/trupal) watch agent behavior and *show you alerts*. That requires you to be watching.

AgentCheck *acts* — it injects the correction automatically, in real-time, before the agent continues down the wrong path. You set the rules once and let the agent run unattended.

## Status

v0.1 — core proxy and injection works. Collecting feedback on which rules matter most.

→ **Try it and tell us what rules you'd add:** [agentcheck@agentmail.to](mailto:agentcheck@agentmail.to)

→ **Want the hosted version** (web dashboard, team rules, Slack alerts, injection history): [join the waitlist](mailto:agentcheck@agentmail.to?subject=Waitlist)

## CI Integration

Use agentcheck in GitHub Actions to audit AI agent output without injecting:

```yaml
- name: Install agentcheck
  run: npm install -g agentcheck

- name: Run agent with guardrails (shadow mode)
  run: |
    agentcheck --shadow --shadow-log /tmp/agentcheck.log -- your-agent-command

- name: Upload shadow log
  uses: actions/upload-artifact@v4
  with:
    name: agentcheck-shadow-log
    path: /tmp/agentcheck.log
```

Shadow mode observes what rules would have fired without modifying agent output. Upload the log as an artifact to audit AI sessions in CI.

See [`.github/workflows/agentcheck-demo.yml`](.github/workflows/agentcheck-demo.yml) for a full working example.

## License

MIT
