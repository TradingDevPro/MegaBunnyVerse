#!/usr/bin/env node
/**
 * restore.js  v1.2
 *  ─ 통합 텍스트를 각 원본 파일로 복원
 *
 * 사용법
 *   ▸ node restore.js combined.txt
 *   ▸ type combined.txt | node restore.js      (Windows 파이프)
 *   ▸ cat  combined.txt | node restore.js      (macOS/Linux)
 */
const fs   = require("fs");
const path = require("path");

// ─ 입력 읽기 ───────────────────────────────────────────────
const input =
  process.argv[2] ? fs.readFileSync(process.argv[2], "utf8")
                  : fs.readFileSync(0, "utf8");           // STDIN

const lines = input.split(/\r?\n/);
let idx = 0, restored = 0;

const isSep = (s) => /^={10,}$/.test(s.trim());

while (idx < lines.length) {
  if (!isSep(lines[idx])) { idx++; continue; }

  // ─ FILE: 경로 ─
  let cursor = idx + 1;
  while (cursor < lines.length && lines[cursor].trim() === "") cursor++;
  if (cursor >= lines.length || !/^FILE:/i.test(lines[cursor])) { idx++; continue; }

  const filePath = lines[cursor].replace(/^FILE:\s*/i, "").trim();
  cursor++;

  // (OPTIONAL) 또 하나의 구분선 스킵
  while (cursor < lines.length && lines[cursor].trim() === "") cursor++;
  if (cursor < lines.length && isSep(lines[cursor])) cursor++;

  // ─ 파일 내용 수집 ─
  const body = [];
  while (cursor < lines.length && !isSep(lines[cursor])) {
    body.push(lines[cursor]);
    cursor++;
  }

  // ─ 파일 쓰기 ─
  const absPath = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, body.join("\n") + "\n", "utf8");

  console.log(`✅ 복구 완료: ${filePath}`);
  restored++;
  idx = cursor;     // 다음 블록으로
}

if (restored === 0) {
  console.error("⚠️  복구할 파일을 찾지 못했습니다. 입력 형식을 확인하세요.");
  process.exitCode = 1;
} else {
  console.log(`\n🎉 총 ${restored}개 파일이 복구되었습니다.`);
}
