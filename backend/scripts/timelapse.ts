// M02 "Tạo video timelapse" — runs on an admin's machine after the event.
// Input: the ZIP from "Tải toàn bộ dải ảnh (.zip)" (files named by stripFileName, so
// sorting by name = moment order). Output: an MP4 made by a local FFmpeg.
//   npm run timelapse -- photowall.zip [--fps 8] [--width 720] [--out wall.mp4] [--dry-run]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { unzipSync } from 'fflate';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    fps: { type: 'string', default: '8' },
    width: { type: 'string', default: '720' },
    out: { type: 'string', default: 'photowall-timelapse.mp4' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const zipPath = positionals[0];
if (!zipPath) {
  console.error('Cách dùng: npm run timelapse -- <file.zip> [--fps 8] [--width 720] [--out wall.mp4]');
  process.exit(1);
}

const entries = unzipSync(readFileSync(resolve(zipPath)));
const strips = Object.keys(entries)
  .filter((name) => /\.jpe?g$/i.test(name) && !name.startsWith('__MACOSX/'))
  .sort();
if (strips.length === 0) {
  console.error('ZIP không có ảnh .jpg nào.');
  process.exit(1);
}

// FFmpeg's image2 demuxer needs a numbered sequence; copy the strips in name order.
const dir = mkdtempSync(join(tmpdir(), 'photowall-timelapse-'));
strips.forEach((name, i) => writeFileSync(join(dir, `f${String(i + 1).padStart(5, '0')}.jpg`), entries[name]));

// Strips are 1080×3400 portrait; scale to an even width H.264 players accept everywhere.
const ffmpegArgs = [
  '-y', '-framerate', args.fps!, '-i', join(dir, 'f%05d.jpg'),
  '-vf', `scale=${args.width}:-2,format=yuv420p`, '-c:v', 'libx264', '-movflags', '+faststart',
  resolve(args.out!),
];
console.log(`${strips.length} dải ảnh · ${args.fps} ảnh/giây ≈ ${(strips.length / Number(args.fps)).toFixed(1)} giây video`);

if (args['dry-run']) {
  console.log(`ffmpeg ${ffmpegArgs.join(' ')}`);
  console.log(`(dry run) ảnh tạm ở ${dir}`);
  process.exit(0);
}

if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
  rmSync(dir, { recursive: true, force: true });
  console.error('Chưa cài FFmpeg hoặc FFmpeg không có trong PATH. Tải tại https://ffmpeg.org/download.html');
  process.exit(1);
}

const run = spawnSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
rmSync(dir, { recursive: true, force: true });
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(`Xong: ${resolve(args.out!)}`);
