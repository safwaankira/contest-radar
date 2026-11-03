// Copy the agent-readable files (feeds, agent card, llms.txt, MCP manifest) next to the built web app.
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const out = 'web/dist';
await mkdir(out, { recursive: true });
for (const path of ['feed', '.well-known', 'llms.txt', 'server.json']) {
  if (existsSync(path)) await cp(path, `${out}/${path}`, { recursive: true });
}
console.log('staged feed, .well-known, llms.txt, server.json');
