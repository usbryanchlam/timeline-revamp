import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';

// Spawns Vite + Hono in parallel and forwards SIGINT/SIGTERM/SIGHUP to
// both. Avoids the `concurrently` npm dependency in favor of plain
// node:child_process — fewer surprises around signal handling on macOS.
//
// Each child's stdout/stderr is line-buffered and prefixed with [web]
// or [api] so the developer can tell which process logged what.

interface ChildSpec {
  label: string;
  command: string;
  args: string[];
}

const children: ChildSpec[] = [
  { label: 'web', command: 'bun', args: ['x', 'vite'] },
  { label: 'api', command: 'bun', args: ['x', 'tsx', 'watch', 'server/index.ts'] },
];

interface RunningChild {
  label: string;
  proc: ChildProcess;
}

function prefixStream(label: string, stream: NodeJS.ReadableStream, sink: NodeJS.WritableStream): void {
  let buffer = '';
  stream.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    // Last element may be a partial line — keep it for the next chunk.
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      sink.write(`[${label}] ${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer.length > 0) {
      sink.write(`[${label}] ${buffer}\n`);
      buffer = '';
    }
  });
}

const running: RunningChild[] = children.map(({ label, command, args }) => {
  const proc = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  if (proc.stdout) prefixStream(label, proc.stdout, process.stdout);
  if (proc.stderr) prefixStream(label, proc.stderr, process.stderr);
  return { label, proc };
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals, exitCode: number | null): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of running) {
    if (child.proc.exitCode === null && child.proc.signalCode === null) {
      child.proc.kill(signal);
    }
  }
  // Give children a moment to die cleanly; then exit.
  setTimeout(() => {
    process.exit(exitCode ?? 0);
  }, 500).unref();
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => shutdown(sig, 0));
}

for (const child of running) {
  child.proc.on('exit', (code, signal) => {
    process.stdout.write(
      `[${child.label}] exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})\n`,
    );
    // First-to-die wins: tear down siblings and propagate the exit code.
    shutdown('SIGTERM', code ?? (signal !== null ? 1 : 0));
  });
  child.proc.on('error', (err) => {
    process.stderr.write(`[${child.label}] spawn error: ${err.message}\n`);
    shutdown('SIGTERM', 1);
  });
}
