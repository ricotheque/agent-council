#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

function exitWithError(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }

    const [key, rawValue] = a.split('=', 2);
    if (rawValue != null) {
      out[key.slice(2)] = rawValue;
      continue;
    }
    const next = args[i + 1];
    if (next == null || next.startsWith('--')) {
      out[key.slice(2)] = true;
      continue;
    }
    out[key.slice(2)] = next;
    i++;
  }
  return out;
}

function splitCommand(command) {
  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escapeNext = false;

  for (const ch of String(command || '')) {
    if (escapeNext) {
      current += ch;
      escapeNext = false;
      continue;
    }

    if (!inSingle && ch === '\\') {
      escapeNext = true;
      continue;
    }

    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
      continue;
    }

    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
      continue;
    }

    if (!inSingle && !inDouble && /\s/.test(ch)) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  if (current) tokens.push(current);
  if (inSingle || inDouble) return null;
  return tokens;
}

function atomicWriteJson(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function main() {
  const options = parseArgs(process.argv);
  const jobDir = options['job-dir'];
  const member = options.member;
  const safeMember = options['safe-member'];
  const command = options.command;
  const timeoutSec = options.timeout ? Number(options.timeout) : 0;
  const workDir = options['work-dir'];
  const promptFile = options['prompt-file'];
  const mode = options.mode || 'review';
  const worktreeDir = options['worktree-dir'];
  const baseCommit = options['base-commit'];

  if (!jobDir) exitWithError('worker: missing --job-dir');
  if (!member) exitWithError('worker: missing --member');
  if (!safeMember) exitWithError('worker: missing --safe-member');
  if (!command) exitWithError('worker: missing --command');

  // Issue 7b: Validate paths resolve under jobDir
  const resolvedJobDir = path.resolve(jobDir);
  if (workDir) {
    const resolvedWorkDir = path.resolve(workDir);
    if (!resolvedWorkDir.startsWith(resolvedJobDir + path.sep) && resolvedWorkDir !== resolvedJobDir) {
      exitWithError(`worker: --work-dir must be under --job-dir`);
    }
  }
  if (promptFile) {
    const resolvedPromptFile = path.resolve(promptFile);
    if (!resolvedPromptFile.startsWith(resolvedJobDir + path.sep) && resolvedPromptFile !== resolvedJobDir) {
      exitWithError(`worker: --prompt-file must be under --job-dir`);
    }
  }

  const memberDir = workDir || path.join(path.join(jobDir, 'members'), safeMember);
  const statusPath = path.join(memberDir, 'status.json');
  const outPath = path.join(memberDir, 'output.txt');
  const errPath = path.join(memberDir, 'error.txt');

  const promptPath = promptFile || path.join(jobDir, 'prompt.txt');
  let prompt = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : '';

  // In code mode, prepend agent briefing
  if (mode === 'code' && worktreeDir) {
    const briefing = `You are working in an isolated git worktree. Implement the requested changes directly by editing files. Your changes will be captured automatically via git diff when you're done. Do not describe what you would do — actually do it.\n\n`;
    prompt = briefing + prompt;
  }

  const tokens = splitCommand(command);
  if (!tokens || tokens.length === 0) {
    atomicWriteJson(statusPath, {
      member,
      state: 'error',
      message: 'Invalid command string',
      finishedAt: new Date().toISOString(),
      command,
    });
    process.exit(1);
  }

  const program = tokens[0];
  const args = tokens.slice(1);

  atomicWriteJson(statusPath, {
    member,
    state: 'running',
    startedAt: new Date().toISOString(),
    command,
    pid: null,
  });

  const outStream = fs.createWriteStream(outPath, { flags: 'w' });
  const errStream = fs.createWriteStream(errPath, { flags: 'w' });

  const spawnOpts = {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  };
  // In code mode, run agent inside the worktree directory
  if (mode === 'code' && worktreeDir) {
    spawnOpts.cwd = worktreeDir;
  }

  let child;
  try {
    child = spawn(program, [...args, prompt], spawnOpts);
  } catch (error) {
    atomicWriteJson(statusPath, {
      member,
      state: 'error',
      message: error && error.message ? error.message : 'Failed to spawn command',
      finishedAt: new Date().toISOString(),
      command,
    });
    process.exit(1);
  }

  atomicWriteJson(statusPath, {
    member,
    state: 'running',
    startedAt: new Date().toISOString(),
    command,
    pid: child.pid,
  });

  if (child.stdout) child.stdout.pipe(outStream);
  if (child.stderr) child.stderr.pipe(errStream);

  // Forward SIGTERM/SIGINT to child; force-exit if child doesn't die
  const forwardSignal = () => {
    if (child && child.pid) {
      try { process.kill(child.pid, 'SIGTERM'); } catch { /* ignore */ }
    }
    // Force exit after 5s if child ignores the signal
    const forceExit = setTimeout(() => process.exit(130), 5000);
    forceExit.unref();
  };
  process.on('SIGTERM', forwardSignal);
  process.on('SIGINT', forwardSignal);

  let timeoutHandle = null;
  let timeoutTriggered = false;
  if (Number.isFinite(timeoutSec) && timeoutSec > 0) {
    timeoutHandle = setTimeout(() => {
      timeoutTriggered = true;
      try {
        process.kill(child.pid, 'SIGTERM');
      } catch {
        // ignore
      }
    }, timeoutSec * 1000);
    timeoutHandle.unref();
  }

  const finalize = (payload) => {
    try {
      outStream.end();
      errStream.end();
    } catch {
      // ignore
    }
    atomicWriteJson(statusPath, payload);
  };

  child.on('error', (error) => {
    const isMissing = error && error.code === 'ENOENT';
    finalize({
      member,
      state: isMissing ? 'missing_cli' : 'error',
      message: error && error.message ? error.message : 'Process error',
      finishedAt: new Date().toISOString(),
      command,
      exitCode: null,
      pid: child.pid,
    });
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    const timedOut = Boolean(timeoutTriggered) && signal === 'SIGTERM';
    const canceled = !timedOut && signal === 'SIGTERM';
    const state = timedOut ? 'timed_out' : canceled ? 'canceled' : code === 0 ? 'done' : 'error';

    // In code mode, collect diff from worktree against the pinned base commit
    let hasDiff = false;
    if (mode === 'code' && worktreeDir && (state === 'done' || state === 'error')) {
      try {
        const { execFileSync } = require('child_process');
        // Stage all changes including untracked files
        execFileSync('git', ['add', '-A'], { cwd: worktreeDir, stdio: 'ignore' });
        // Diff against pinned base commit (not HEAD, which may have moved if agent committed)
        const diffRef = baseCommit || 'HEAD';
        const diff = execFileSync('git', ['diff', '--cached', diffRef], { cwd: worktreeDir, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        const diffPath = path.join(memberDir, 'diff.patch');
        fs.writeFileSync(diffPath, diff, 'utf8');
        hasDiff = diff.trim().length > 0;
      } catch {
        // Diff collection failed — not fatal, agent output is still available
      }
    }

    finalize({
      member,
      state,
      message: timedOut ? `Timed out after ${timeoutSec}s` : canceled ? 'Canceled' : null,
      finishedAt: new Date().toISOString(),
      command,
      exitCode: typeof code === 'number' ? code : null,
      signal: signal || null,
      pid: child.pid,
      mode,
      hasDiff,
      worktreeDir: worktreeDir || null,
    });
    process.exit(code === 0 ? 0 : 1);
  });
}

if (require.main === module) {
  main();
}
