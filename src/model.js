/**
 * model.js – normalises the raw fast-xml-parser output into a plain JS model
 * that render.js can consume without knowing raw XML structure details.
 *
 * The returned model object has the shape:
 * {
 *   name: string,
 *   targetNamespace: string,
 *   documentation: string,
 *   types:      Array<{ name, kind, documentation, fields, enumerations }>,
 *   messages:   Array<{ name, parts: Array<{ name, element, type }> }>,
 *   operations: Array<{ name, documentation, input, output, faults }>,
 *   bindings:   Array<{ name, type, style, transport, protocol, operations }>,
 *   endpoints:  Array<{ service, port, binding, url }>,
 * }
 *
 * Namespace prefixes in attribute values (e.g. "tns:AddRequest") are stripped
 * via stripNs() so consumers always see bare local names.
 */

import { stripNs, text, arr } from './util.js';

/**
 * @param {object} raw  Output of parseWsdl().
 * @returns {object}    Normalised model object.
 */
export function buildModel(raw) {
  const defs = raw['definitions'];
  const schema = defs?.['types']?.['schema'] ?? {};
  return {
    name: defs['@_name'] ?? '',
    targetNamespace: defs['@_targetNamespace'] ?? '',
    documentation: getDoc(defs),
    types: extractTypes(schema),
    messages: extractMessages(arr(defs['message'])),
    operations: extractOperations(arr(defs['portType'])),
    bindings: extractBindings(arr(defs['binding'])),
    endpoints: extractEndpoints(arr(defs['service'])),
  };
}

/**
 * Extracts documentation text from a node, checking both a direct
 * <documentation> child (WSDL style) and the XSD <annotation><documentation>
 * pattern. Returns an empty string when no documentation is present.
 *
 * @param {object|null|undefined} node
 * @returns {string}
 */
function getDoc(node) {
  if (!node) return '';
  const direct = text(arr(node['documentation'])[0]);
  if (direct) return direct;
  const annotation = arr(node['annotation'])[0];
  return text(arr(annotation?.['documentation'])[0]);
}

/**
 * Builds the types array from an XSD schema node. Covers inline complexTypes
 * nested inside top-level elements, named complexTypes, and named simpleTypes.
 *
 * @param {object} schema
 * @returns {Array}
 */
function extractTypes(schema) {
  const types = [];
  for (const el of arr(schema['element'])) {
    const ct = arr(el['complexType'])[0];
    if (!ct) continue;
    types.push({
      name: el['@_name'] ?? '',
      kind: 'element',
      documentation: getDoc(el),
      fields: extractFields(ct),
      enumerations: [],
    });
  }
  for (const ct of arr(schema['complexType'])) {
    types.push({
      name: ct['@_name'] ?? '',
      kind: 'complexType',
      documentation: getDoc(ct),
      fields: extractFields(ct),
      enumerations: [],
    });
  }
  for (const st of arr(schema['simpleType'])) {
    types.push({
      name: st['@_name'] ?? '',
      kind: 'simpleType',
      documentation: getDoc(st),
      fields: [],
      enumerations: extractEnumerations(st),
    });
  }
  return types;
}

/**
 * Extracts field descriptors from a complexType node by inspecting its
 * sequence, all, or choice compositor child.
 *
 * @param {object} complexTypeNode
 * @returns {Array<{ name, type, minOccurs, maxOccurs, documentation }>}
 */
function extractFields(complexTypeNode) {
  const compositor =
    arr(complexTypeNode['sequence'])[0] ??
    arr(complexTypeNode['all'])[0] ??
    arr(complexTypeNode['choice'])[0] ??
    {};
  return arr(compositor['element']).map((el) => ({
    name: el['@_name'] ?? '',
    type: stripNs(el['@_type'] ?? el['@_element'] ?? ''),
    minOccurs: el['@_minOccurs'] ?? '1',
    maxOccurs: el['@_maxOccurs'] ?? '1',
    documentation: getDoc(el),
  }));
}

/**
 * Extracts enumeration values from a simpleType restriction node.
 *
 * @param {object} simpleTypeNode
 * @returns {string[]}
 */
function extractEnumerations(simpleTypeNode) {
  const restriction = simpleTypeNode['restriction'];
  if (!restriction) return [];
  return arr(restriction['enumeration']).map((e) => e['@_value'] ?? '');
}

/**
 * @param {object[]} messages
 * @returns {Array<{ name, parts }>}
 */
function extractMessages(messages) {
  return messages.map((msg) => ({
    name: msg['@_name'] ?? '',
    parts: arr(msg['part']).map((p) => ({
      name: p['@_name'] ?? '',
      element: stripNs(p['@_element'] ?? ''),
      type: stripNs(p['@_type'] ?? ''),
    })),
  }));
}

/**
 * Flattens operations from all portTypes into a single array.
 *
 * @param {object[]} portTypes
 * @returns {Array<{ name, documentation, input, output, faults }>}
 */
function extractOperations(portTypes) {
  const operations = [];
  for (const pt of portTypes) {
    for (const op of arr(pt['operation'])) {
      operations.push({
        name: op['@_name'] ?? '',
        documentation: getDoc(op),
        input: stripNs(arr(op['input'])[0]?.['@_message'] ?? ''),
        output: stripNs(arr(op['output'])[0]?.['@_message'] ?? ''),
        faults: arr(op['fault']).map((f) => ({
          name: f['@_name'] ?? '',
          message: stripNs(f['@_message'] ?? ''),
        })),
      });
    }
  }
  return operations;
}

/**
 * Extracts binding metadata. After namespace-prefix stripping, the
 * <soap:binding> child element collides in name with the outer <wsdl:binding>,
 * so it appears as binding[0].binding[0] (both forced to arrays by isArrayTag).
 * Likewise, <soap:operation> inside <wsdl:operation> appears as
 * wsdlOp.operation[0].
 *
 * @param {object[]} bindings
 * @returns {Array<{ name, type, style, transport, protocol, operations }>}
 */
function extractBindings(bindings) {
  return bindings.map((b) => {
    const soapBinding = arr(b['binding'])[0] ?? {};
    return {
      name: b['@_name'] ?? '',
      type: stripNs(b['@_type'] ?? ''),
      style: soapBinding['@_style'] ?? 'document',
      transport: soapBinding['@_transport'] ?? '',
      protocol: detectProtocol(soapBinding['@_transport'] ?? ''),
      operations: arr(b['operation']).map((op) => {
        const soapOp = arr(op['operation'])[0] ?? {};
        return {
          name: op['@_name'] ?? '',
          soapAction: soapOp['@_soapAction'] ?? '',
        };
      }),
    };
  });
}

/**
 * @param {string} transport
 * @returns {'SOAP 1.1'|'SOAP 1.2'}
 */
function detectProtocol(transport) {
  if (transport.includes('soap12')) return 'SOAP 1.2';
  return 'SOAP 1.1';
}

/**
 * @param {object[]} services
 * @returns {Array<{ service, port, binding, url }>}
 */
function extractEndpoints(services) {
  const endpoints = [];
  for (const svc of services) {
    for (const port of arr(svc['port'])) {
      const address = port['address'];
      endpoints.push({
        service: svc['@_name'] ?? '',
        port: port['@_name'] ?? '',
        binding: stripNs(port['@_binding'] ?? ''),
        url: (Array.isArray(address) ? address[0] : address)?.['@_location'] ?? '',
      });
    }
  }
  return endpoints;
}
