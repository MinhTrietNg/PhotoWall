#!/usr/bin/env node
/**
 * The no-scroll promise, measured instead of asserted.
 *
 * The design says the guest flow must not scroll on a phone. That claim is
 * easy to break with one line of copy and impossible to verify by reading
 * CSS, so this walks the real flow with a fake camera and measures how far
 * every screen overflows every target viewport. Anything past the budget in
 * budget.json fails the run.
 *
 *   npm run check:fit                 measure and judge
 *   npm run check:fit -- --update     rewrite the budget from what was measured
 *   npm run check:fit -- --base=URL   measure a server that is already running
 *
 * Needs a local Chrome or Edge; set PW_CHROME to point at one explicitly.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { STEPS, VIEWPORTS } from './flow.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../..');
const BUDGET_FILE = join(HERE, 'budget.json');

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const read = (rel) => readFileSync(join(APP, rel), 'utf8');
const die = (message) => {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
};

/* ------------------------------------------------------------------ rules */

/**
 * What holds without a browser: the two mistakes that made every screen scroll
 * in the first place, plus the coverage rule that keeps this check honest as
 * the app grows.
 */
function staticRules() {
  const failures = [];

  // 1. The shell keeps a DEFINITE height. This is the whole fix: a min-height
  //    box grows to fit its content, so there is never negative free space,
  //    flex-shrink never fires, and every spare pixel lengthens the page.
  const css = read('src/styles/base.css');
  const shell = css.match(/^\.screen\s*\{([^}]*)\}/m);
  if (!shell) {
    failures.push('base.css: không tìm thấy quy tắc .screen');
  } else {
    if (/min-height\s*:/.test(shell[1])) {
      failures.push(
        'base.css: .screen dùng min-height. Khối min-height luôn nở vừa nội dung nên ' +
          'flex-shrink không bao giờ kích hoạt và mọi pixel dư đều đẩy trang dài ra.',
      );
    }
    if (!/(?:^|[;{])\s*height\s*:/m.test(shell[1])) {
      failures.push(
        'base.css: .screen không đặt height — chiều cao xác định là thứ cho phép cột flex co lại.',
      );
    }
  }

  // 2. Every guest page goes through <Screen>. That component is where the
  //    shell, the safe areas and the iOS chrome tint live; a page that builds
  //    its own root escapes all three at once.
  const app = read('src/apps/mobile/App.tsx');
  const pages = [...app.matchAll(/from '@\/pages\/([A-Za-z]+)'/g)].map((m) => m[1]);
  for (const page of pages) {
    if (!/from '@\/components\/Screen'/.test(read(`src/pages/${page}.tsx`))) {
      failures.push(`src/pages/${page}.tsx không dựng màn bằng <Screen>.`);
    }
  }

  // 3. Coverage: a route the walk never visits is a screen nobody measures.
  const routes = [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((route) => route !== '*');
  const walked = new Set(STEPS.map((step) => step.route));
  for (const route of routes) {
    if (!walked.has(route)) {
      failures.push(`route "${route}" không có bước nào trong flow.mjs — thêm bước rồi chạy lại.`);
    }
  }
  for (const route of walked) {
    if (!routes.includes(route)) {
      failures.push(`flow.mjs đi tới "${route}" nhưng App.tsx không còn route đó.`);
    }
  }

  return failures;
}

/* ---------------------------------------------------------------- browser */

function findChrome() {
  const explicit = process.env.PW_CHROME || process.env.CHROME_PATH;
  if (explicit) {
    if (!existsSync(explicit)) die(`PW_CHROME trỏ tới "${explicit}" nhưng ở đó không có file.`);
    return explicit;
  }
  const localAppData = process.env.LOCALAPPDATA;
  const candidates =
    {
      win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        localAppData && `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      ],
      darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ],
      linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
    }[process.platform] ?? [];

  const found = candidates.filter(Boolean).find((path) => existsSync(path));
  if (!found) {
    die('không tìm thấy Chrome hay Edge. Đặt PW_CHROME=<đường dẫn chrome.exe> rồi chạy lại.');
  }
  return found;
}

function startServer(port) {
  const vite = join(APP, 'node_modules/vite/bin/vite.js');
  if (!existsSync(vite)) die('thiếu node_modules — chạy npm install trong frontend/ trước.');
  // The walk needs the mock backend: fixed data, no network, and a photo that
  // approves itself after 6s so the approved state of S08 is reachable.
  return spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], {
    cwd: APP,
    env: { ...process.env, VITE_BACKEND: 'mock' },
    stdio: 'ignore',
  });
}

function stopServer(child) {
  if (!child) return;
  // A plain kill() leaves the tree running on Windows.
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

async function waitForServer(base, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) die(`vite thoát sớm (mã ${child.exitCode}).`);
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 300));
  }
  die('vite không trả lời sau 30s.');
}

/** `/camera/:n` -> /^\/camera\/[^/]+$/ */
function routeMatcher(route) {
  const body = route
    .split('/')
    .map((part) => (part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${body}$`);
}

/* -------------------------------------------------------------- measuring */

function measure(page) {
  return page.evaluate(() => {
    const screen = document.querySelector('.screen');
    if (!screen) return null;

    // Two ways a guest ends up scrolling: the document grows past the viewport,
    // or the screen scrolls inside its own box. Both move a thumb, so both count.
    const docOver = document.documentElement.scrollHeight - window.innerHeight;
    const inner = screen.scrollHeight - screen.clientHeight;

    // A definite height lets flex shrink things, which stops the scrolling but
    // can squash a block instead. Only a box that actually clips can hide
    // content, so an overflow:visible child is not a finding.
    const clipped = [];
    let worst = null;
    for (const node of screen.querySelectorAll('*')) {
      const name = `${node.tagName.toLowerCase()}.${String(node.className || '').slice(0, 32)}`;
      const rect = node.getBoundingClientRect();
      if ((rect.width || rect.height) && (!worst || rect.bottom > worst.bottom)) {
        worst = { bottom: Math.round(rect.bottom), what: name };
      }
      if (node.scrollHeight > node.clientHeight + 1 && node.clientHeight > 0) {
        const overflowY = getComputedStyle(node).overflowY;
        if (overflowY !== 'hidden' && overflowY !== 'clip') continue;
        clipped.push({ what: name, need: node.scrollHeight, got: node.clientHeight });
      }
    }

    return { overflow: Math.max(docOver, inner, 0), docOver, inner, clipped, worst };
  });
}

async function walk(browser, viewport, base) {
  const context = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    permissions: ['camera'],
  });
  const page = await context.newPage();
  const size = `${viewport.w}x${viewport.h}`;
  const rows = [];

  try {
    for (const step of STEPS) {
      await step.go(page, { base });
      const path = new URL(page.url()).pathname;
      if (!routeMatcher(step.route).test(path)) {
        throw new Error(`bước "${step.id}" khai route ${step.route} nhưng trình duyệt đang ở ${path}`);
      }
      const measured = await measure(page);
      if (!measured) throw new Error(`bước "${step.id}" không tìm thấy .screen`);
      rows.push({ size, screen: step.id, ...measured });
    }
  } catch (error) {
    const message = String(error?.message ?? error).split('\n')[0];
    rows.push({ size, screen: 'LỖI', error: message.slice(0, 150) });
  }

  await context.close();
  return rows;
}

/* ----------------------------------------------------------------- report */

const pad = (text, width) => String(text) + ' '.repeat(Math.max(0, width - String(text).length));

function report(rows, budget) {
  const sizes = VIEWPORTS.map((viewport) => `${viewport.w}x${viewport.h}`);
  const screens = [...new Set(rows.map((row) => row.screen))];
  const nameWidth = Math.max(...screens.map((screen) => screen.length)) + 2;
  const cell = 10;
  const failures = [];
  const notes = [];

  console.log(`\n${pad('', nameWidth)}${sizes.map((size) => pad(size, cell)).join('')}`);

  for (const screen of screens) {
    let line = pad(screen, nameWidth);
    for (const size of sizes) {
      const row = rows.find((candidate) => candidate.size === size && candidate.screen === screen);
      if (!row) {
        line += pad('—', cell);
        continue;
      }
      if (row.error) {
        line += pad('LỖI', cell);
        failures.push(`${size} · ${row.error}`);
        continue;
      }

      const allowance = budget.allowed?.[size]?.[screen];
      const allowed = allowance?.overflow ?? 0;
      if (row.overflow > allowed) {
        line += pad(`+${row.overflow}✗`, cell);
        const worst = row.worst ? ` — thấp nhất là ${row.worst.what}` : '';
        failures.push(`${size} · ${screen} tràn ${row.overflow}px (ngân sách ${allowed}px)${worst}`);
      } else if (row.overflow > 0) {
        line += pad(`(${row.overflow})`, cell);
        if (!allowance.why?.trim()) {
          failures.push(`${size} · ${screen}: ngân sách ${allowed}px chưa ghi "why" trong budget.json`);
        }
      } else {
        line += pad('·', cell);
        if (allowed > 0) notes.push(`${size} · ${screen} hết tràn — hạ ngân sách ${allowed}px về 0`);
      }

      for (const clip of row.clipped ?? []) {
        failures.push(`${size} · ${screen}: ${clip.what} bị cắt, cần ${clip.need}px nhưng chỉ có ${clip.got}px`);
      }
    }
    console.log(line);
  }

  const measured = rows.filter((row) => !row.error);
  const fits = measured.filter((row) => row.overflow === 0).length;
  console.log('\n·  vừa khít     (n)  tràn n px, trong ngân sách     +n✗  vượt ngân sách');
  console.log(`${measured.length} phép đo · ${fits} vừa khít · ${measured.length - fits} phải cuộn`);
  for (const note of notes) console.log(`   ghi chú: ${note}`);

  return failures;
}

function writeBudget(rows, budget) {
  const next = { ...budget, allowed: {} };
  for (const row of rows) {
    if (row.error || row.overflow <= 0) continue;
    const previous = budget.allowed?.[row.size]?.[row.screen];
    next.allowed[row.size] ??= {};
    // A reason only survives while the number does: a budget that grew has to
    // be explained again, by a person.
    next.allowed[row.size][row.screen] = {
      overflow: row.overflow,
      why: previous?.overflow === row.overflow ? previous.why : '',
    };
  }
  writeFileSync(BUDGET_FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\nĐã ghi lại budget.json. Mỗi mục mới cần một câu "why" thì check mới xanh lại.`);
}

/* -------------------------------------------------------------------- run */

async function main() {
  const ruleFailures = staticRules();
  console.log(`Quy tắc tĩnh: ${ruleFailures.length ? `${ruleFailures.length} vi phạm` : 'đạt'}`);
  if (ruleFailures.length) {
    for (const failure of ruleFailures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }

  const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
  const port = Number(opt('port', '5199'));
  const external = opt('base', null);
  const base = external ?? `http://localhost:${port}`;

  let server = null;
  if (!external) {
    server = startServer(port);
    await waitForServer(base, server);
  }

  const browser = await chromium.launch({
    executablePath: findChrome(),
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const rows = [];
  try {
    for (const viewport of VIEWPORTS) {
      console.log(`  đo ${viewport.w}x${viewport.h} · ${viewport.name}`);
      rows.push(...(await walk(browser, viewport, base)));
    }
  } finally {
    await browser.close();
    stopServer(server);
  }

  if (has('update')) {
    writeBudget(rows, budget);
    return;
  }

  const failures = report(rows, budget);
  if (failures.length) {
    console.error(`\n✗ ${failures.length} vấn đề:`);
    for (const failure of failures) console.error(`  · ${failure}`);
    console.error('\nSửa bố cục, đừng nới ngân sách. Nếu thật sự phải nới: --update rồi ghi lý do.\n');
    process.exit(1);
  }
  console.log('\n✓ không màn nào vượt ngân sách, không nội dung nào bị cắt.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
