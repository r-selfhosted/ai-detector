import { spawn } from 'node:child_process';

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandOptions {
  cwd?: string;
  timeoutMs?: number;
}

export function runCommand(command: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          if (settled) {
            return;
          }

          settled = true;
          child.kill('SIGTERM');
          reject(new Error(`Command timed out: ${command} ${args.join(' ')}`));
        }, options.timeoutMs)
      : undefined;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      reject(error);
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr.trim() || `Command failed with exit code ${code}`));
    });
  });
}
