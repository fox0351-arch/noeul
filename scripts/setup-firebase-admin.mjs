import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
const token = randomBytes(24).toString('base64url');
const maxBodySize = 100 * 1024;

function pageHtml() {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Firebase 서비스 계정 설정</title>
  <style>
    body { margin: 0; padding: 24px; font-family: sans-serif; background: #f1f5f9; color: #0f172a; }
    main { max-width: 560px; margin: 40px auto; padding: 24px; background: white; border-radius: 16px; }
    input, button { display: block; width: 100%; min-height: 48px; margin-top: 16px; box-sizing: border-box; }
    button { border: 0; border-radius: 10px; background: #1d4ed8; color: white; font-weight: 700; }
    #message { margin-top: 16px; font-weight: 700; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main>
    <h1>Firebase 서비스 계정 설정</h1>
    <p>Firebase에서 내려받은 JSON 파일을 선택하세요.</p>
    <p>파일 내용은 이 컴퓨터 밖으로 전송되지 않습니다.</p>
    <input id="file" type="file" accept=".json,application/json">
    <button id="apply" type="button">.env.local에 적용</button>
    <p id="message"></p>
  </main>
  <script>
    const fileInput = document.getElementById('file');
    const button = document.getElementById('apply');
    const message = document.getElementById('message');
    button.addEventListener('click', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        message.textContent = '먼저 JSON 파일을 선택해 주세요.';
        return;
      }
      button.disabled = true;
      message.textContent = '설정하는 중입니다.';
      try {
        const json = JSON.parse(await file.text());
        const response = await fetch('/configure?token=${token}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(json),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '설정에 실패했습니다.');
        message.textContent = '설정이 완료되었습니다. 이 창을 닫고 개발 서버를 다시 시작하세요.';
        fileInput.value = '';
      } catch (error) {
        message.textContent = error instanceof Error ? error.message : '설정에 실패했습니다.';
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

function replaceEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.trimEnd()}\n${line}\n`;
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodySize) throw new Error('JSON 파일이 너무 큽니다.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (request.method === 'GET' && url.pathname === '/' && url.searchParams.get('token') === token) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(pageHtml());
    return;
  }

  if (
    request.method !== 'POST' ||
    url.pathname !== '/configure' ||
    url.searchParams.get('token') !== token
  ) {
    response.writeHead(404).end();
    return;
  }

  try {
    const key = JSON.parse(await readBody(request));
    if (
      typeof key.project_id !== 'string' ||
      typeof key.client_email !== 'string' ||
      typeof key.private_key !== 'string' ||
      !key.private_key.includes('BEGIN PRIVATE KEY')
    ) {
      throw new Error('Firebase 서비스 계정 JSON 파일이 아닙니다.');
    }

    let env = await readFile(envPath, 'utf8').catch(() => '');
    const configuredProject = /^NEXT_PUBLIC_FIREBASE_PROJECT_ID=(.+)$/m.exec(env)?.[1]?.trim();
    if (configuredProject && configuredProject !== key.project_id) {
      throw new Error(`프로젝트가 다릅니다. ${configuredProject} 프로젝트의 키를 선택하세요.`);
    }

    const privateKey = key.private_key.replace(/\r/g, '').replace(/\n/g, '\\n');
    env = replaceEnvValue(env, 'FIREBASE_ADMIN_PROJECT_ID', key.project_id);
    env = replaceEnvValue(env, 'FIREBASE_ADMIN_CLIENT_EMAIL', key.client_email);
    env = replaceEnvValue(env, 'FIREBASE_ADMIN_PRIVATE_KEY', `"${privateKey}"`);
    await writeFile(envPath, env, 'utf8');

    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true }));
    setTimeout(() => server.close(), 500);
  } catch (error) {
    response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(
      JSON.stringify({ error: error instanceof Error ? error.message : '설정에 실패했습니다.' })
    );
  }
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') return;
  const url = `http://127.0.0.1:${address.port}/?token=${token}`;
  console.log('브라우저에서 Firebase 서비스 계정 JSON 파일을 선택하세요.');
  console.log(`브라우저가 열리지 않으면 이 주소를 여세요: ${url}`);
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  }
});
