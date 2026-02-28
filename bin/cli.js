#!/usr/bin/env node
/**
 * cli.js – command-line entry point for comprehensible-wsdl.
 *
 * Reads a WSDL file (or stdin when the path argument is "-"), converts it to
 * a readable HTML5 page, and writes the result to stdout or a file.
 *
 * Usage:
 *   comprehensible-wsdl [options] <wsdl-file>
 *   comprehensible-wsdl [options] -         # read from stdin
 *
 * Options:
 *   -o, --output <file>   Write HTML to file instead of stdout
 *   --title <string>      Override page <title>
 *   --inline-css          Fetch edible.css and embed it inline (offline output)
 *   -h, --help            Show help
 *   -V, --version         Show version
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { loadWsdl } from '../src/load.js';
import { buildModel } from '../src/model.js';
import { renderHtml } from '../src/render.js';

const CDN_CSS =
  'https://cdn.jsdelivr.net/npm/@svmukhin/edible-css@latest/dist/edible.min.css';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const program = new Command();

program
  .name('comprehensible-wsdl')
  .description('Generate a readable HTML5 reference page from a WSDL file')
  .version(pkg.version)
  .argument('<wsdl-file>', 'Path to .wsdl / .xml file, or "-" to read stdin')
  .option('-o, --output <file>', 'Write HTML to file instead of stdout')
  .option('--title <string>', 'Override the page <title>')
  .option('--inline-css', 'Embed edible.css inline (fully offline output)')
  .action(async (wsdlFile, opts) => {
    const xml = await readInput(wsdlFile);
    const baseDir = wsdlFile === '-' ? process.cwd() : dirname(resolve(wsdlFile));
    const inlineCss = opts.inlineCss ? await fetchCss() : undefined;
    const raw = await loadWsdl(xml, { baseDir });
    const model = buildModel(raw);
    const html = renderHtml(model, { title: opts.title, inlineCss });
    if (opts.output) {
      writeFileSync(opts.output, html, 'utf8');
    } else {
      process.stdout.write(html);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});

/**
 * Reads the WSDL source either from a file path or from stdin when path is "-".
 *
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function readInput(filePath) {
  if (filePath === '-') return readStdin();
  return readFile(filePath, 'utf8');
}

/**
 * Reads all of stdin using async iteration and resolves to a UTF-8 string.
 * Destroys the stdin stream after reading so no open handle prevents the
 * process from exiting naturally once all work is done.
 *
 * @returns {Promise<string>}
 */
async function readStdin() {
  process.stdin.setEncoding('utf8');
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  process.stdin.destroy();
  return chunks.join('');
}

/**
 * Fetches the minified edible.css from the CDN and returns it as a string.
 * Exits with an error message if the network request fails.
 *
 * @returns {Promise<string>}
 */
async function fetchCss() {
  if (process.env.COMPREHENSIBLE_CSS_FILE) {
    return readFile(process.env.COMPREHENSIBLE_CSS_FILE, 'utf8');
  }
  const res = await fetch(CDN_CSS).catch((err) => {
    process.stderr.write(`Warning: could not fetch edible.css (${err.message}). Falling back to CDN link.\n`);
    return null;
  });
  if (!res || !res.ok) return undefined;
  return res.text();
}
