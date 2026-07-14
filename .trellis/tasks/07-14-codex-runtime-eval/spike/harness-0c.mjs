// Phase 0.C spike: prove per-tool permission gating. Force a shell command with an
// approval-requiring policy, intercept the server's approval request, and DENY it —
// proving the host is consulted per tool call before execution.
import { spawn } from 'node:child_process';

const child = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] });
let nextId = 1;
function send(method, params) { const id = nextId++; child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); console.log(`>> #${id} ${method}`); return id; }
function respond(id, result) { child.stdin.write(JSON.stringify({ id, result }) + '\n'); }

let threadId = null, approvalSeen = false, execOutputSeen = false, buf = '';
child.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }

    // server->host REQUEST (has id + method)
    if (msg.method && msg.id !== undefined) {
      if (/requestApproval|execCommandApproval|applyPatchApproval/i.test(msg.method)) {
        approvalSeen = true;
        const cmd = msg.params?.command ?? JSON.stringify(msg.params?.commandActions ?? msg.params);
        console.log(`\n<< APPROVAL REQUEST (${msg.method}) cmd=${cmd} -> responding DENIED`);
        respond(msg.id, { decision: 'denied' });
        continue;
      }
      // any other server-request: respond minimally so we don't hang
      console.log(`<< server-req ${msg.method} (unhandled -> deny)`);
      respond(msg.id, { decision: 'denied' });
      continue;
    }

    if (msg.method === 'thread/started') {
      threadId = msg.params?.threadId ?? msg.params?.thread?.id;
      console.log('<< thread/started', threadId);
      send('turn/start', { threadId, input: [{ type: 'text', text: 'Create a file at /tmp/codex_spike_proof.txt containing the text OK. Use your file/shell tools to actually create it.' }] });
      continue;
    }
    if (/commandExecution\/outputDelta|command\/exec\/outputDelta/.test(msg.method || '')) {
      execOutputSeen = true;
      console.log('<< (command produced output — would mean it RAN)');
    }
    if (msg.method === 'item/agentMessage/delta') process.stdout.write(msg.params?.delta ?? '');
    if (msg.method === 'turn/completed') {
      console.log('\n\n=== RESULT ===');
      console.log('approval request intercepted:', approvalSeen);
      console.log('command executed after denial:', execOutputSeen);
      console.log(approvalSeen && !execOutputSeen ? 'PASS: per-tool gating works (host consulted; deny blocked exec)' : approvalSeen ? 'PARTIAL: approval seen but exec output also seen' : 'INCONCLUSIVE: no approval request (policy may auto-handle)');
      cleanup(0); return;
    }
    if (msg.id !== undefined && msg.method === undefined) {
      if (msg.error) { console.log(`<< resp #${msg.id} ERROR`, JSON.stringify(msg.error).slice(0,300)); }
      if (initId === msg.id) send('thread/start', { cwd: process.cwd(), approvalPolicy: 'untrusted', sandbox: 'read-only' });
    }
  }
});
child.stderr.on('data', (d) => process.stderr.write('[stderr] ' + d.toString().slice(0, 300)));
child.on('exit', (c) => console.log('[exit]', c));
function cleanup(code) { try { child.kill('SIGTERM'); } catch {} setTimeout(() => process.exit(code), 300); }
const initId = send('initialize', { clientInfo: { name: 'cowork-spike', version: '0.0.0' }, capabilities: { experimentalApi: true, requestAttestation: false } });
setTimeout(() => { console.log('\n[TIMEOUT]'); console.log('approval seen:', approvalSeen); cleanup(2); }, 120000);
