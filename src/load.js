/**
 * SPDX-FileCopyrightText: Copyright (c) 2026 Sergei Mukhin
 * SPDX-License-Identifier: MIT
 */

/**
 * load.js – async WSDL loader that recursively resolves <xsd:import>,
 * <xsd:include>, and <wsdl:import> references before handing off to
 * buildModel().
 *
 * Resolution rules (applied in order):
 *   1. If the location starts with "http://" or "https://" → fetch() from URL
 *   2. Otherwise → resolve as a path relative to baseDir
 *
 * Circular imports are prevented via a Set of already-visited locations.
 * Relative locations are resolved relative to the directory of the file that
 * contains the import, so deeply nested import chains work correctly.
 *
 * Schema merging: top-level XSD declarations (element, complexType, simpleType)
 * from imported/included schemas are appended to the main schema's arrays so
 * that buildModel() sees all types in one flat list.
 *
 * WSDL import merging: message, portType, binding, and service nodes from an
 * imported WSDL definitions element are appended to the main definitions.
 *
 * loadWsdl(xml, options) is the public entry point.
 * options:
 *   baseDir  {string} – directory used to resolve relative locations.
 *                       Defaults to process.cwd().
 *   _visited {Set}    – internal; callers should not set this.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname as pathDirname } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { parseWsdl } from './parse.js';
import { arr } from './util.js';

const XSD_TYPE_KEYS = ['element', 'complexType', 'simpleType', 'group', 'attributeGroup'];
const WSDL_DEF_KEYS = ['message', 'portType', 'binding', 'service'];

/**
 * @param {string} xml       Raw WSDL XML string.
 * @param {object} [options]
 * @param {string} [options.baseDir]  Directory for resolving relative imports.
 * @returns {Promise<object>}         Merged raw object ready for buildModel().
 */
export async function loadWsdl(xml, { baseDir = process.cwd() } = {}) {
  const visited = new Set();
  return resolveWsdl(xml, baseDir, visited);
}

/**
 * Parses a WSDL XML string, resolves all imports recursively, and returns
 * the merged raw object.
 *
 * @param {string} xml
 * @param {string} baseDir
 * @param {Set<string>} visited
 * @returns {Promise<object>}
 */
async function resolveWsdl(xml, baseDir, visited) {
  const raw = parseWsdl(xml);
  const defs = raw['definitions'];
  const schema = ensureSchema(defs);
  await resolveXsdImports(schema, baseDir, visited);
  await resolveWsdlImports(defs, baseDir, visited);
  return raw;
}

/**
 * Resolves <xsd:import> and <xsd:include> elements inside a schema node by
 * fetching the referenced XSD source, parsing it, and merging its top-level
 * type declarations into schema.
 *
 * @param {object} schema
 * @param {string} baseDir
 * @param {Set<string>} visited
 */
async function resolveXsdImports(schema, baseDir, visited) {
  for (const imp of [...arr(schema['import']), ...arr(schema['include'])]) {
    const loc = imp['@_schemaLocation'];
    if (!loc) continue;
    const absLoc = absoluteLocation(loc, baseDir);
    if (visited.has(absLoc)) continue;
    visited.add(absLoc);
    const xsdXml = await fetchSource(absLoc);
    const importedSchema = parseXsd(xsdXml);
    const importedBaseDir = baseDirOf(absLoc);
    await resolveXsdImports(importedSchema, importedBaseDir, visited);
    mergeSchema(schema, importedSchema);
  }
}

/**
 * Resolves <wsdl:import> elements inside a definitions node by fetching the
 * referenced WSDL, parsing it (with its own imports resolved), and merging
 * its messages, portTypes, bindings, and services into defs.
 *
 * @param {object} defs
 * @param {string} baseDir
 * @param {Set<string>} visited
 */
async function resolveWsdlImports(defs, baseDir, visited) {
  for (const imp of arr(defs['import'])) {
    const loc = imp['@_location'];
    if (!loc) continue;
    const absLoc = absoluteLocation(loc, baseDir);
    if (visited.has(absLoc)) continue;
    visited.add(absLoc);
    const importedXml = await fetchSource(absLoc);
    const importedRaw = await resolveWsdl(importedXml, baseDirOf(absLoc), visited);
    mergeWsdlDefs(defs, importedRaw['definitions']);
  }
}

/**
 * Returns the schema node from a definitions object, creating an empty one
 * when the types or schema element is absent.
 *
 * @param {object} defs
 * @returns {object}
 */
function ensureSchema(defs) {
  if (!defs['types']) defs['types'] = {};
  if (!defs['types']['schema']) defs['types']['schema'] = {};
  return defs['types']['schema'];
}

/**
 * Appends top-level XSD declarations (element, complexType, simpleType, …)
 * from src into dest by concatenating the arrays for each key.
 *
 * @param {object} dest  Schema node to merge into.
 * @param {object} src   Schema node to merge from.
 */
function mergeSchema(dest, src) {
  for (const key of XSD_TYPE_KEYS) {
    const srcItems = arr(src[key]);
    if (!srcItems.length) continue;
    dest[key] = [...arr(dest[key]), ...srcItems];
  }
}

/**
 * Appends WSDL definition nodes (message, portType, binding, service) from
 * src into dest, deduplicating by @_name to avoid double-rendering when the
 * same file is transitively imported more than once.
 *
 * @param {object} dest  Definitions node to merge into.
 * @param {object} src   Definitions node to merge from.
 */
function mergeWsdlDefs(dest, src) {
  for (const key of WSDL_DEF_KEYS) {
    const srcItems = arr(src[key]);
    if (!srcItems.length) continue;
    const destItems = arr(dest[key]);
    const existingNames = new Set(destItems.map((n) => n['@_name']));
    const newItems = srcItems.filter((n) => !existingNames.has(n['@_name']));
    dest[key] = [...destItems, ...newItems];
  }
}

/**
 * Parses a standalone XSD document and returns the schema node.
 * Uses the same XMLParser settings as parseWsdl (namespace stripping, arrays).
 *
 * @param {string} xml
 * @returns {object}  The <schema> node.
 */
function parseXsd(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    isArray: isXsdArrayTag,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: true,
  });
  const result = parser.parse(xml);
  return result['schema'] ?? result['definitions']?.['types']?.['schema'] ?? {};
}

/**
 * @param {string} _tagName
 * @param {string} _jPath
 * @param {boolean} _isLeaf
 * @param {boolean} _isAttribute
 * @returns {boolean}
 */
function isXsdArrayTag(_tagName, _jPath, _isLeaf, _isAttribute) {
  if (_isAttribute) return false;
  return new Set([
    'element', 'complexType', 'simpleType', 'enumeration',
    'sequence', 'all', 'choice', 'import', 'include',
    'annotation', 'documentation',
  ]).has(_tagName);
}

/**
 * Resolves a location to an absolute path or URL.
 * Relative paths are resolved against baseDir. URLs are returned unchanged.
 *
 * @param {string} loc
 * @param {string} baseDir
 * @returns {string}
 */
function absoluteLocation(loc, baseDir) {
  if (isUrl(loc)) return loc;
  return resolve(baseDir, loc);
}

/**
 * Returns the base directory for resolving further relative imports inside
 * the document at the given location.
 *
 * @param {string} absLoc  Absolute path or URL of the already-loaded file.
 * @returns {string}
 */
function baseDirOf(absLoc) {
  if (isUrl(absLoc)) {
    const url = new URL(absLoc);
    url.pathname = url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
    return url.toString();
  }
  return pathDirname(absLoc);
}

/**
 * @param {string} loc
 * @returns {boolean}
 */
function isUrl(loc) {
  return loc.startsWith('http://') || loc.startsWith('https://');
}

/**
 * Fetches the content of a URL or local file path and returns it as a UTF-8
 * string. Throws an Error with the location in the message on failure.
 *
 * @param {string} absLoc  Absolute file path or http(s) URL.
 * @returns {Promise<string>}
 */
async function fetchSource(absLoc) {
  if (isUrl(absLoc)) {
    const res = await fetch(absLoc);
    if (!res.ok) throw new Error(`Failed to fetch ${absLoc}: HTTP ${res.status}`);
    return res.text();
  }
  return readFile(absLoc, 'utf8');
}
