/**
 * render.js – converts the normalised model produced by model.js into a
 * self-contained HTML5 string styled by edible-css.
 *
 * The output uses only semantic HTML5 elements so that edible-css can style
 * everything without CSS classes:
 *   <details>/<summary>  – collapsible type definitions
 *   <table>              – fields, message parts, binding ops, endpoints
 *   <article>            – one per WSDL operation
 *   <blockquote>         – <wsdl:documentation> text
 *   <code>               – type names, namespaces, SOAPActions, URLs
 *   <mark>               – required fields (minOccurs >= 1)
 *
 * renderHtml(model, options) is the single public entry point.
 * options: { title?: string, inlineCss?: string }
 *   title     – overrides the page <title>; defaults to "{model.name} – WSDL Reference"
 *   inlineCss – when set, embeds this string in a <style> tag instead of the CDN <link>
 */

const CDN =
  'https://cdn.jsdelivr.net/npm/@svmukhin/edible-css@latest/dist/edible.min.css';

/**
 * Escapes a string for safe HTML text content and attribute values.
 *
 * @param {unknown} value
 * @returns {string}
 */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Returns a <blockquote><p>…</p></blockquote> when text is non-empty,
 * or an empty string otherwise.
 *
 * @param {string} text
 * @returns {string}
 */
function doc(text) {
  if (!text) return '';
  return `<blockquote><p>${esc(text)}</p></blockquote>`;
}

/**
 * Renders the CSS link or inline style depending on the inlineCss option.
 *
 * @param {string|undefined} inlineCss
 * @returns {string}
 */
function renderCss(inlineCss) {
  if (inlineCss) return `<style>${inlineCss}</style>`;
  return `<link rel="stylesheet" href="${CDN}">`;
}

/**
 * Renders the <header> containing the service name, namespace, and anchor nav.
 *
 * @param {object} model
 * @returns {string}
 */
function renderHeader(model) {
  return `<header>
<h1>${esc(model.name)}</h1>
${model.documentation ? doc(model.documentation) : ''}
<p>Target namespace: <code>${esc(model.targetNamespace)}</code></p>
<nav>
<ul>
<li><a href="#types">Types</a></li>
<li><a href="#messages">Messages</a></li>
<li><a href="#operations">Operations</a></li>
<li><a href="#bindings">Bindings</a></li>
<li><a href="#endpoints">Endpoints</a></li>
</ul>
</nav>
</header>`;
}

/**
 * Renders a single type as a <details> block. complexType and element-wrapped
 * types get a field table; simpleType enumerations get a value list.
 *
 * @param {{ name, kind, documentation, fields, enumerations }} type
 * @returns {string}
 */
function renderType(type) {
  const kindLabel = type.kind === 'simpleType' ? 'enum' : 'type';
  const body =
    type.kind === 'simpleType'
      ? renderEnumerations(type.enumerations)
      : renderFieldTable(type.fields);
  return `<details>
<summary><strong>${esc(type.name)}</strong> <small>${kindLabel}</small></summary>
${doc(type.documentation)}
${body}
</details>`;
}

/**
 * Renders a <table> of XSD field descriptors. Required fields (minOccurs >= 1)
 * have their name wrapped in <mark>.
 *
 * @param {Array<{ name, type, minOccurs, maxOccurs, documentation }>} fields
 * @returns {string}
 */
function renderFieldTable(fields) {
  if (!fields.length) return '<p><em>No fields.</em></p>';
  const rows = fields.map((f) => {
    const required = String(f.minOccurs) !== '0';
    const nameCel = required ? `<mark>${esc(f.name)}</mark>` : esc(f.name);
    return `<tr><td>${nameCel}</td><td><code>${esc(f.type)}</code></td><td>${esc(f.minOccurs)}</td><td>${esc(f.maxOccurs)}</td><td>${esc(f.documentation)}</td></tr>`;
  });
  return `<table>
<thead><tr><th>Field</th><th>Type</th><th>Min</th><th>Max</th><th>Documentation</th></tr></thead>
<tbody>${rows.join('\n')}</tbody>
</table>`;
}

/**
 * Renders enumeration values as an unordered list.
 *
 * @param {string[]} values
 * @returns {string}
 */
function renderEnumerations(values) {
  if (!values.length) return '<p><em>No values.</em></p>';
  return `<ul>${values.map((v) => `<li><code>${esc(v)}</code></li>`).join('')}</ul>`;
}

/**
 * Renders the types section.
 *
 * @param {object[]} types
 * @returns {string}
 */
function renderTypes(types) {
  const content = types.length
    ? types.map(renderType).join('\n')
    : '<p><em>No types defined.</em></p>';
  return `<section id="types">
<h2>Types</h2>
${content}
</section>`;
}

/**
 * Renders the messages section as a definition list.
 *
 * @param {object[]} messages
 * @returns {string}
 */
function renderMessages(messages) {
  const content = messages.length
    ? messages.map((msg) => {
        const parts = msg.parts.map((p) => {
          const ref = p.element || p.type;
          return `<dd><strong>${esc(p.name)}</strong>: <code>${esc(ref)}</code>${p.element ? ' <small>(element)</small>' : ' <small>(type)</small>'}</dd>`;
        }).join('\n');
        return `<dt><strong>${esc(msg.name)}</strong></dt>\n${parts}`;
      }).join('\n')
    : '<p><em>No messages defined.</em></p>';
  return `<section id="messages">
<h2>Messages</h2>
<dl>
${content}
</dl>
</section>`;
}

/**
 * Renders one WSDL operation as an <article>.
 *
 * @param {{ name, documentation, input, output, faults }} op
 * @returns {string}
 */
function renderOperation(op) {
  const faultList = op.faults.length
    ? `<h4>Faults</h4><ul>${op.faults.map((f) => `<li><strong>${esc(f.name)}</strong>: <code>${esc(f.message)}</code></li>`).join('')}</ul>`
    : '';
  return `<article id="op-${esc(op.name)}">
<h3>${esc(op.name)}</h3>
${doc(op.documentation)}
<table>
<thead><tr><th>Direction</th><th>Message</th></tr></thead>
<tbody>
<tr><td>Input</td><td><code>${esc(op.input)}</code></td></tr>
<tr><td>Output</td><td><code>${esc(op.output)}</code></td></tr>
</tbody>
</table>
${faultList}
</article>`;
}

/**
 * Renders the operations section.
 *
 * @param {object[]} operations
 * @returns {string}
 */
function renderOperations(operations) {
  const content = operations.length
    ? operations.map(renderOperation).join('\n')
    : '<p><em>No operations defined.</em></p>';
  return `<section id="operations">
<h2>Operations</h2>
${content}
</section>`;
}

/**
 * Renders the bindings section.
 *
 * @param {object[]} bindings
 * @returns {string}
 */
function renderBindings(bindings) {
  const content = bindings.length
    ? bindings.map((b) => {
        const rows = b.operations.map((op) =>
          `<tr><td>${esc(op.name)}</td><td><code>${esc(op.soapAction)}</code></td></tr>`
        ).join('\n');
        return `<details>
<summary><strong>${esc(b.name)}</strong> <small>${esc(b.protocol)} · ${esc(b.style)}</small></summary>
<p>Type: <code>${esc(b.type)}</code> · Transport: <code>${esc(b.transport)}</code></p>
<table>
<thead><tr><th>Operation</th><th>SOAPAction</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</details>`;
      }).join('\n')
    : '<p><em>No bindings defined.</em></p>';
  return `<section id="bindings">
<h2>Bindings</h2>
${content}
</section>`;
}

/**
 * Renders the endpoints section as a table.
 *
 * @param {object[]} endpoints
 * @returns {string}
 */
function renderEndpoints(endpoints) {
  const content = endpoints.length
    ? `<table>
<thead><tr><th>Service</th><th>Port</th><th>Binding</th><th>URL</th></tr></thead>
<tbody>
${endpoints.map((ep) => `<tr><td>${esc(ep.service)}</td><td>${esc(ep.port)}</td><td><code>${esc(ep.binding)}</code></td><td><code>${esc(ep.url)}</code></td></tr>`).join('\n')}
</tbody>
</table>`
    : '<p><em>No endpoints defined.</em></p>';
  return `<section id="endpoints">
<h2>Endpoints</h2>
${content}
</section>`;
}

/**
 * Converts a normalised WSDL model into a complete, self-contained HTML5 page.
 *
 * @param {object} model      Output of buildModel().
 * @param {object} [options]
 * @param {string} [options.title]     Override the page <title>.
 * @param {string} [options.inlineCss] Embed this CSS string instead of CDN link.
 * @returns {string}          Full HTML5 document as a string.
 */
export function renderHtml(model, options = {}) {
  const title = options.title ?? `${model.name} – WSDL Reference`;
  const date = new Date().toISOString().slice(0, 10);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
${renderCss(options.inlineCss)}
</head>
<body>
${renderHeader(model)}
<main>
${renderTypes(model.types)}
${renderMessages(model.messages)}
${renderOperations(model.operations)}
${renderBindings(model.bindings)}
${renderEndpoints(model.endpoints)}
</main>
<footer>
<p>Generated by <strong>comprehensible-wsdl</strong> on ${date}</p>
</footer>
</body>
</html>`;
}
