// 独立 Node 入口，随应用打包到 Resources；不依赖 Electron 的 RunAsNode fuse。
const { request } = require('node:http');
const { spawn } = require('node:child_process');
const MAX_BYTES = 1024 * 1024;

async function readInput(input) {
  const chunks = []; let size = 0;
  for await (const chunk of input) {
    size += chunk.length;
    if (size <= MAX_BYTES) chunks.push(Buffer.from(chunk));
  }
  return size <= MAX_BYTES ? Buffer.concat(chunks) : null;
}
function forward(data, env) {
  return new Promise(resolve => {
    let url, payload;
    try { url = new URL(env.NAVO_STATUSLINE_URL); payload = JSON.parse(data.toString('utf8')); }
    catch { resolve(); return; }
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/statusline' || url.search || url.username || url.password || !env.NAVO_STATUSLINE_TOKEN) { resolve(); return; }
    // 只传身份和上下文窗口；用户原有命令仍接收完整原始字节。
    const body = JSON.stringify({ session_id: payload?.session_id, conversation_id: payload?.conversation_id, product: payload?.product, context_window: payload?.context_window });
    const pending = request(url, { method: 'POST', timeout: 750, agent: false, headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Authorization: `Bearer ${env.NAVO_STATUSLINE_TOKEN}`,
    } }, response => { response.resume(); response.on('end', resolve); response.on('error', resolve); });
    pending.on('error', resolve); pending.on('timeout', () => { pending.destroy(); resolve(); });
    pending.end(body);
  });
}
function passThrough(data, env) {
  const command = env.NAVO_STATUSLINE_PASSTHROUGH;
  if (!command) return Promise.resolve(0);
  return new Promise(resolve => {
    const childEnv = { ...env };
    for (const key of Object.keys(childEnv)) if (key.startsWith('NAVO_STATUSLINE_')) delete childEnv[key];
    // 沿用 CLI 对 command 的 Shell 执行语义，转发原始输入和输出，不解析或重写用户命令。
    const child = spawn(command, { shell: true, cwd: process.cwd(), env: childEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
    child.stdin.on('error', () => {}); child.stdin.end(data);
    child.on('error', () => resolve(0)); child.on('close', code => resolve(code ?? 0));
  });
}
async function main() {
  const data = await readInput(process.stdin);
  if (!data) return 0;
  const [, code] = await Promise.all([forward(data, process.env), passThrough(data, process.env)]);
  return code;
}
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(() => { process.exitCode = 0; });
