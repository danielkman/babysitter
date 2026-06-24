#!/usr/bin/env node
import { createAgentIpcClient } from '../src/ipc-client.js';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

async function main() {
  const socketPath = process.argv[2] || process.env.JITSI_AGENT_SOCKET || process.env.AGENT_SOCKET_PATH;
  if (!socketPath) {
    throw new Error('socket path required (argv[2] | JITSI_AGENT_SOCKET | AGENT_SOCKET_PATH)');
  }

  const raw = process.argv[3] || (await readStdin());
  if (!raw || !raw.trim()) {
    throw new Error('command JSON required (argv[3] or stdin)');
  }
  const command = JSON.parse(raw);

  const client = createAgentIpcClient({ socketPath });
  await client.connect();
  try {
    const result = await client.send(command);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await client.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${err?.message || String(err)}\n`);
    process.exit(1);
  });
