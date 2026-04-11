'use strict';
// Integration test: simulate agent output with bad patterns and verify injection

const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');

const CLI = path.join(__dirname, 'cli.js');

// A mock "agent" that writes problematic output then waits for injection
const MOCK_AGENT = `
process.stdout.write("Let me analyze the problem\\n");
process.stdout.write("I think a pragmatic fix here would be to just catch the error\\n");
process.stdout.write("This is a pre-existing issue in the codebase\\n");
setTimeout(() => {
  process.stdout.write("Done\\n");
  process.exit(0);
}, 500);
`;

console.log('Test 1: rule matching + injection (dry-run)');

const child = spawn(process.execPath, [CLI, '--dry-run', '--verbose', '--', process.execPath, '-e', MOCK_AGENT], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

child.stdout.on('data', d => { stdout += d.toString(); });
child.stderr.on('data', d => { stderr += d.toString(); });

child.on('close', (code) => {
  try {
    assert(stderr.includes('pragmatic-fix') || stderr.includes('Rule'),
      'Should detect pragmatic-fix rule');
    assert(stderr.includes('pre-existing') || stderr.includes('pre-?existing'),
      'Should detect pre-existing rule');
    assert(stdout.includes('pragmatic fix') || stdout.includes('Let me analyze'),
      'Should have forwarded agent stdout');
    console.log('✓ Test 1 passed: rules fired, stdout forwarded');
    console.log('\nTest 2: --rules flag');
    testRulesFlag();
  } catch (e) {
    console.error('✗ Test 1 FAILED:', e.message);
    console.error('stdout:', stdout.slice(0,500));
    console.error('stderr:', stderr.slice(0,500));
    process.exit(1);
  }
});

function testRulesFlag() {
  const child2 = spawn(process.execPath, [CLI, '--rules'], { stdio: 'pipe' });
  let out = '';
  child2.stdout.on('data', d => out += d.toString());
  child2.on('close', () => {
    try {
      assert(out.includes('pragmatic-fix'), 'Should list pragmatic-fix rule');
      assert(out.includes('deleted-tests'), 'Should list deleted-tests rule');
      console.log('✓ Test 2 passed: --rules flag works');
      console.log('\nAll tests passed ✓');
    } catch (e) {
      console.error('✗ Test 2 FAILED:', e.message);
      process.exit(1);
    }
  });
}
