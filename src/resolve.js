/**
 * resolve.js – builds name-keyed lookup indexes from a normalised model and
 * provides helpers to follow cross-section references.
 *
 * WSDL documents are full of indirect references by local name:
 *   operation.input  → message name  → message object
 *   message.part     → element/type name → type object → fields
 *
 * Resolving these at render time rather than in model.js keeps the model
 * a pure data structure and lets the resolver be tested in isolation.
 *
 * buildIndex(model) returns:
 *   {
 *     typeByName:    Map<string, typeObject>
 *     messageByName: Map<string, messageObject>
 *   }
 *
 * resolveMessageFields(messageName, index) returns the flattened list of
 * { partName, typeName, fields, enumerations } for each part of the message,
 * following element= and type= references into the type index.
 * Returns an empty array when the message is not found.
 */

/**
 * @param {object} model  Output of buildModel().
 * @returns {{ typeByName: Map, messageByName: Map }}
 */
export function buildIndex(model) {
  return {
    typeByName: new Map(model.types.map((t) => [t.name, t])),
    messageByName: new Map(model.messages.map((m) => [m.name, m])),
  };
}

/**
 * Looks up a message by name and resolves each of its parts to the
 * corresponding type object (preferring element= over type= reference).
 * Returns an empty array when the message name is unknown.
 *
 * @param {string} messageName
 * @param {{ typeByName: Map, messageByName: Map }} index
 * @returns {Array<{ partName: string, typeName: string, fields: Array, enumerations: Array }>}
 */
export function resolveMessageFields(messageName, index) {
  const message = index.messageByName.get(messageName);
  if (!message) return [];
  return message.parts.map((part) => {
    const refName = part.element || part.type;
    const type = index.typeByName.get(refName);
    return {
      partName: part.name,
      typeName: refName,
      fields: type?.fields ?? [],
      enumerations: type?.enumerations ?? [],
    };
  });
}
