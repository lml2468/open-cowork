// Phase 0.B spike: drive `codex app-server` over stdio (JSON-RPC v2, newline-delimited).
// Goal: initialize -> thread/start -> turn/start (trivial text prompt) -> observe streamed
// item/agentMessage/delta + turn/completed. Pure text prompt avoids tool calls/approvals.
import { spawn } from 'node:child_process';

const child = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] });

let nextId = 1;
const pending = new Map();
function send(method, params) {
  const id = nextId++;
  const msg = { id, method, params };
  child.stdin.write(JSON.stringify(msg) + '\n');
  console.log(`>> #${id} ${method}`);
  return id;
}
function respond(id, result) {
  child.stdin.write(JSON.stringify({ id, result }) + '\n');
  console.log(`>> resp #${id}`);
}

let threadId = null;
let gotDelta = false;
let buf = '';
child.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { console.log('NON-JSON:', line.slice(0, 200)); continue; }

    // Server->client request (approvals / dynamic tool). Auto-approve for the smoke test.
    if (msg.method && msg.id !== undefined && msg.result === undefined && msg.params !== undefined && !('id' in msg && msg.method === undefined)) {
      if (typeof msg.id !== 'undefined' && msg.method) {
        console.log(`<< SERVER-REQ ${msg.method}`);
        if (/requestApproval|execCommandApproval|applyPatchApproval/i.test(msg.method)) {
          respond(msg.id, { decision: 'approved' });
          continue;
        }
      }
    }

    if (msg.method === 'item/agentMessage/delta') {
      if (!gotDelta) { console.log('<< FIRST agentMessage delta'); gotDelta = true; }
      const d = msg.params?.delta ?? msg.params?.text ?? '';
      process.stdout.write(d);
      continue;
    }
    if (msg.method === 'thread/started') {
      threadId = msg.params?.threadId ?? msg.params?.thread?.id ?? msg.params?.id;
      console.log('\n<< thread/started threadId=', threadId);
      send('turn/start', { threadId, input: [{ type: 'text', text: 'Reply with exactly: PONG' }] });
      continue;
    }
    if (msg.method === 'turn/completed') {
      console.log('\n<< turn/completed — SMOKE TEST PASSED (streaming ok)');
      cleanup(0);
      return;
    }
    if (msg.method === 'error' || msg.error) {
      console.log('<< ERROR', JSON.stringify(msg).slice(0, 400));
    }
    // Response to one of our requests
    if (msg.id !== undefined && msg.method === undefined) {
      console.log(`<< resp #${msg.id}`, msg.error ? 'ERROR ' + JSON.stringify(msg.error).slice(0,200) : 'ok');
      if (msg.error) { cleanup(1); return; }
      if (initId === msg.id) {
        send('thread/start', { cwd: process.cwd(), approvalPolicy: 'never', sandbox: 'read-only' });
      }
    }
  }
});

child.stderr.on('data', (d) => process.stderr.write('[stderr] ' + d.toString()));
child.on('exit', (code) => console.log('\n[app-server exited]', code));

function cleanup(code) { try { child.kill('SIGTERM'); } catch {} setTimeout(() => process.exit(code), 300); }

const initId = send('initialize', { clientInfo: { name: 'cowork-spike', version: '0.0.0' }, capabilities: null });
setTimeout(() => { console.log('\n[TIMEOUT 90s]'); cleanup(2); }, 90000);
