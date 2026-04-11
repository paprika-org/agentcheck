'use strict';

const { spawn } = require('child_process');
const EventEmitter = require('events');

class AgentProxy extends EventEmitter {
  constructor(rules, options = {}) {
    super();
    this.rules = rules;
    this.options = {
      verbose: options.verbose || false,
      dryRun: options.dryRun || false,
      shadow: options.shadow || false,
      shadowLog: options.shadowLog || '.agentcheck-shadow.log',
      logFile: options.logFile || null
    };
    // Per-rule cooldown tracking: ruleId -> last triggered timestamp
    this.lastFired = {};
    this.injectionCount = 0;
    this.matchCount = 0;
    this.shadowCount = 0;
  }

  start(command, args) {
    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    this.proc = proc;

    // Forward our stdin to the agent
    process.stdin.pipe(proc.stdin);

    // Watch agent stdout
    let buffer = '';
    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      buffer += text;

      // Forward to our stdout immediately
      process.stdout.write(chunk);

      // Check rules against the buffer (avoid checking mid-line)
      const lines = buffer.split('\n');
      // Keep the last incomplete line in buffer
      buffer = lines.pop();

      for (const line of lines) {
        this._checkLine(line, proc);
      }
    });

    // Forward stderr
    proc.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      // Also check stderr for patterns
      const text = chunk.toString();
      for (const line of text.split('\n')) {
        this._checkLine(line, proc);
      }
    });

    proc.on('close', (code) => {
      if (this.options.shadow) {
        const msg = this.shadowCount > 0
          ? `[agentcheck] 👁  Shadow mode: ${this.shadowCount} correction(s) would have fired. See ${this.options.shadowLog}`
          : `[agentcheck] 👁  Shadow mode: no rules matched this session.`;
        process.stderr.write('\n' + msg + '\n');
      } else {
        this._log(`\n[agentcheck] Session ended. ${this.matchCount} patterns matched, ${this.injectionCount} corrections injected.`);
      }
      process.exit(code || 0);
    });

    proc.on('error', (err) => {
      console.error(`[agentcheck] Failed to start agent: ${err.message}`);
      process.exit(1);
    });

    // Handle our process signals
    process.on('SIGINT', () => proc.kill('SIGINT'));
    process.on('SIGTERM', () => proc.kill('SIGTERM'));

    return proc;
  }

  _checkLine(line, proc) {
    if (!line.trim()) return;

    for (const rule of this.rules) {
      if (!rule.pattern.test(line)) continue;

      this.matchCount++;

      // Check cooldown
      const now = Date.now();
      const lastFired = this.lastFired[rule.id] || 0;
      if (now - lastFired < rule.cooldown * 1000) continue;

      this.lastFired[rule.id] = now;

      if (this.options.shadow) {
        // Shadow mode: log what would fire, never inject
        this.shadowCount++;
        this._shadowLog(rule, line);
        continue;
      }

      this.injectionCount++;

      const msg = `\n[agentcheck] ⚠ Rule '${rule.id}' triggered. Injecting correction.\n`;

      if (this.options.verbose) {
        process.stderr.write(msg);
      }

      this._logMatch(rule, line);

      if (!this.options.dryRun && proc.stdin.writable) {
        // Inject the correction as a new user message
        const injection = `\n${rule.inject}\n`;
        proc.stdin.write(injection);
      }

      this.emit('injection', { rule, line, injection: rule.inject });
    }
  }

  _shadowLog(rule, line) {
    const fs = require('fs');
    const ts = new Date().toISOString().slice(11, 19);
    const entry = `[${ts}] WOULD FIRE: ${rule.id}\n  matched: ${line.trim().slice(0, 120)}\n  would inject: ${rule.inject.slice(0, 200)}\n\n`;
    try {
      fs.appendFileSync(this.options.shadowLog, entry);
    } catch (e) {
      // best-effort
    }
  }

  _log(msg) {
    if (this.options.verbose) {
      process.stderr.write(msg + '\n');
    }
    if (this.options.logFile) {
      const fs = require('fs');
      fs.appendFileSync(this.options.logFile, msg + '\n');
    }
  }

  _logMatch(rule, line) {
    const ts = new Date().toISOString().slice(11, 19);
    const logLine = `[${ts}] RULE:${rule.id} | LINE: ${line.trim().slice(0, 120)}\n  → INJECT: ${rule.inject.slice(0, 100)}\n`;
    this._log(logLine);
    if (this.options.logFile) {
      const fs = require('fs');
      fs.appendFileSync(this.options.logFile, logLine);
    }
  }
}

module.exports = { AgentProxy };
