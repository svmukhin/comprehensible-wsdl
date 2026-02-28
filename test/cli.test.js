import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, '..', 'bin', 'cli.js');
const fixture = (name) => join(__dirname, 'fixtures', name);

/**
 * Runs the CLI with the given arguments and returns { stdout, stderr, code }.
 * Never throws – exit code is captured instead.
 *
 * @param {string[]} args
 * @param {object}  [spawnOpts]
 * @returns {Promise<{ stdout: string, stderr: string, code: number }>}
 */
async function run(args, spawnOpts = {}) {
  return execFileAsync(process.execPath, [cli, ...args], spawnOpts)
    .then(({ stdout, stderr }) => ({ stdout, stderr, code: 0 }))
    .catch((err) => ({ stdout: err.stdout ?? '', stderr: err.stderr ?? '', code: err.code ?? 1 }));
}

describe('CLI', () => {

  describe('basic invocation', () => {
    it('should exit with code 0 when given a valid WSDL file', async () => {
      const { code } = await run([fixture('calculator.wsdl')]);
      assert.equal(code, 0);
    });

    it('should output a valid HTML5 document to stdout', async () => {
      const { stdout } = await run([fixture('calculator.wsdl')]);
      assert.ok(stdout.startsWith('<!DOCTYPE html>'));
      assert.ok(stdout.includes('</html>'));
    });

    it('should include the service name in the HTML title', async () => {
      const { stdout } = await run([fixture('calculator.wsdl')]);
      assert.ok(stdout.includes('Calculator'));
    });

    it('should include the edible-css CDN link by default', async () => {
      const { stdout } = await run([fixture('calculator.wsdl')]);
      assert.ok(stdout.includes('edible'));
      assert.ok(stdout.includes('<link rel="stylesheet"'));
    });

    it('should work with the hello.wsdl fixture', async () => {
      const { code, stdout } = await run([fixture('hello.wsdl')]);
      assert.equal(code, 0);
      assert.ok(stdout.includes('Hello'));
    });
  });

  describe('--output option', () => {
    it('should write the HTML to the specified file and produce no stdout', async () => {
      const outFile = join(tmpdir(), `cwsdl-test-${Date.now()}.html`);
      try {
        const { code, stdout } = await run([fixture('calculator.wsdl'), '-o', outFile]);
        assert.equal(code, 0);
        assert.equal(stdout, '');
        const { readFileSync } = await import('node:fs');
        const content = readFileSync(outFile, 'utf8');
        assert.ok(content.startsWith('<!DOCTYPE html>'));
      } finally {
        if (existsSync(outFile)) unlinkSync(outFile);
      }
    });
  });

  describe('--title option', () => {
    it('should override the page title with the provided string', async () => {
      const { stdout } = await run([fixture('calculator.wsdl'), '--title', 'My Docs']);
      assert.ok(stdout.includes('<title>My Docs</title>'));
    });
  });

  describe('stdin input', () => {
    it('should read WSDL from stdin when path argument is "-"', async () => {
      const wsdlContent = readFileSync(fixture('calculator.wsdl'));
      const child = spawn(process.execPath, [cli, '-'], { stdio: 'pipe' });
      child.stdin.end(wsdlContent);
      const stdout = await new Promise((resolve, reject) => {
        const chunks = [];
        child.stdout.on('data', (c) => chunks.push(c));
        child.stdout.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        child.on('error', reject);
      });
      const code = await new Promise((resolve) => child.on('close', resolve));
      assert.equal(code, 0);
      assert.ok(stdout.includes('<!DOCTYPE html>'));
      assert.ok(stdout.includes('Calculator'));
    });
  });

  describe('error handling', () => {
    it('should exit with a non-zero code when the file does not exist', async () => {
      const { code, stderr } = await run(['nonexistent.wsdl']);
      assert.notEqual(code, 0);
      assert.ok(stderr.length > 0);
    });

    it('should exit with a non-zero code and print an error when given invalid XML', async () => {
      const badFile = join(tmpdir(), `cwsdl-bad-${Date.now()}.wsdl`);
      try {
        writeFileSync(badFile, '<not-a-wsdl/>', 'utf8');
        const { code, stderr } = await run([badFile]);
        assert.notEqual(code, 0);
        assert.ok(stderr.includes('Error'));
      } finally {
        if (existsSync(badFile)) unlinkSync(badFile);
      }
    });
  });

  describe('--help and --version', () => {
    it('should print help and exit with code 0 when --help is passed', async () => {
      const { code, stdout } = await run(['--help']);
      assert.equal(code, 0);
      assert.ok(stdout.includes('comprehensible-wsdl'));
    });

    it('should print the package version and exit with code 0 when --version is passed', async () => {
      const { code, stdout } = await run(['--version']);
      assert.equal(code, 0);
      assert.match(stdout, /\d+\.\d+\.\d+/);
    });
  });

  describe('--inline-css option', () => {
    it('should embed a <style> tag and omit the CDN <link> when --inline-css is used', async () => {
      const cssFile = join(tmpdir(), `cwsdl-css-${Date.now()}.css`);
      try {
        writeFileSync(cssFile, 'body{font-family:sans-serif}', 'utf8');
        const { code, stdout } = await run(
          [fixture('calculator.wsdl'), '--inline-css'],
          { env: { ...process.env, COMPREHENSIBLE_CSS_FILE: cssFile } },
        );
        assert.equal(code, 0);
        assert.ok(stdout.includes('<style>'));
        assert.ok(stdout.includes('font-family'));
        assert.ok(!stdout.includes('<link rel="stylesheet"'));
      } finally {
        if (existsSync(cssFile)) unlinkSync(cssFile);
      }
    });
  });

});
