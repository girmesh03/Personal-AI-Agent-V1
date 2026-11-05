/**
 * @module scripts/killPort
 * @description Cross-platform port freer for client workspace using native OS process inspection.
 */
import { execSync } from 'node:child_process';
import process from 'node:process';

/**
 * Frees a specific TCP port by identifying and terminating occupying processes.
 * Supports Windows (netstat + taskkill) and POSIX (lsof + kill).
 *
 * @function freePort
 * @param {number} port - The target TCP port to inspect and free.
 * @returns {void}
 */
const freePort = (port) => {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`).toString();
      const lines = out.trim().split('\n');
      const pids = new Set();
      lines.forEach((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].endsWith(`:${port}`)) {
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && pid !== '4' && pid !== String(process.pid)) {
            pids.add(pid);
          }
        }
      });
      pids.forEach((pid) => {
        try {
          execSync(`taskkill /F /PID ${pid}`);
          console.log(`[client killPort] Terminated process ${pid} occupying port ${port}`);
        } catch {
          // Process already exited
        }
      });
    } else {
      execSync(`lsof -ti tcp:${port} | xargs kill -9`);
      console.log(`[client killPort] Freed port ${port}`);
    }
  } catch {
    // Port was not in use
  }
};

const targetPort = process.argv[2] ? parseInt(process.argv[2], 10) : 3000;
freePort(targetPort);
