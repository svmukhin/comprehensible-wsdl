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
import { buildIndex, resolveMessageFields } from '../src/resolve.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const model = (name) =>
  buildModel(parseWsdl(readFileSync(join(__dirname, 'fixtures', name), 'utf8')));

describe('buildIndex()', () => {

  describe('calculator.wsdl', () => {
    const m = model('calculator.wsdl');
    const index = buildIndex(m);

    it('should build a typeByName map with 6 entries', () => {
      assert.equal(index.typeByName.size, 6);
    });

    it('should build a messageByName map with 5 entries', () => {
      assert.equal(index.messageByName.size, 5);
    });

    it('should look up a type by its bare local name', () => {
      assert.ok(index.typeByName.has('AddRequest'));
      assert.ok(index.typeByName.has('RoundingMode'));
    });

    it('should look up a message by its bare local name', () => {
      assert.ok(index.messageByName.has('AddInput'));
      assert.ok(index.messageByName.has('MathFaultMessage'));
    });

    it('should return undefined for an unknown type name', () => {
      assert.equal(index.typeByName.get('NonExistent'), undefined);
    });
  });

});

describe('resolveMessageFields()', () => {

  describe('calculator.wsdl – element= references', () => {
    const m = model('calculator.wsdl');
    const index = buildIndex(m);

    it('should return one part for AddInput', () => {
      const parts = resolveMessageFields('AddInput', index);
      assert.equal(parts.length, 1);
    });

    it('should resolve AddInput part to the AddRequest type fields', () => {
      const parts = resolveMessageFields('AddInput', index);
      assert.equal(parts[0].typeName, 'AddRequest');
      assert.equal(parts[0].fields.length, 2);
    });

    it('should expose field names and types from the resolved type', () => {
      const [part] = resolveMessageFields('AddInput', index);
      const names = part.fields.map((f) => f.name);
      assert.deepEqual(names, ['a', 'b']);
      assert.ok(part.fields.every((f) => f.type === 'double'));
    });

    it('should return an empty array for an unknown message name', () => {
      const parts = resolveMessageFields('NoSuchMessage', index);
      assert.deepEqual(parts, []);
    });

    it('should return empty fields array when the referenced type is not in the index', () => {
      const fakeIndex = {
        typeByName: new Map(),
        messageByName: index.messageByName,
      };
      const parts = resolveMessageFields('AddInput', fakeIndex);
      assert.equal(parts.length, 1);
      assert.deepEqual(parts[0].fields, []);
    });
  });

  describe('hello.wsdl – type= references', () => {
    const m = model('hello.wsdl');
    const index = buildIndex(m);

    it('should resolve SayHelloIn part to the SayHelloRequest type fields', () => {
      const parts = resolveMessageFields('SayHelloIn', index);
      assert.equal(parts.length, 1);
      assert.equal(parts[0].typeName, 'SayHelloRequest');
      assert.equal(parts[0].fields.length, 2);
    });

    it('should expose the optional locale field with minOccurs 0', () => {
      const [part] = resolveMessageFields('SayHelloIn', index);
      const locale = part.fields.find((f) => f.name === 'locale');
      assert.ok(locale);
      assert.equal(locale.minOccurs, '0');
    });
  });

});
