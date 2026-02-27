import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { parseWsdl } from '../src/parse.js';
import { buildModel } from '../src/model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const model = (name) =>
  buildModel(parseWsdl(readFileSync(join(__dirname, 'fixtures', name), 'utf8')));

describe('buildModel()', () => {

  describe('calculator.wsdl', () => {
    const m = model('calculator.wsdl');

    it('should set the service name', () => {
      assert.equal(m.name, 'Calculator');
    });

    it('should set targetNamespace', () => {
      assert.equal(m.targetNamespace, 'http://example.com/calculator');
    });

    it('should extract top-level service documentation', () => {
      assert.ok(m.documentation.length > 0);
      assert.ok(m.documentation.includes('calculator'));
    });

    describe('types', () => {
      it('should extract 6 types (5 element-wrapped complexTypes + 1 simpleType)', () => {
        assert.equal(m.types.length, 6);
      });

      it('should mark element-wrapped types with kind "element"', () => {
        const t = m.types.find((t) => t.name === 'AddRequest');
        assert.ok(t, 'AddRequest type not found');
        assert.equal(t.kind, 'element');
      });

      it('should extract fields from AddRequest', () => {
        const t = m.types.find((t) => t.name === 'AddRequest');
        assert.equal(t.fields.length, 2);
        assert.equal(t.fields[0].name, 'a');
        assert.equal(t.fields[0].type, 'double');
        assert.equal(t.fields[0].minOccurs, '1');
      });

      it('should extract field documentation from XSD annotation', () => {
        const t = m.types.find((t) => t.name === 'AddRequest');
        assert.ok(t.fields[0].documentation.includes('operand'));
      });

      it('should extract the RoundingMode simpleType with kind "simpleType"', () => {
        const t = m.types.find((t) => t.name === 'RoundingMode');
        assert.ok(t, 'RoundingMode type not found');
        assert.equal(t.kind, 'simpleType');
      });

      it('should extract all 4 enumeration values for RoundingMode', () => {
        const t = m.types.find((t) => t.name === 'RoundingMode');
        assert.deepEqual(t.enumerations, ['FLOOR', 'CEILING', 'HALF_UP', 'HALF_DOWN']);
      });
    });

    describe('messages', () => {
      it('should extract 5 messages', () => {
        assert.equal(m.messages.length, 5);
      });

      it('should include AddInput with one element= part', () => {
        const msg = m.messages.find((msg) => msg.name === 'AddInput');
        assert.ok(msg);
        assert.equal(msg.parts.length, 1);
        assert.equal(msg.parts[0].element, 'AddRequest');
        assert.equal(msg.parts[0].type, '');
      });
    });

    describe('operations', () => {
      it('should extract 2 operations', () => {
        assert.equal(m.operations.length, 2);
      });

      it('should extract documentation for the Add operation', () => {
        const op = m.operations.find((o) => o.name === 'Add');
        assert.ok(op?.documentation.length > 0);
      });

      it('should resolve Add input and output message names without namespace prefix', () => {
        const op = m.operations.find((o) => o.name === 'Add');
        assert.equal(op.input, 'AddInput');
        assert.equal(op.output, 'AddOutput');
      });

      it('should extract no faults for the Add operation', () => {
        const op = m.operations.find((o) => o.name === 'Add');
        assert.equal(op.faults.length, 0);
      });

      it('should extract one fault for the Divide operation', () => {
        const op = m.operations.find((o) => o.name === 'Divide');
        assert.equal(op.faults.length, 1);
        assert.equal(op.faults[0].name, 'DivisionByZero');
        assert.equal(op.faults[0].message, 'MathFaultMessage');
      });
    });

    describe('bindings', () => {
      it('should extract 1 binding', () => {
        assert.equal(m.bindings.length, 1);
      });

      it('should detect document style and SOAP 1.1 protocol', () => {
        assert.equal(m.bindings[0].style, 'document');
        assert.equal(m.bindings[0].protocol, 'SOAP 1.1');
      });

      it('should extract SOAPAction for each bound operation', () => {
        const ops = m.bindings[0].operations;
        const add = ops.find((o) => o.name === 'Add');
        assert.ok(add);
        assert.equal(add.soapAction, 'http://example.com/calculator/Add');
      });

      it('should resolve binding type without namespace prefix', () => {
        assert.equal(m.bindings[0].type, 'CalculatorPortType');
      });
    });

    describe('endpoints', () => {
      it('should extract 1 endpoint', () => {
        assert.equal(m.endpoints.length, 1);
      });

      it('should set service, port, binding and url on the endpoint', () => {
        const ep = m.endpoints[0];
        assert.equal(ep.service, 'CalculatorService');
        assert.equal(ep.port, 'CalculatorPort');
        assert.equal(ep.binding, 'CalculatorSOAPBinding');
        assert.equal(ep.url, 'http://example.com/calculator');
      });
    });
  });

  describe('hello.wsdl', () => {
    const m = model('hello.wsdl');

    it('should set the service name', () => {
      assert.equal(m.name, 'Hello');
    });

    it('should return an empty documentation string when none is present', () => {
      assert.equal(m.documentation, '');
    });

    describe('types', () => {
      it('should extract 2 named complexTypes', () => {
        assert.equal(m.types.length, 2);
        assert.ok(m.types.every((t) => t.kind === 'complexType'));
      });

      it('should extract SayHelloRequest with 2 fields', () => {
        const t = m.types.find((t) => t.name === 'SayHelloRequest');
        assert.ok(t);
        assert.equal(t.fields.length, 2);
      });

      it('should mark the locale field as optional (minOccurs=0)', () => {
        const t = m.types.find((t) => t.name === 'SayHelloRequest');
        const locale = t.fields.find((f) => f.name === 'locale');
        assert.ok(locale);
        assert.equal(locale.minOccurs, '0');
      });
    });

    describe('messages', () => {
      it('should extract 2 messages using type= references', () => {
        assert.equal(m.messages.length, 2);
        for (const msg of m.messages) {
          assert.ok(msg.parts[0].type, `expected type on part of ${msg.name}`);
          assert.equal(msg.parts[0].element, '');
        }
      });
    });

    describe('operations', () => {
      it('should extract 1 operation named SayHello', () => {
        assert.equal(m.operations.length, 1);
        assert.equal(m.operations[0].name, 'SayHello');
      });

      it('should have no faults on SayHello', () => {
        assert.equal(m.operations[0].faults.length, 0);
      });
    });

    describe('bindings', () => {
      it('should detect rpc style on the HelloSOAPBinding', () => {
        assert.equal(m.bindings[0].style, 'rpc');
      });
    });
  });

});
