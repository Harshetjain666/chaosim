import type { Scenario } from '../scenario/types.ts';
import type { IncidentState } from './types.ts';

export interface RunFlags {
  clear?: boolean;
  ranTests?: boolean;
  testsPassed?: boolean;
  restarted?: boolean;
  diagnosed?: boolean;
}

export interface RunResult {
  out: string[];
  flags: RunFlags;
}

const HELP = [
  'available commands',
  '  ls [path]            list files',
  '  cat <path>           print a file (try cat src/logs/error.log)',
  '  npm test             run the test suite',
  '  restart <service>    restart a service',
  '  git log              recent deploys',
  '  git diff             what the last deploy changed',
  '  status               incident status',
  '  clear                clear the terminal',
  '  help                 show this',
];

function findFile(scenario: Scenario, arg: string) {
  const q = arg.replace(/^\.\//, '');
  return scenario.files.find((f) => f.path === q || f.path.endsWith('/' + q) || f.name === q);
}

export function runCommand(raw: string, scenario: Scenario, state: IncidentState): RunResult {
  const input = raw.trim();
  if (input === '') return { out: [], flags: {} };
  const parts = input.split(/\s+/);
  const cmd = parts[0] ?? '';
  const arg = parts[1] ?? '';
  const rest = parts.slice(1).join(' ');

  if (cmd === 'help') return { out: HELP, flags: {} };
  if (cmd === 'clear') return { out: [], flags: { clear: true } };
  if (cmd === 'pwd') return { out: ['/srv/app'], flags: {} };
  if (cmd === 'whoami') return { out: [state.playerName || 'engineer'], flags: {} };

  if (cmd === 'ls') {
    const prefix = arg.replace(/^\.\//, '');
    const paths = scenario.files.map((f) => f.path).filter((p) => (prefix ? p.startsWith(prefix) : true));
    return { out: paths.length ? paths : [`ls: ${arg}: no such path`], flags: {} };
  }

  if (cmd === 'cat') {
    if (!arg) return { out: ['usage: cat <path>'], flags: {} };
    const file = findFile(scenario, rest);
    if (!file) return { out: [`cat: ${rest}: no such file`], flags: {} };
    const content = state.fileContents[file.path] ?? file.content;
    const flags: RunFlags = {};
    if (file.path.endsWith('error.log')) flags.diagnosed = true;
    return { out: content.replace(/\n$/, '').split('\n'), flags };
  }

  if (cmd === 'git' && arg === 'log') {
    return { out: scenario.deploys, flags: {} };
  }

  if (cmd === 'git' && (arg === 'diff' || arg === 'show')) {
    // Reading the bad change counts as diagnosis.
    return { out: scenario.diff.split('\n'), flags: { diagnosed: true } };
  }

  if (cmd === 'git' && arg === 'status') {
    return {
      out: ['On branch main', "Your branch is up to date with 'origin/main'.", '', 'nothing to commit, working tree clean'],
      flags: {},
    };
  }

  if (cmd === 'git') {
    return { out: [`git ${arg}: not wired up in this sim. try: git log, git diff, git status`], flags: {} };
  }

  if (cmd === 'npm' && (arg === 'install' || arg === 'ci' || arg === 'i')) {
    return { out: ['up to date, audited 312 packages in 0.6s', '', 'found 0 vulnerabilities'], flags: {} };
  }

  if ((cmd === 'npm' && (arg === 'test' || arg === 'run')) || cmd === 'test' || cmd === 'jest') {
    const content = state.fileContents[scenario.bugFile] ?? '';
    const passed = scenario.isFixed(content);
    if (passed) {
      return {
        out: ['> jest', '', ` PASS  ${scenario.testFile}`, `    ✓ ${scenario.testName} (24 ms)`, '', 'Tests: 1 passed, 1 total'],
        flags: { ranTests: true, testsPassed: true },
      };
    }
    return {
      out: ['> jest', '', ` FAIL  ${scenario.testFile}`, `    ✕ ${scenario.testName} (31 ms)`, '', ...scenario.failTrace.map((l) => '    ' + l), '', 'Tests: 1 failed, 1 total'],
      flags: { ranTests: true, testsPassed: false },
    };
  }

  if (cmd === 'restart' || (cmd === 'npm' && arg === 'start')) {
    const target = cmd === 'restart' ? rest || scenario.serviceName : scenario.serviceName;
    const content = state.fileContents[scenario.bugFile] ?? '';
    const fixed = scenario.isFixed(content);
    if (fixed && state.testsPassed) {
      return {
        out: [`restarting ${target}...`, `${target} is up. error rate back to 0%.`, 'incident mitigated.'],
        flags: { restarted: true },
      };
    }
    if (fixed && !state.testsPassed) {
      return {
        out: [`restarting ${target}...`, `${target} is up. run npm test to confirm before you call it.`],
        flags: { restarted: true },
      };
    }
    return {
      out: [`restarting ${target}...`, `${target} is back, but the same failures continue: ${scenario.crashLine}`, 'the code is still broken.'],
      flags: {},
    };
  }

  if (cmd === 'npm') {
    return { out: [`npm ${arg}: not wired up in this sim. try: npm test, npm install, npm start`], flags: {} };
  }

  if (cmd === 'status') {
    return {
      out: [
        `incident ${scenario.code} · ${scenario.title}`,
        `tests: ${state.testsPassed ? 'passing' : state.testsRun ? 'failing' : 'not run'}`,
        `service: ${state.resolved ? 'healthy' : 'down'}`,
      ],
      flags: {},
    };
  }

  return { out: [`command not found: ${cmd}. type help`], flags: {} };
}
