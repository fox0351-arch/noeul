import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FLAG = 'NEXT_PUBLIC_ENABLE_LOCATION_SIM';
const ENV_FILES = ['.env', '.env.local', '.env.production', '.env.production.local'];

function fail(source) {
  console.error(
    `[노을] 운영 빌드 중단: ${source}에서 ${FLAG}=true 입니다. 현장·배포 빌드에는 가상 GPS를 넣을 수 없습니다.`
  );
  process.exit(1);
}

if (process.env[FLAG] === 'true') {
  fail('환경 변수');
}

for (const file of ENV_FILES) {
  const full = resolve(process.cwd(), file);
  if (!existsSync(full)) continue;
  const text = readFileSync(full, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^NEXT_PUBLIC_ENABLE_LOCATION_SIM\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[1].trim().replace(/^['"]|['"]$/g, '');
    if (value === 'true') fail(file);
  }
}

console.log(`[노을] 위치 시뮬 가드 통과 (${FLAG}가 true가 아닙니다).`);
