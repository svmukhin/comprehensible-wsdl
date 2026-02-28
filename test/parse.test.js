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

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('parseWsdl()', () => {

  it('should throw an error on empty string', () => {
    assert.throws(() => parseWsdl(''), /Failed to parse|missing <definitions>/);
  });

  it('should throw an error on non-WSDL XML', () => {
    assert.throws(
      () => parseWsdl('<foo><bar/></foo>'),
      /missing <definitions>/,
    );
  });

  describe('calculator.wsdl', () => {
    const raw = parseWsdl(fixture('calculator.wsdl'));
    const defs = raw['definitions'];

    it('should return an object with a definitions root', () => {
      assert.equal(typeof defs, 'object');
    });

    it('should have the correct targetNamespace attribute', () => {
      assert.equal(defs['@_targetNamespace'], 'http://example.com/calculator');
    });

    it('should have the correct service name attribute', () => {
      assert.equal(defs['@_name'], 'Calculator');
    });

    it('should expose messages as an array with 5 entries', () => {
      assert.ok(Array.isArray(defs['message']), 'message should be an array');
      assert.equal(defs['message'].length, 5);
    });

    it('should give every message a @_name attribute', () => {
      for (const msg of defs['message']) {
        assert.ok(msg['@_name'], `message missing @_name: ${JSON.stringify(msg)}`);
      }
    });

    it('should expose portType operations as an array with 2 entries', () => {
      const pt = defs['portType'];
      assert.ok(Array.isArray(pt));
      const ops = pt[0]['operation'];
      assert.ok(Array.isArray(ops));
      assert.equal(ops.length, 2);
    });

    it('should contain operations named Add and Divide', () => {
      const ops = defs['portType'][0]['operation'];
      const names = ops.map((o) => o['@_name']);
      assert.deepEqual(names.sort(), ['Add', 'Divide']);
    });

    it('should expose a fault on the Divide operation', () => {
      const ops = defs['portType'][0]['operation'];
      const divide = ops.find((o) => o['@_name'] === 'Divide');
      assert.ok(divide, 'Divide operation not found');
      assert.ok(Array.isArray(divide['fault']), 'fault should be an array');
      assert.equal(divide['fault'].length, 1);
    });

    it('should expose a service with a named port', () => {
      assert.ok(Array.isArray(defs['service']));
      const port = defs['service'][0]['port'];
      assert.ok(Array.isArray(port));
      assert.equal(port[0]['@_name'], 'CalculatorPort');
    });

    it('should contain a schema node in the types section', () => {
      const schema = defs['types']['schema'];
      assert.ok(schema, 'schema node missing');
    });
  });

  describe('hello.wsdl', () => {
    const raw = parseWsdl(fixture('hello.wsdl'));
    const defs = raw['definitions'];

    it('should have the correct service name', () => {
      assert.equal(defs['@_name'], 'Hello');
    });

    it('should have exactly one portType', () => {
      assert.ok(Array.isArray(defs['portType']));
      assert.equal(defs['portType'].length, 1);
    });

    it('should have exactly one operation named SayHello', () => {
      const ops = defs['portType'][0]['operation'];
      assert.ok(Array.isArray(ops));
      assert.equal(ops.length, 1);
      assert.equal(ops[0]['@_name'], 'SayHello');
    });

    it('should have no faults on the SayHello operation', () => {
      const op = defs['portType'][0]['operation'][0];
      assert.ok(!op['fault'] || op['fault'].length === 0);
    });

    it('should use type= references instead of element= on message parts', () => {
      const msgs = defs['message'];
      assert.ok(Array.isArray(msgs));
      for (const msg of msgs) {
        const part = msg['part'][0];
        assert.ok(part['@_type'], `expected type= on part of ${msg['@_name']}`);
        assert.ok(!part['@_element'], `did not expect element= on part of ${msg['@_name']}`);
      }
    });
  });

});
