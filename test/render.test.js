/**
 * SPDX-FileCopyrightText: Copyright (c) 2026 Sergei Mukhin
 * SPDX-License-Identifier: MIT
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { parseWsdl } from '../src/parse.js';
import { buildModel } from '../src/model.js';
import { renderHtml } from '../src/render.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = (name, opts) =>
  renderHtml(buildModel(parseWsdl(readFileSync(join(__dirname, 'fixtures', name), 'utf8'))), opts);

describe('renderHtml()', () => {
  describe('page structure', () => {
    const out = html('calculator.wsdl');

    it('should start with an HTML5 doctype', () => {
      assert.ok(out.startsWith('<!DOCTYPE html>'));
    });

    it('should contain a <html lang="en"> root element', () => {
      assert.ok(out.includes('<html lang="en">'));
    });

    it('should include the edible-css CDN link by default', () => {
      assert.ok(out.includes('edible'));
      assert.ok(out.includes('<link rel="stylesheet"'));
    });

    it('should embed a <style> tag and omit the CDN link when inlineCss is provided', () => {
      const out2 = html('calculator.wsdl', { inlineCss: 'body{color:red}' });
      assert.ok(out2.includes('<style>body{color:red}</style>'));
      assert.ok(!out2.includes('<link rel="stylesheet"'));
    });

    it('should use a custom title when the title option is provided', () => {
      const out2 = html('calculator.wsdl', { title: 'My Custom Title' });
      assert.ok(out2.includes('<title>My Custom Title</title>'));
    });

    it('should set the default title to service name + WSDL Reference', () => {
      assert.ok(out.includes('<title>Calculator – WSDL Reference</title>'));
    });

    it('should contain a <header> element with the service name in an h1', () => {
      assert.ok(out.includes('<h1>Calculator</h1>'));
    });

    it('should display the target namespace in the header', () => {
      assert.ok(out.includes('http://example.com/calculator'));
    });

    it('should contain a <nav> with anchor links to all five sections', () => {
      assert.ok(out.includes('href="#types"'));
      assert.ok(out.includes('href="#messages"'));
      assert.ok(out.includes('href="#operations"'));
      assert.ok(out.includes('href="#bindings"'));
      assert.ok(out.includes('href="#endpoints"'));
    });

    it('should contain a <footer> with generation date', () => {
      assert.ok(out.includes('<footer>'));
      assert.ok(out.includes('comprehensible-wsdl'));
    });

    it('should contain all five section ids', () => {
      assert.ok(out.includes('id="types"'));
      assert.ok(out.includes('id="messages"'));
      assert.ok(out.includes('id="operations"'));
      assert.ok(out.includes('id="bindings"'));
      assert.ok(out.includes('id="endpoints"'));
    });
  });

  describe('types section (calculator.wsdl)', () => {
    const out = html('calculator.wsdl');

    it('should render each type inside a <details> element', () => {
      const count = (out.match(/<details>/g) ?? []).length;
      assert.ok(count >= 6, `expected at least 6 <details>, got ${count}`);
    });

    it('should render AddRequest as a <summary> label', () => {
      assert.ok(out.includes('>AddRequest<'));
    });

    it('should render a field table with the correct headers', () => {
      assert.ok(out.includes('<th>Field</th>'));
      assert.ok(out.includes('<th>Type</th>'));
      assert.ok(out.includes('<th>Min</th>'));
      assert.ok(out.includes('<th>Max</th>'));
    });

    it('should wrap required field names in <mark>', () => {
      assert.ok(out.includes('<mark>a</mark>'));
      assert.ok(out.includes('<mark>b</mark>'));
    });

    it('should render RoundingMode enumeration values in a <ul>', () => {
      assert.ok(out.includes('>FLOOR<'));
      assert.ok(out.includes('>CEILING<'));
      assert.ok(out.includes('>HALF_UP<'));
      assert.ok(out.includes('>HALF_DOWN<'));
    });

    it('should render field documentation text', () => {
      assert.ok(out.includes('First operand'));
    });
  });

  describe('operations section (calculator.wsdl)', () => {
    const out = html('calculator.wsdl');

    it('should render each operation inside an <article>', () => {
      const count = (out.match(/<article /g) ?? []).length;
      assert.equal(count, 2);
    });

    it('should render operation name in an <h3>', () => {
      assert.ok(out.includes('<h3>Add</h3>'));
      assert.ok(out.includes('<h3>Divide</h3>'));
    });

    it('should render operation documentation in a <blockquote>', () => {
      assert.ok(out.includes('<blockquote>'));
      assert.ok(out.includes('Adds two numbers'));
    });

    it('should render input and output message names in <h4> headings', () => {
      assert.ok(out.includes('>AddInput<'));
      assert.ok(out.includes('>AddOutput<'));
    });

    it('should expand input message fields inline inside the operation article', () => {
      const articleStart = out.indexOf('id="op-Add"');
      const articleEnd = out.indexOf('</article>', articleStart);
      const article = out.slice(articleStart, articleEnd);
      assert.ok(article.includes('<mark>a</mark>'));
      assert.ok(article.includes('<mark>b</mark>'));
      assert.ok(article.includes('First operand'));
    });

    it('should expand output message fields inline inside the operation article', () => {
      const articleStart = out.indexOf('id="op-Add"');
      const articleEnd = out.indexOf('</article>', articleStart);
      const article = out.slice(articleStart, articleEnd);
      assert.ok(article.includes('>result<') || article.includes('<mark>result</mark>'));
    });

    it('should render the DivisionByZero fault for the Divide operation', () => {
      assert.ok(out.includes('DivisionByZero'));
      assert.ok(out.includes('MathFaultMessage'));
    });
  });

  describe('bindings section (calculator.wsdl)', () => {
    const out = html('calculator.wsdl');

    it('should show the binding protocol and style in a <summary>', () => {
      assert.ok(out.includes('SOAP 1.1'));
      assert.ok(out.includes('document'));
    });

    it('should render SOAPAction values in <code> tags', () => {
      assert.ok(out.includes('http://example.com/calculator/Add'));
    });
  });

  describe('endpoints section (calculator.wsdl)', () => {
    const out = html('calculator.wsdl');

    it('should render the service and port names', () => {
      assert.ok(out.includes('CalculatorService'));
      assert.ok(out.includes('CalculatorPort'));
    });

    it('should render the endpoint URL in a <code> tag', () => {
      assert.ok(out.includes('<code>http://example.com/calculator</code>'));
    });
  });

  describe('hello.wsdl edge cases', () => {
    const out = html('hello.wsdl');

    it('should render the SayHello operation without a faults section', () => {
      assert.ok(out.includes('<h3>SayHello</h3>'));
      assert.ok(!out.includes('<h4>Faults</h4>'));
    });

    it('should render the optional locale field without a <mark> wrapper', () => {
      assert.ok(out.includes('>locale<'));
      const markLocale = out.includes('<mark>locale</mark>');
      assert.ok(!markLocale);
    });

    it('should not render a <blockquote> when operation has no documentation', () => {
      assert.ok(!out.includes('<blockquote>'));
    });

    it('should expand SayHello input fields inline using type= references', () => {
      const articleStart = out.indexOf('id="op-SayHello"');
      const articleEnd = out.indexOf('</article>', articleStart);
      const article = out.slice(articleStart, articleEnd);
      assert.ok(article.includes('>name<') || article.includes('<mark>name</mark>'));
      assert.ok(article.includes('>locale<'));
    });
  });

  describe('HTML escaping', () => {
    it('should escape angle brackets in service name', () => {
      const raw = parseWsdl(readFileSync(join(__dirname, 'fixtures', 'calculator.wsdl'), 'utf8'));
      raw['definitions']['@_name'] = '<script>alert(1)</script>';
      const out2 = renderHtml(buildModel(raw));
      assert.ok(!out2.includes('<script>alert(1)</script>'));
      assert.ok(out2.includes('&lt;script&gt;'));
    });
  });
});
