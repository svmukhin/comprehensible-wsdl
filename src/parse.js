/**
 * parse.js – thin wrapper around fast-xml-parser.
 *
 * Returns a raw JS object tree from a WSDL XML string.
 * All namespace prefixes are stripped from element names so that downstream
 * code does not need to know whether the source used `wsdl:`, `s:`, `xs:`, etc.
 * Attributes are preserved under the `@_` prefix (e.g. `@_name`, `@_type`).
 * Repeating WSDL/XSD elements (operation, message, part, …) are always arrays.
 */

import { XMLParser } from 'fast-xml-parser';

/**
 * @param {string} xml  Raw WSDL XML string.
 * @returns {object}    Raw parsed object (fast-xml-parser output).
 * @throws {Error}      If the XML is not well-formed or lacks a <definitions> root.
 */
export function parseWsdl(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    isArray: isArrayTag,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: true,
    allowBooleanAttributes: true,
  });
  const result = parser.parse(xml);
  if (!result || typeof result !== 'object') {
    throw new Error('Failed to parse WSDL: unexpected parser output.');
  }
  const root = result['definitions'];
  if (!root) {
    throw new Error('Not a valid WSDL document: missing <definitions> root element.');
  }
  return result;
}

/**
 * Tells fast-xml-parser which elements must always be arrays, even when only
 * one occurrence is present. Covers all repeating WSDL 1.1 and XSD elements
 * so downstream code can iterate without existence checks.
 *
 * @param {string}  _tagName     Element name (namespace prefix already stripped).
 * @param {string}  _jPath       Dot-notation path of the element in the tree.
 * @param {boolean} _isLeaf
 * @param {boolean} _isAttribute
 * @returns {boolean}
 */
function isArrayTag(_tagName, _jPath, _isLeaf, _isAttribute) {
  if (_isAttribute) return false;
  const arrayElements = new Set([
    'operation', 'message', 'part', 'portType', 'binding', 'service', 'port',
    'element', 'complexType', 'simpleType', 'enumeration',
    'sequence', 'all', 'choice',
    'import', 'include',
    'fault', 'input', 'output',
    'annotation', 'documentation',
  ]);
  return arrayElements.has(_tagName);
}
