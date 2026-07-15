// Phase 5.2 live validation: dynamicTools registration + item/tool/call round-trip.
// Proves codex (with experimentalApi) registers a host tool via thread/start.dynamicTools
// and calls back via item/tool/call, accepting the {contentItems:[{type:'inputText'}],success} envelope.
import { spawn } from 'node:child_process';
const child = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] });
let nextId = 1;
const send = (method, params) => { const id = nextId++; child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); console.log(`>> #${id} ${method}`); return id; };
const respond = (id, result) => child.stdin.write(JSON.stringify({ id, result }) + '\n');
let toolCalled = false, buf = '';
child.stdout.on('data', (c) => {
  buf += c.toString(); let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.method && m.id !== undefined) { // server request
      if (m.method === 'item/tool/call') {
        toolCalled = true;
        console.log(`\n<< item/tool/call tool=${m.params?.tool} args=${JSON.stringify(m.params?.arguments)} -> responding contentItems/inputText`);
        respond(m.id, { contentItems: [{ type: 'inputText', text: 'echoed: ' + (m.params?.arguments?.text ?? '') }], success: true });
      } else if (/requestApproval/i.test(m.method)) { respond(m.id, { decision: 'accept' }); }
      else respond(m.id, {});
      continue;
    }
    if (m.method === 'item/agentMessage/delta') process.stdout.write(m.params?.delta ?? '');
    if (m.method === 'error' || m.error) console.log('<< ERR', JSON.stringify(m.params ?? m.error).slice(0, 200));
    if (m.method === 'thread/started') {
      const tid = m.params?.threadId ?? m.params?.thread?.id;
      send('turn/start', { threadId: tid, input: [{ type: 'text', text: 'Call the spike_echo tool with text set to HELLO_TOOL. You must use the tool; do not answer directly.' }] });
    }
    if (m.method === 'turn/completed') {
      console.log('\n\n=== RESULT ===');
      console.log(toolCalled ? 'PASS: codex registered the dynamicTool and invoked it via item/tool/call' : 'FAIL: item/tool/call never fired (dynamicTools not registered?)');
      cleanup(toolCalled ? 0 : 1); return;
    }
    if (m.id !== undefined && m.method === undefined) {
      if (m.error) console.log(`<< resp #${m.id} ERROR`, JSON.stringify(m.error).slice(0, 200));
      if (m.id === initId) send('thread/start', {
        approvalPolicy: 'never', sandbox: 'read-only',
        dynamicTools: [{ type: 'function', name: 'spike_echo', description: 'Echo back the given text.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } }],
      });
    }
  }
});
child.stderr.on('data', (d) => { const s = d.toString(); if (/ERROR|error=/.test(s)) process.stderr.write('[stderr] ' + s.slice(0, 200)); });
child.on('exit', (c) => console.log('[exit]', c));
const cleanup = (code) => { try { child.kill('SIGTERM'); } catch {} setTimeout(() => process.exit(code), 300); };
const initId = send('initialize', { clientInfo: { name: 'cowork-spike', version: '0.0.0' }, capabilities: { experimentalApi: true, requestAttestation: false } });
setTimeout(() => { console.log('\n[TIMEOUT] toolCalled=', toolCalled); cleanup(2); }, 120000);
