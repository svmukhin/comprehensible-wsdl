/**
 * util.js – shared helpers used by model.js and render.js.
 *
 * stripNs: removes namespace prefix from attribute values like "tns:AddRequest"
 *   → "AddRequest". fast-xml-parser strips prefixes from element names but not
 *   from attribute values, so this must be applied manually.
 *
 * text: extracts a plain string from a node that may be a string, an array,
 *   a fast-xml-parser object with a "#text" key, or null/undefined.
 *
 * arr: wraps any value in an array if it is not already one, and returns []
 *   for null/undefined. Provides safe iteration over nodes that may be absent
 *   or singular even outside the isArray list.
 */

/**
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function stripNs(value) {
  if (!value || typeof value !== 'string') return value ?? '';
  const colon = value.indexOf(':');
  return colon === -1 ? value : value.slice(colon + 1);
}

/**
 * @param {unknown} node
 * @returns {string}
 */
export function text(node) {
  if (!node) return '';
  if (typeof node === 'string') return node.trim();
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object') return String(node['#text'] ?? '').trim();
  return String(node).trim();
}

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
export function arr(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
