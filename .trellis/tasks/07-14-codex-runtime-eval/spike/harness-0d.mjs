// Phase 0.D spike: (1) OpenAI-compatible provider via model_providers base_url/wire_api,
// (2) sandbox delegation via danger-full-access (codex sandbox off -> app VM would isolate).
// App-server spawned with a custom provider "spikeoai" pointing at OpenAI's chat API.
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const PROOF = '/tmp/codex_spike_sandbox.txt';
try { rmSync(PROOF, { force: true }); } catch {}

const child = spawn('codex', ['app-server',
  '-c', 'model_providers.spikeoai.name="spikeoai"',
  '-c', 'model_providers.spikeoai.base_url="https://api.openai.com/v1"',
  '-c', 'model_providers.spikeoai.wire_api="responses"',
  '-c', 'model_providers.spikeoai.env_key="OPENAI_API_KEY"',
], { stdio: ['pipe', 'pipe', 'pipe'] });

let nextId = 1;
function send(method, params) { const id = nextId++; child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); console.log(`>> #${id} ${method} ${params?.modelProvider ? '(provider=' + params.modelProvider + ')' : ''}${params?.sandbox ? '(sandbox=' + params.sandbox + ')' : ''}`); return id; }
function respond(id, result) { child.stdin.write(JSON.stringify({ id, result }) + '\n'); }

let stage = 'provider';         // 'provider' -> 'sandbox' -> done
let providerOk = false, sandboxApprovalSeen = false;
let buf = '';
child.stdout.on('data', (chunk) => {
  buf += chunk.toString(); let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }

    if (msg.method && msg.id !== undefined) { // server-request
      if (/requestApproval/i.test(msg.method)) { sandboxApprovalSeen = true; respond(msg.id, { decision: 'accept' }); }
      else respond(msg.id, {});
      continue;
    }
    if (msg.method === 'item/agentMessage/delta') process.stdout.write(msg.params?.delta ?? '');
    if (msg.method === 'error' || msg.error) console.log('<< ERR', JSON.stringify(msg.params ?? msg.error).slice(0, 300));

    if (msg.method === 'thread/started') {
      const tid = msg.params?.threadId ?? msg.params?.thread?.id;
      if (stage === 'provider') send('turn/start', { threadId: tid, model: 'gpt-4o-mini', input: [{ type: 'text', text: 'Reply with exactly: PROVIDER_OK' }] });
      else send('turn/start', { threadId: tid, input: [{ type: 'text', text: `Write the text OK to the file ${PROOF} using your shell tool.` }] });
      continue;
    }
    if (msg.method === 'turn/completed') {
      if (stage === 'provider') {
        providerOk = true;
        console.log('\n<< provider turn/completed → OpenAI-compatible base_url+wire_api WORKS');
        stage = 'sandbox';
        send('thread/start', { cwd: process.cwd(), approvalPolicy: 'never', sandbox: 'danger-full-access' });
      } else {
        const created = existsSync(PROOF);
        console.log('\n\n=== RESULT ===');
        console.log('provider (OpenAI-compatible base_url) works:', providerOk);
        console.log('danger-full-access: approval asked?', sandboxApprovalSeen, '| file written?', created);
        console.log(providerOk && created && !sandboxApprovalSeen
          ? 'PASS: provider override works; danger-full-access ran without codex approval/sandbox (app VM would isolate)'
          : 'SEE ABOVE');
        cleanup(0); return;
      }
      continue;
    }
    if (msg.id !== undefined && msg.method === undefined) {
      if (msg.error) console.log(`<< resp #${msg.id} ERROR`, JSON.stringify(msg.error).slice(0, 300));
      if (msg.id === initId) send('thread/start', { cwd: process.cwd(), modelProvider: 'spikeoai', approvalPolicy: 'never', sandbox: 'read-only' });
    }
  }
});
child.stderr.on('data', (d) => { const s = d.toString(); if (/ERROR|error=/.test(s)) process.stderr.write('[stderr] ' + s.slice(0, 300)); });
child.on('exit', (c) => console.log('[exit]', c));
function cleanup(code) { try { child.kill('SIGTERM'); } catch {} setTimeout(() => process.exit(code), 300); }
const initId = send('initialize', { clientInfo: { name: 'cowork-spike', version: '0.0.0' }, capabilities: { experimentalApi: true, requestAttestation: false } });
setTimeout(() => { console.log('\n[TIMEOUT] providerOk=', providerOk); cleanup(2); }, 150000);
