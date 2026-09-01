import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const skillRoot = path.resolve(new URL('..', import.meta.url).pathname);

function runWithClosedInput(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`子进程退出码 ${code}：${stderr}`));
    });
    child.stdin.end();
  });
}

test('环境准备脚本复用符合版本要求的 Node.js', async t => {
  const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lvpin-runtime-test-'));
  t.after(() => fs.rm(runtimeDir, { recursive: true, force: true }));
  const { stdout } = await execFileAsync('sh', ['scripts/bootstrap.sh', '--ensure'], {
    cwd: skillRoot,
    env: { ...process.env, HAOLVSHI_NODE_BIN: process.execPath, HAOLVSHI_RUNTIME_DIR: runtimeDir }
  });
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.installed, false);
  assert.equal(result.nodePath, process.execPath);
});

test('统一运行入口会先检查环境再执行技能命令', async t => {
  const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lvpin-runner-test-'));
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lvpin-state-test-'));
  t.after(() => Promise.all([
    fs.rm(runtimeDir, { recursive: true, force: true }),
    fs.rm(stateDir, { recursive: true, force: true })
  ]));
  const { stdout } = await runWithClosedInput('sh', ['scripts/run.sh', 'cleanup'], {
    cwd: skillRoot,
    env: {
      ...process.env,
      HAOLVSHI_NODE_BIN: process.execPath,
      HAOLVSHI_RUNTIME_DIR: runtimeDir,
      HAOLVSHI_STATE_DIR: stateDir
    }
  });
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.stage, 'cleaned');
});
