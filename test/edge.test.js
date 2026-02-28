import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { parseWsdl } from '../src/parse.js';
import { buildModel } from '../src/model.js';
import { buildIndex, resolveMessageFields } from '../src/resolve.js';
import { renderHtml } from '../src/render.js';
import { loadWsdl } from '../src/load.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

function fixture(name) {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

function model(name) {
  return buildModel(parseWsdl(fixture(name)));
}

function html(name, opts) {
  return renderHtml(model(name), opts);
}

describe('edge cases', () => {

  describe('empty.wsdl – definitions with no content', () => {
    it('should parse without throwing', () => {
      assert.doesNotThrow(() => parseWsdl(fixture('empty.wsdl')));
    });

    it('should build a model without throwing', () => {
      assert.doesNotThrow(() => model('empty.wsdl'));
    });

    it('should set the service name from the definitions @_name attribute', () => {
      assert.equal(model('empty.wsdl').name, 'EmptyService');
    });

    it('should produce an empty types array', () => {
      assert.equal(model('empty.wsdl').types.length, 0);
    });

    it('should produce an empty messages array', () => {
      assert.equal(model('empty.wsdl').messages.length, 0);
    });

    it('should produce an empty operations array', () => {
      assert.equal(model('empty.wsdl').operations.length, 0);
    });

    it('should produce an empty bindings array', () => {
      assert.equal(model('empty.wsdl').bindings.length, 0);
    });

    it('should produce an empty endpoints array', () => {
      assert.equal(model('empty.wsdl').endpoints.length, 0);
    });

    it('should render a complete HTML5 page without throwing', () => {
      assert.doesNotThrow(() => html('empty.wsdl'));
    });

    it('should still produce a valid DOCTYPE declaration', () => {
      assert.ok(html('empty.wsdl').startsWith('<!DOCTYPE html>'));
    });

    it('should include the service name in the page title', () => {
      assert.ok(html('empty.wsdl').includes('EmptyService'));
    });

    it('should load via loadWsdl without throwing', async () => {
      const raw = await loadWsdl(fixture('empty.wsdl'), { baseDir: fixturesDir });
      assert.ok(raw['definitions']);
    });
  });

  describe('unicode.wsdl – unicode identifiers and documentation', () => {
    it('should parse without throwing', () => {
      assert.doesNotThrow(() => parseWsdl(fixture('unicode.wsdl')));
    });

    it('should build a model without throwing', () => {
      assert.doesNotThrow(() => model('unicode.wsdl'));
    });

    it('should preserve unicode characters in the service name', () => {
      assert.ok(model('unicode.wsdl').name.includes('Ünïcödé'));
    });

    it('should preserve the unicode operation name', () => {
      const ops = model('unicode.wsdl').operations;
      assert.equal(ops.length, 1);
      assert.ok(ops[0].name.includes('П'));
    });

    it('should preserve unicode text in the type name', () => {
      const types = model('unicode.wsdl').types;
      assert.ok(types.some((t) => t.name.includes('П')));
    });

    it('should preserve unicode text in field names', () => {
      const types = model('unicode.wsdl').types;
      const greeting = types.find((t) => t.name.includes('П'));
      assert.ok(greeting);
      assert.ok(greeting.fields.some((f) => f.name.includes('имя') || f.name.includes('П')));
    });

    it('should preserve unicode documentation text', () => {
      assert.ok(model('unicode.wsdl').documentation.includes('Юникода'));
    });

    it('should render without throwing', () => {
      assert.doesNotThrow(() => html('unicode.wsdl'));
    });

    it('should produce a complete HTML5 page', () => {
      assert.ok(html('unicode.wsdl').startsWith('<!DOCTYPE html>'));
      assert.ok(html('unicode.wsdl').includes('</html>'));
    });
  });

  describe('XSS safety – dangerous characters in WSDL content', () => {
    it('should escape < and > in documentation text rendered to HTML', () => {
      const out = html('unicode.wsdl');
      assert.ok(!out.includes('<loud>'));
      assert.ok(out.includes('&lt;loud&gt;'));
    });

    it('should escape & in documentation text rendered to HTML', () => {
      const out = html('unicode.wsdl');
      assert.ok(out.includes('&amp;'));
    });

    it('should escape & in the service name rendered to HTML', () => {
      const out = html('unicode.wsdl');
      assert.ok(!out.includes('Ünïcödé&Service'));
      assert.ok(out.includes('Ünïcödé&amp;Service'));
    });

    it('should escape < in field documentation rendered to HTML', () => {
      const out = html('unicode.wsdl');
      assert.ok(!out.includes('<angle brackets>'));
      assert.ok(out.includes('&lt;angle brackets&gt;'));
    });
  });

  describe('resolveMessageFields() – unknown and edge-case references', () => {
    it('should return an empty array for a completely unknown message name', () => {
      const m = model('calculator.wsdl');
      const index = buildIndex(m);
      assert.deepEqual(resolveMessageFields('NoSuchMessage', index), []);
    });

    it('should return an empty fields array when a part references an unknown type', () => {
      const m = {
        types: [],
        messages: [{ name: 'M', parts: [{ name: 'p', element: 'UnknownType', type: '' }] }],
        operations: [],
        bindings: [],
        endpoints: [],
      };
      const index = buildIndex(m);
      const result = resolveMessageFields('M', index);
      assert.equal(result.length, 1);
      assert.deepEqual(result[0].fields, []);
      assert.deepEqual(result[0].enumerations, []);
    });

    it('should handle a message with zero parts without throwing', () => {
      const m = {
        types: [],
        messages: [{ name: 'Empty', parts: [] }],
        operations: [],
        bindings: [],
        endpoints: [],
      };
      const index = buildIndex(m);
      assert.deepEqual(resolveMessageFields('Empty', index), []);
    });

    it('should not throw or loop for a self-referencing type name in parts', () => {
      const m = {
        types: [{ name: 'Self', fields: [{ name: 'child', type: 'Self', minOccurs: '0', maxOccurs: '1', documentation: '' }], enumerations: [] }],
        messages: [{ name: 'M', parts: [{ name: 'p', element: '', type: 'Self' }] }],
        operations: [],
        bindings: [],
        endpoints: [],
      };
      const index = buildIndex(m);
      assert.doesNotThrow(() => resolveMessageFields('M', index));
      const result = resolveMessageFields('M', index);
      assert.equal(result[0].typeName, 'Self');
    });
  });

  describe('minimal parse – edge shapes in XML', () => {
    it('should throw for completely empty input', () => {
      assert.throws(() => parseWsdl(''), /missing <definitions>/i);
    });

    it('should throw for a valid XML document whose root is not <definitions>', () => {
      assert.throws(() => parseWsdl('<root/>'), /missing <definitions>/i);
    });

    it('should handle a definitions with only a documentation element', () => {
      const xml = `<definitions name="DocOnly" targetNamespace="http://x"
        xmlns="http://schemas.xmlsoap.org/wsdl/">
        <documentation>Just docs.</documentation>
      </definitions>`;
      const m = buildModel(parseWsdl(xml));
      assert.equal(m.name, 'DocOnly');
      assert.equal(m.documentation, 'Just docs.');
      assert.equal(m.operations.length, 0);
    });
  });

});
