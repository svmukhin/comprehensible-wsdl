# comprehensible-wsdl

Generate a readable, self-contained HTML5 reference page from a WSDL file.

```bash
npx comprehensible-wsdl service.wsdl -o docs.html
```

The output is a single HTML file styled by [edible-css](https://github.com/svmukhin/edible-css)
— no classes, no build step, no JavaScript required.

---

## What gets documented

| WSDL concept | What the HTML shows                                                                    |
| ------------ | -------------------------------------------------------------------------------------- |
| Service      | Name, target namespace, documentation                                                  |
| Types (XSD)  | Each `complexType` / `simpleType` / element with fields, types, and allowed values     |
| Operations   | Name, documentation, input and output fields expanded inline, faults                   |
| Bindings     | Protocol (SOAP 1.1 / 1.2), style (document / rpc), transport, SOAPAction per operation |
| Endpoints    | Service name, port name, binding, URL                                                  |

Operations inline-expand their input / output messages so you see field names,
types, and constraints without jumping between sections.

---

## Installation

```bash
# One-off with npx (no install required)
npx comprehensible-wsdl service.wsdl -o docs.html

# Global install
npm install -g comprehensible-wsdl
comprehensible-wsdl service.wsdl -o docs.html

# Local project install
npm install --save-dev comprehensible-wsdl
npx comprehensible-wsdl service.wsdl -o docs.html
```

**Requires Node.js ≥ 18.**

---

## Usage

```text
Usage: comprehensible-wsdl [options] <wsdl-file>

Arguments:
  wsdl-file            Path to .wsdl / .xml file, or "-" to read stdin

Options:
  -V, --version        output the version number
  -o, --output <file>  Write HTML to file instead of stdout
  --title <string>     Override the page <title>
  --inline-css         Embed edible.css inline (fully offline output)
  -h, --help           display help for command
```

### Examples

```bash
# Write to a file and open in the browser
comprehensible-wsdl service.wsdl -o docs.html && xdg-open docs.html

# Print to stdout and pipe into a browser tool
comprehensible-wsdl service.wsdl | browser-sync start --file docs.html

# Read from stdin (e.g. from curl)
curl https://example.com/service?wsdl | comprehensible-wsdl - -o docs.html

# Override the page title
comprehensible-wsdl service.wsdl --title "Payment API Reference" -o docs.html

# Fully offline output — embed edible.css in the HTML file
comprehensible-wsdl service.wsdl --inline-css -o docs.html
```

---

## Import resolution

The tool resolves `<xsd:import>`, `<xsd:include>`, and `<wsdl:import>` elements
automatically:

- **Local paths** — resolved relative to the directory of the WSDL file.
- **HTTP / HTTPS URLs** — fetched at generation time using the built-in `fetch()`.
- **Circular imports** — detected and skipped.

```xml
<!-- These are resolved automatically -->
<xsd:import schemaLocation="./types/shared.xsd"/>
<xsd:import schemaLocation="https://example.com/common-types.xsd"/>
<wsdl:import location="./auth.wsdl"/>
```

---

## HTML output structure

The generated page uses only semantic HTML5 elements, which edible-css styles
without any classes:

- `<details>` / `<summary>` — collapsible type definitions
- `<table>` — fields, message parts, bindings, endpoints
- `<article>` — one per operation
- `<blockquote>` — `<wsdl:documentation>` text
- `<code>` — type names, namespaces, SOAPActions, URLs
- `<mark>` — required fields (`minOccurs ≥ 1`)
- `<nav>` — in-page anchor links to each section

---

## Styling

By default the page links to the edible-css CDN:

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/@svmukhin/edible-css@latest/dist/edible.min.css"
/>
```

To produce a fully self-contained file with no external dependencies,
use `--inline-css`. The CSS is fetched once at generation time and embedded
in a `<style>` tag.

---

## Architecture

```text
bin/cli.js          Command-line entry point (commander)
src/
  parse.js          XML string → raw JS object (fast-xml-parser)
  model.js          Raw object → normalised model
  resolve.js        Cross-reference resolution (message → type → fields)
  render.js         Model → HTML string
  load.js           Async loader: resolves xsd:import / wsdl:import recursively
  util.js           Shared helpers (stripNs, text, arr)
test/
  fixtures/         Sample WSDL and XSD files used by tests
  *.test.js         Unit and integration tests (node:test)
```

---

## Development

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run a single test file
node --test test/model.test.js

# Lint (oxlint)
npm run lint

# Format in place (Prettier)
npm run format

# Check formatting without writing (useful in CI)
npm run format:check
```

Tests use the built-in `node:test` framework — no extra test runner needed.

---

## License

MIT
