/**
 * SPDX-FileCopyrightText: Copyright (c) 2026 Sergei Mukhin
 * SPDX-License-Identifier: MIT
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { loadWsdl } from '../src/load.js';
import { buildModel } from '../src/model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');
const fixture = (name) => readFileSync(join(fixturesDir, name), 'utf8');
const model = async (name) => buildModel(await loadWsdl(fixture(name), { baseDir: fixturesDir }));

describe('loadWsdl()', () => {
  describe('self-contained WSDLs (no imports)', () => {
    it('should load calculator.wsdl and produce a model with 2 operations', async () => {
      const m = await model('calculator.wsdl');
      assert.equal(m.operations.length, 2);
    });

    it('should load hello.wsdl and produce a model with 1 operation', async () => {
      const m = await model('hello.wsdl');
      assert.equal(m.operations.length, 1);
    });

    it('should produce the same type count as direct parseWsdl for calculator.wsdl', async () => {
      const m = await model('calculator.wsdl');
      assert.equal(m.types.length, 6);
    });
  });

  describe('imported.wsdl – xsd:import resolution', () => {
    it('should load without throwing', async () => {
      await assert.doesNotReject(() => model('imported.wsdl'));
    });

    it('should produce a model with 1 operation (GetPerson)', async () => {
      const m = await model('imported.wsdl');
      assert.equal(m.operations.length, 1);
      assert.equal(m.operations[0].name, 'GetPerson');
    });

    it('should merge PersonType from the imported XSD into the types list', async () => {
      const m = await model('imported.wsdl');
      const personType = m.types.find((t) => t.name === 'PersonType');
      assert.ok(personType, 'PersonType should be present after import resolution');
    });

    it('should merge the Gender simpleType from the imported XSD', async () => {
      const m = await model('imported.wsdl');
      const gender = m.types.find((t) => t.name === 'Gender');
      assert.ok(gender, 'Gender should be present after import resolution');
      assert.equal(gender.kind, 'simpleType');
    });

    it('should extract PersonType fields correctly', async () => {
      const m = await model('imported.wsdl');
      const personType = m.types.find((t) => t.name === 'PersonType');
      assert.equal(personType.fields.length, 4);
      const names = personType.fields.map((f) => f.name);
      assert.deepEqual(names, ['firstName', 'lastName', 'email', 'age']);
    });

    it('should mark firstName as required (minOccurs=1)', async () => {
      const m = await model('imported.wsdl');
      const personType = m.types.find((t) => t.name === 'PersonType');
      const first = personType.fields.find((f) => f.name === 'firstName');
      assert.equal(first.minOccurs, '1');
    });

    it('should mark email as optional (minOccurs=0)', async () => {
      const m = await model('imported.wsdl');
      const personType = m.types.find((t) => t.name === 'PersonType');
      const email = personType.fields.find((f) => f.name === 'email');
      assert.equal(email.minOccurs, '0');
    });

    it('should have 4 total types (2 local element-wrapped + 2 imported)', async () => {
      const m = await model('imported.wsdl');
      assert.equal(m.types.length, 4);
    });

    it('should extract all 3 Gender enum values', async () => {
      const m = await model('imported.wsdl');
      const gender = m.types.find((t) => t.name === 'Gender');
      assert.deepEqual(gender.enumerations, ['MALE', 'FEMALE', 'OTHER']);
    });

    it('should not duplicate types when the same import appears twice', async () => {
      const m = await model('imported.wsdl');
      const personTypes = m.types.filter((t) => t.name === 'PersonType');
      assert.equal(personTypes.length, 1);
    });
  });

  describe('error handling', () => {
    it('should throw when the XML is not a valid WSDL', async () => {
      await assert.rejects(
        () => loadWsdl('<notWsdl/>', { baseDir: fixturesDir }),
        /missing <definitions>/,
      );
    });

    it('should throw when a referenced local import file does not exist', async () => {
      const xml = fixture('imported.wsdl').replace(
        'schemaLocation="./shared-types.xsd"',
        'schemaLocation="./nonexistent.xsd"',
      );
      await assert.rejects(
        () => loadWsdl(xml, { baseDir: fixturesDir }),
        (err) => err.code === 'ENOENT' || /no such file|ENOENT/i.test(err.message),
      );
    });
  });
});
