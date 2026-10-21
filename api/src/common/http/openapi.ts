import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * Post-processing for the generated document:
 *  - strips nestjs-zod's `_Output` suffix where it does not collide
 *    (clients get `CustomerOrder`, not `CustomerOrder_Output`);
 *  - downgrades any remaining JSON-Schema 2020 constructs to OpenAPI 3.0
 *    (`type: [T, "null"]` → `nullable`, numeric exclusive bounds, `const` → `enum`).
 */
export function tidyOpenApi(doc: OpenAPIObject): OpenAPIObject {
  const schemas = doc.components?.schemas ?? {};
  const renames = new Map<string, string>();
  for (const name of Object.keys(schemas)) {
    if (!name.endsWith('_Output')) continue;
    const base = name.slice(0, -'_Output'.length);
    if (!(base in schemas)) renames.set(name, base);
  }
  let text = JSON.stringify(doc);
  for (const [from, to] of renames) {
    text = text
      .replaceAll(`"#/components/schemas/${from}"`, `"#/components/schemas/${to}"`)
      .replaceAll(`"${from}":`, `"${to}":`);
  }
  return { ...(toOpenApi30(JSON.parse(text)) as OpenAPIObject), openapi: '3.0.3' };
}

type Node = Record<string, unknown>;

/**
 * Run on the raw document, before nestjs-zod's cleanup. @nestjs/swagger reads a top-level
 * DTO property typed `["string", "null"]` as an *array of string*; nestjs-zod leaves an
 * `x-nestjs_zod-empty-type` marker on exactly those properties, so we turn them back into
 * a nullable scalar.
 */
export function repairNullableRoots(doc: OpenAPIObject): OpenAPIObject {
  for (const schema of Object.values(doc.components?.schemas ?? {}) as Node[]) {
    const props = schema.properties as Record<string, Node> | undefined;
    if (!props) continue;
    for (const [key, prop] of Object.entries(props)) {
      if (prop['x-nestjs_zod-empty-type'] !== true || prop.type !== 'array') continue;
      const { type: _t, items, ...rest } = prop;
      const item = (items ?? {}) as Node;
      props[key] = { ...rest, ...item, type: [item.type, 'null'] };
    }
  }
  return doc;
}

function toOpenApi30(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toOpenApi30);
  if (!value || typeof value !== 'object') return value;
  const node: Node = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toOpenApi30(v)]));

  if (Array.isArray(node.type)) {
    const types = (node.type as string[]).filter((t) => t !== 'null');
    if (types.length < (node.type as string[]).length) node.nullable = true;
    node.type = types.length === 1 ? types[0] : types;
  }
  for (const key of ['anyOf', 'oneOf'] as const) {
    const variants = node[key] as Node[] | undefined;
    if (!variants) continue;
    const nonNull = variants.filter((v) => v.type !== 'null');
    if (nonNull.length === variants.length) continue;
    node.nullable = true;
    if (nonNull.length === 1) {
      delete node[key];
      Object.assign(node, nonNull[0], { nullable: true });
    } else node[key] = nonNull;
  }
  for (const [exclusive, bound] of [
    ['exclusiveMinimum', 'minimum'],
    ['exclusiveMaximum', 'maximum'],
  ] as const) {
    if (typeof node[exclusive] === 'number') {
      node[bound] = node[exclusive];
      node[exclusive] = true;
    }
  }
  if (Array.isArray(node.enum) && (node.enum as unknown[]).includes(null)) {
    node.enum = (node.enum as unknown[]).filter((v) => v !== null);
    node.nullable = true;
  }
  // JSON-Schema-only keywords that OpenAPI 3.0 rejects
  delete node.propertyNames;
  delete node.$schema;
  if ('const' in node) {
    node.enum = [node.const];
    delete node.const;
  }
  return node;
}
