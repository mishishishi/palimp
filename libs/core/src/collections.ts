/**
 * Collections: typed, repeatable entities the site owner edits from the
 * Devtools drawer. One collection is one storage key whose string value is a
 * JSON document `{ "v": 1, "items": [...] }` — the document *is* the
 * enumeration, which is what makes create / delete / reorder all "save the new
 * document" on the existing batched write path.
 *
 * This module is pure: types, one identity function, and a validator. No
 * React, no antd — it is importable from a server component, a client
 * component and the build alike, which is why it lives at the package root
 * rather than under `./admin`.
 *
 * Design record: docs/plans/collections/01-core.md.
 */

// ---------------------------------------------------------------------------
// The field vocabulary — the minimal seven, Sveltia-named.

export type CollectionField =
  | StringField
  | TextField
  | NumberField
  | BooleanField
  | SelectField
  | ObjectField
  | ListField;

interface FieldBase {
  readonly name: string;
  readonly label?: string;
  readonly required?: boolean;
}

/* prettier-ignore */
export interface StringField  extends FieldBase { readonly widget: "string";  readonly pattern?: string; readonly default?: string }
/* prettier-ignore */
export interface TextField    extends FieldBase { readonly widget: "text";    readonly default?: string }
/* prettier-ignore */
export interface NumberField  extends FieldBase { readonly widget: "number";  readonly min?: number; readonly max?: number; readonly default?: number }
/* prettier-ignore */
export interface BooleanField extends FieldBase { readonly widget: "boolean"; readonly default?: boolean }
/* prettier-ignore */
export interface SelectField  extends FieldBase { readonly widget: "select";  readonly options: ReadonlyArray<string>; readonly default?: string }
/* prettier-ignore */
export interface ObjectField  extends FieldBase { readonly widget: "object";  readonly fields: ReadonlyArray<CollectionField> }
/* prettier-ignore */
export interface ListField    extends FieldBase { readonly widget: "list";    readonly fields: ReadonlyArray<CollectionField>; readonly min?: number; readonly max?: number }

// ---------------------------------------------------------------------------
// The item-type inference.
//
// `string` and `text` infer the same TypeScript type on purpose — they differ
// only in the antd control the modal gives them. Do not collapse them.

type FieldValue<F extends CollectionField> =
  F extends { readonly widget: "string" } | { readonly widget: "text" }
    ? string
    : F extends { readonly widget: "number" }
      ? number
      : F extends { readonly widget: "boolean" }
        ? boolean
        : F extends {
              readonly widget: "select";
              readonly options: ReadonlyArray<infer O extends string>;
            }
          ? O
          : F extends {
                readonly widget: "object";
                readonly fields: infer FS extends ReadonlyArray<CollectionField>;
              }
            ? CollectionItem<FS>
            : F extends {
                  readonly widget: "list";
                  readonly fields: infer FS extends
                    ReadonlyArray<CollectionField>;
                }
              ? ReadonlyArray<CollectionItem<FS>>
              : never;

type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type CollectionItem<FS extends ReadonlyArray<CollectionField>> =
  Prettify<
    {
      [F in Extract<
        FS[number],
        { readonly required: true }
      > as F["name"]]: FieldValue<F>;
    } & {
      [F in Exclude<
        FS[number],
        { readonly required: true }
      > as F["name"]]?: FieldValue<F>;
    }
  >;

export interface CollectionSchema<
  F extends ReadonlyArray<CollectionField> = ReadonlyArray<CollectionField>,
> {
  readonly name: string;
  readonly key?: string;
  readonly label?: string;
  readonly idField: F[number]["name"];
  readonly fields: F;
  readonly defaultItems?: ReadonlyArray<CollectionItem<F>>;
}

// `const F` means the host writes no `as const` and still gets literal types,
// so `options: ["a", "b"]` narrows to `"a" | "b"` without ceremony.
export const defineCollection = <const F extends ReadonlyArray<CollectionField>>(
  schema: CollectionSchema<F>,
): CollectionSchema<F> => schema;

/**
 * The registrar's view of a schema: item typing erased, everything else kept.
 * Every `CollectionSchema<F>` satisfies it structurally; it exists because a
 * heterogeneous array of schemas cannot keep each element's `F`.
 */
export interface AnyCollectionSchema {
  readonly name: string;
  readonly key?: string;
  readonly label?: string;
  readonly idField: string;
  readonly fields: ReadonlyArray<CollectionField>;
  readonly defaultItems?: ReadonlyArray<unknown>;
}

/** What ships to the browser: the schema minus `defaultItems` (§E). */
export type CollectionDeclaration = Omit<AnyCollectionSchema, "defaultItems">;

/**
 * One registered collection as the admin modal receives it: the lean
 * declaration plus the build-time document — the stored row if there is one,
 * the serialized seed if there is not. One copy of the item data, never both.
 */
export interface CollectionRegistration {
  readonly declaration: CollectionDeclaration;
  readonly staleDocument: string;
}

// ---------------------------------------------------------------------------
// The storage key. Exported beside the types so the modal, the reader and the
// host all compute it identically.

export const collectionKey = (
  schema: Pick<AnyCollectionSchema, "name" | "key">,
): string => schema.key ?? `collection.${schema.name}`;

// The item-prose key helper lives in its own module (see the comment there
// for the measured bundling reason) but stays part of this entry's surface.
export { collectionItemKey } from "./collectionItemKey.ts";

// ---------------------------------------------------------------------------
// The document format.

/**
 * The format version exists for one reason: the per-item-key storage mode kept
 * in reserve. A v1 reader that meets `v: 2` cannot guess at a later writer's
 * format, so it treats the document as unreadable rather than partly readable.
 */
export const COLLECTION_DOCUMENT_VERSION = 1;

export const serializeCollectionDocument = (
  items: ReadonlyArray<unknown>,
): string => JSON.stringify({ v: COLLECTION_DOCUMENT_VERSION, items });

export type CollectionDocumentReadResult =
  | { readonly ok: true; readonly items: ReadonlyArray<unknown> }
  | { readonly ok: false; readonly reason: string };

/**
 * The shape gate — rows 2 and 3 of the parse ladder, without item validation.
 * The modal reads through this too, so the build and the editing surface agree
 * on what counts as a readable document by construction.
 */
export const readCollectionDocument = (
  raw: string,
): CollectionDocumentReadResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "the stored value is not valid JSON" };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, reason: "the document is not an object" };
  }

  if (parsed["v"] !== COLLECTION_DOCUMENT_VERSION) {
    return {
      ok: false,
      reason: `unreadable format version ${JSON.stringify(parsed["v"])} — this reader understands v: ${COLLECTION_DOCUMENT_VERSION} only`,
    };
  }

  if (!Array.isArray(parsed["items"])) {
    return { ok: false, reason: `"items" is not an array` };
  }

  return { ok: true, items: parsed["items"] };
};

// ---------------------------------------------------------------------------
// Validation. Shared between `collection()` (which drops invalid items) and
// the modal (where it is display-only and never blocks a keystroke).

export interface CollectionItemProblem {
  /** Dotted field path, `""` when the item itself is the problem. */
  readonly path: string;
  readonly message: string;
}

export interface CollectionItemCheck {
  readonly valid: boolean;
  readonly problems: ReadonlyArray<CollectionItemProblem>;
  /**
   * The raw item restricted to declared fields — values kept verbatim, even
   * invalid ones. Absent when the raw value was not an object. Unknown keys
   * are dropped here, not rejected: removing a field from a schema must not
   * invalidate every item written before the removal. The dropped keys are
   * lost on the next save, which is the cost of not keeping them.
   */
  readonly item?: Record<string, unknown>;
}

export interface CollectionItemsValidation {
  readonly checks: ReadonlyArray<CollectionItemCheck>;
  /**
   * Developer-side problems — a malformed `pattern` disables that check and is
   * reported once, rather than invalidating the owner's data for a typo in
   * code.
   */
  readonly schemaProblems: ReadonlyArray<string>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const describe = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "an array" : `a ${typeof value}`;

export const validateCollectionItems = (
  schema: Pick<AnyCollectionSchema, "fields" | "idField">,
  values: ReadonlyArray<unknown>,
): CollectionItemsValidation => {
  const schemaProblems: string[] = [];

  // Compiled once per call, and a malformed pattern is remembered so it warns
  // once however many items carry the field.
  const patterns = new Map<string, RegExp | null>();
  const regexFor = (pattern: string): RegExp | null => {
    if (!patterns.has(pattern)) {
      try {
        patterns.set(pattern, new RegExp(pattern));
      } catch {
        patterns.set(pattern, null);
        schemaProblems.push(
          `pattern ${JSON.stringify(pattern)} is not a valid regular expression — the check is disabled`,
        );
      }
    }
    return patterns.get(pattern) ?? null;
  };

  const checkFields = (
    fields: ReadonlyArray<CollectionField>,
    value: Record<string, unknown>,
    prefix: string,
    problems: CollectionItemProblem[],
  ): Record<string, unknown> => {
    const restricted: Record<string, unknown> = {};

    for (const field of fields) {
      const path = prefix === "" ? field.name : `${prefix}.${field.name}`;
      const raw = value[field.name];

      // Absent means absent — the item is assembled by omission, never by
      // assigning undefined (§A; exactOptionalPropertyTypes describes the wire
      // format, not just the type system).
      if (raw === undefined) {
        if (field.required) {
          problems.push({ path, message: "required field is missing" });
        }
        continue;
      }

      switch (field.widget) {
        case "string":
        case "text": {
          if (typeof raw !== "string") {
            problems.push({
              path,
              message: `expected a string, got ${describe(raw)}`,
            });
          } else if (field.widget === "string" && field.pattern !== undefined) {
            const regex = regexFor(field.pattern);
            if (regex && !regex.test(raw)) {
              problems.push({
                path,
                message: `does not match pattern ${JSON.stringify(field.pattern)}`,
              });
            }
          }
          restricted[field.name] = raw;
          break;
        }
        case "number": {
          if (typeof raw !== "number" || !Number.isFinite(raw)) {
            problems.push({
              path,
              message: `expected a number, got ${describe(raw)}`,
            });
          } else {
            if (field.min !== undefined && raw < field.min) {
              problems.push({ path, message: `is below the minimum ${field.min}` });
            }
            if (field.max !== undefined && raw > field.max) {
              problems.push({ path, message: `is above the maximum ${field.max}` });
            }
          }
          restricted[field.name] = raw;
          break;
        }
        case "boolean": {
          if (typeof raw !== "boolean") {
            problems.push({
              path,
              message: `expected a boolean, got ${describe(raw)}`,
            });
          }
          restricted[field.name] = raw;
          break;
        }
        case "select": {
          if (typeof raw !== "string" || !field.options.includes(raw)) {
            problems.push({
              path,
              message: `is not one of the declared options (${field.options.join(", ")})`,
            });
          }
          restricted[field.name] = raw;
          break;
        }
        case "object": {
          if (isPlainObject(raw)) {
            restricted[field.name] = checkFields(field.fields, raw, path, problems);
          } else {
            problems.push({
              path,
              message: `expected an object, got ${describe(raw)}`,
            });
            restricted[field.name] = raw;
          }
          break;
        }
        case "list": {
          if (!Array.isArray(raw)) {
            problems.push({
              path,
              message: `expected an array, got ${describe(raw)}`,
            });
            restricted[field.name] = raw;
            break;
          }
          if (field.min !== undefined && raw.length < field.min) {
            problems.push({
              path,
              message: `has fewer than the minimum ${field.min} entries`,
            });
          }
          if (field.max !== undefined && raw.length > field.max) {
            problems.push({
              path,
              message: `has more than the maximum ${field.max} entries`,
            });
          }
          restricted[field.name] = raw.map((entry, index) => {
            const entryPath = `${path}[${index}]`;
            if (!isPlainObject(entry)) {
              problems.push({
                path: entryPath,
                message: `expected an object, got ${describe(entry)}`,
              });
              return entry;
            }
            return checkFields(field.fields, entry, entryPath, problems);
          });
          break;
        }
      }
    }

    return restricted;
  };

  const seenIds = new Set<string>();

  const checks = values.map((value): CollectionItemCheck => {
    if (!isPlainObject(value)) {
      return {
        valid: false,
        problems: [
          { path: "", message: `expected an object, got ${describe(value)}` },
        ],
      };
    }

    const problems: CollectionItemProblem[] = [];
    const item = checkFields(schema.fields, value, "", problems);

    // Ids derive prose keys, so two items sharing one would silently share
    // their prose: the duplicate invalidates the *later* item, first
    // occurrence winning.
    const id = value[schema.idField];
    if (typeof id !== "string" || id === "") {
      problems.push({
        path: schema.idField,
        message: "the id field must be a non-empty string",
      });
    } else if (seenIds.has(id)) {
      problems.push({
        path: schema.idField,
        message: `duplicate id ${JSON.stringify(id)} — the first occurrence wins`,
      });
    } else {
      seenIds.add(id);
    }

    return { valid: problems.length === 0, problems, item };
  });

  return { checks, schemaProblems };
};

// ---------------------------------------------------------------------------
// The parse ladder (§B).

export interface CollectionProblem {
  readonly message: string;
  readonly itemIndex?: number;
  readonly id?: string;
  readonly path?: string;
}

/** The stable, greppable warning shape: `palimp: collection "name" — ...`. */
export const formatCollectionProblem = (
  collectionName: string,
  problem: CollectionProblem,
): string => {
  const where = [
    problem.itemIndex !== undefined
      ? `item ${problem.itemIndex}${problem.id ? ` (${problem.id})` : ""}`
      : "",
    problem.path ? `field "${problem.path}"` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return `palimp: collection "${collectionName}" — ${where ? `${where}: ` : ""}${problem.message}`;
};

export interface ParsedCollectionDocument<
  F extends ReadonlyArray<CollectionField> = ReadonlyArray<CollectionField>,
> {
  readonly items: ReadonlyArray<CollectionItem<F>>;
  readonly problems: ReadonlyArray<CollectionProblem>;
}

/**
 * The parse ladder. `raw` is the stored value, or `null` when there is no row.
 *
 * 1. no row              → defaultItems ?? [], no warning
 * 2. JSON.parse throws   → defaultItems ?? [], loud
 * 3. wrong shape / wrong v → defaultItems ?? [], loud
 * 4. an item fails       → that item dropped, named; the rest survive
 * 5. every item fails    → [], NOT defaultItems — the document exists, so the
 *    owner has edited it; resurrecting the in-repo seed would bring back
 *    content they deleted, which is worse than an empty section.
 */
export const parseCollectionDocument = <
  const F extends ReadonlyArray<CollectionField>,
>(
  schema: CollectionSchema<F>,
  raw: string | null,
): ParsedCollectionDocument<F> => {
  const defaults = schema.defaultItems ?? [];

  if (raw === null) {
    return { items: defaults, problems: [] };
  }

  const document = readCollectionDocument(raw);
  if (!document.ok) {
    return { items: defaults, problems: [{ message: document.reason }] };
  }

  const { checks, schemaProblems } = validateCollectionItems(
    schema,
    document.items,
  );

  const problems: CollectionProblem[] = schemaProblems.map((message) => ({
    message,
  }));
  const items: CollectionItem<F>[] = [];

  checks.forEach((check, index) => {
    if (check.valid && check.item) {
      // The one cast in the feature, and the invariant that makes it true:
      // validateCollectionItems' coverage matches the FieldValue table row for
      // row. Extend one and you must extend the other.
      items.push(check.item as CollectionItem<F>);
      return;
    }

    const rawItem = document.items[index];
    const rawId =
      isPlainObject(rawItem) && typeof rawItem[schema.idField] === "string"
        ? (rawItem[schema.idField] as string)
        : undefined;

    for (const problem of check.problems) {
      problems.push({
        message: problem.message,
        itemIndex: index,
        ...(rawId ? { id: rawId } : {}),
        ...(problem.path ? { path: problem.path } : {}),
      });
    }
  });

  return { items, problems };
};
