import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Switch,
  Tabs,
  Tooltip,
  Typography,
} from "antd";
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import { use, useMemo, useState } from "react";
import {
  readCollectionDocument,
  serializeCollectionDocument,
  validateCollectionItems,
  type CollectionField,
  type CollectionItemProblem,
} from "../../collections.ts";
import { PalimpClientBackendContext } from "../../PalimpClientBackendContext.ts";
import {
  useCollections,
  type RegisteredCollection,
} from "../collectionsStore.ts";
import { editQueryKey, editsStore, useEdit } from "../editsStore.ts";
import { queryClient } from "../queryClient.ts";
import { ImageControl } from "./ImageControl.tsx";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * The structured editor for registered collections. Unlike the Fields modal,
 * nothing in here is an EditComponent: the controls are ordinary antd inputs,
 * so nothing carries `[data-palimp-editor]` and the interaction guard never
 * sees their events — Escape closes this modal normally.
 *
 * There is deliberately no Save button. There is exactly one save in palimp
 * and it lives in the drawer; a second commit affordance here would create a
 * place where an owner can believe their work is committed when it is only
 * drafted. Every change re-serializes the whole document into editsStore.
 */
export const CollectionsModal = ({ open, onClose }: Props) => {
  const collections = useCollections();

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Collections"
      width={880}
      footer={
        <Button onClick={onClose} type="primary">
          Close
        </Button>
      }
    >
      {collections.length === 0 ? (
        <Empty description="No collections are declared on this page." />
      ) : (
        // The tab strip is shown even with one collection — a stable layout
        // beats a conditional one, and the strip is where the dirty dot lives.
        <Tabs
          items={collections.map((collection) => ({
            key: collection.key,
            label: <CollectionTabLabel collection={collection} />,
            children: <CollectionEditor collection={collection} />,
          }))}
        />
      )}
    </Modal>
  );
};

const CollectionTabLabel = ({
  collection,
}: {
  collection: RegisteredCollection;
}) => {
  const pending = useEdit(collection.key);

  return (
    <Badge dot={pending !== undefined} offset={[6, 0]} color="blue">
      {collection.declaration.label ?? collection.declaration.name}
    </Badge>
  );
};

const CollectionEditor = ({
  collection,
}: {
  collection: RegisteredCollection;
}) => {
  const { key, declaration, staleDocument } = collection;
  const backend = use(PalimpClientBackendContext);

  // The same query key an EditComponent would use, so useSaveButton's existing
  // invalidation loop refreshes this document after a save with no change to
  // the save path at all.
  const { data } = useQuery(
    {
      queryKey: editQueryKey(key),
      queryFn: () => backend.getKey(key),
    },
    queryClient,
  );
  const pending = useEdit(key);

  // EditComponent's `pending ?? data ?? staleValue` chain, one level up and
  // with the same three meanings.
  const fetched = data ?? staleDocument;
  const raw = pending ?? fetched;

  const workingDocument = useMemo(() => readCollectionDocument(raw), [raw]);
  const rawItems = workingDocument.ok ? workingDocument.items : emptyItems;

  const validation = useMemo(
    () => validateCollectionItems(declaration, rawItems),
    [declaration, rawItems],
  );

  // The working set is each item restricted to declared fields (values kept
  // verbatim, invalid ones included — validation is display-only here). The
  // restriction is what makes unknown keys "lost on the next save".
  const workingItems = useMemo(
    () => rawItems.map((item, i) => validation.checks[i]?.item ?? item),
    [rawItems, validation],
  );

  // Per-item dirty marks compare against the fetched document by id, so a
  // pure reorder dirties the tab dot but not every row.
  const baselineSignatures = useMemo(() => {
    const map = new Map<string, string>();
    const baseline = readCollectionDocument(fetched);
    if (!baseline.ok) return map;

    const checks = validateCollectionItems(declaration, baseline.items).checks;
    baseline.items.forEach((_, i) => {
      const restricted = checks[i]?.item;
      if (!restricted) return;
      const id = restricted[declaration.idField];
      if (typeof id === "string" && id !== "" && !map.has(id)) {
        map.set(id, JSON.stringify(restricted));
      }
    });
    return map;
  }, [declaration, fetched]);

  const isDirtyItem = (item: unknown): boolean => {
    if (pending === undefined) return false;
    if (!isPlainObject(item)) return true;
    const id = item[declaration.idField];
    if (typeof id !== "string" || id === "") return true;
    return baselineSignatures.get(id) !== JSON.stringify(item);
  };

  const [selected, setSelected] = useState<number | null>(null);
  const selectedIndex =
    selected !== null && selected < workingItems.length
      ? selected
      : workingItems.length > 0
        ? 0
        : null;

  const commit = (next: ReadonlyArray<unknown>) =>
    editsStore.set(key, serializeCollectionDocument(next));

  const addItem = () => {
    const next = [...workingItems, newItem(declaration.fields)];
    commit(next);
    setSelected(next.length - 1);
  };

  const duplicateItem = (index: number) => {
    const next = [...workingItems];
    next.splice(index + 1, 0, structuredClone(workingItems[index]));
    commit(next);
    setSelected(index + 1);
  };

  const deleteItem = (index: number) => {
    const next = workingItems.filter((_, i) => i !== index);
    commit(next);
    setSelected(next.length === 0 ? null : Math.min(index, next.length - 1));
  };

  const moveItem = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= workingItems.length) return;
    const next = [...workingItems];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    commit(next);
    // Selection follows the item, not the position.
    if (selectedIndex === index) setSelected(target);
    else if (selectedIndex === target) setSelected(index);
  };

  const selectedItem =
    selectedIndex === null ? undefined : workingItems[selectedIndex];
  const selectedProblems =
    selectedIndex === null
      ? emptyProblems
      : (validation.checks[selectedIndex]?.problems ?? emptyProblems);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {!workingDocument.ok && (
        <Alert
          type="warning"
          showIcon
          message="The stored document is unreadable."
          description={`${workingDocument.reason} Editing starts from an empty list; Save will overwrite the stored value.`}
        />
      )}

      {validation.schemaProblems.map((problem) => (
        <Alert key={problem} type="warning" showIcon message={problem} />
      ))}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {/*
          One call — editsStore.delete(key) — restores the fetched document.
          It gets a confirm because it discards every item's changes at once;
          it is also the only escape hatch, since drafts are per keystroke and
          there is no per-item cancel.
        */}
        <Popconfirm
          title="Discard changes"
          description="Every unsaved change to this collection is discarded at once."
          okText="Discard"
          okButtonProps={{ danger: true }}
          onConfirm={() => editsStore.delete(key)}
        >
          <Button size="small" danger disabled={pending === undefined}>
            Discard changes
          </Button>
        </Popconfirm>
      </div>

      <div style={{ display: "flex", gap: 16, maxHeight: "70vh" }}>
        <div
          style={{
            width: 240,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            {workingItems.map((item, index) => {
              const check = validation.checks[index];
              const id = readId(item, declaration.idField);
              const dirty = isDirtyItem(item);

              return (
                <div
                  key={index}
                  onClick={() => setSelected(index)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 8px",
                    borderRadius: 6,
                    cursor: "pointer",
                    background:
                      selectedIndex === index
                        ? "var(--ant-color-primary-bg)"
                        : undefined,
                  }}
                >
                  <Typography.Text
                    ellipsis
                    style={{
                      flex: 1,
                      // The same cyan idiom EditComponent uses for `touched`.
                      boxShadow: dirty ? "0px 0px 2px 1px cyan" : undefined,
                    }}
                  >
                    {id ?? `#${index}`}
                  </Typography.Text>

                  {check && !check.valid && (
                    <Tooltip
                      title={check.problems
                        .map((p) => (p.path ? `${p.path}: ${p.message}` : p.message))
                        .join("; ")}
                    >
                      <Badge status="error" />
                    </Tooltip>
                  )}

                  <Button
                    size="small"
                    type="text"
                    icon={<Copy size={14} strokeWidth={1.2} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateItem(index);
                    }}
                  />
                  <Button
                    size="small"
                    type="text"
                    icon={<Trash2 size={14} strokeWidth={1.2} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteItem(index);
                    }}
                  />
                  <Button
                    size="small"
                    type="text"
                    disabled={index === 0}
                    icon={<ChevronUp size={14} strokeWidth={1.2} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveItem(index, -1);
                    }}
                  />
                  <Button
                    size="small"
                    type="text"
                    disabled={index === workingItems.length - 1}
                    icon={<ChevronDown size={14} strokeWidth={1.2} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveItem(index, 1);
                    }}
                  />
                </div>
              );
            })}
          </div>

          <Button block icon={<Plus size={16} strokeWidth={1.2} />} onClick={addItem}>
            Add item
          </Button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingRight: 8 }}>
          {selectedIndex === null || selectedItem === undefined ? (
            <Empty description="No items." />
          ) : !isPlainObject(selectedItem) ? (
            <Alert
              type="warning"
              showIcon
              message="This item is not an object and cannot be edited field by field."
              description="Delete it from the list, or fix the stored document."
            />
          ) : (
            // Keyed by selection so switching items remounts the controls.
            // Everything they show comes from props, so the only thing this
            // resets is transient control state — and one item's failed-upload
            // message must not sit under the next item's Photo field.
            <Form layout="vertical" key={selectedIndex}>
              <FieldsEditor
                fields={declaration.fields}
                value={selectedItem}
                prefix=""
                collectionName={declaration.name}
                problems={selectedProblems}
                onChange={(next) => {
                  const nextItems = [...workingItems];
                  nextItems[selectedIndex] = next;
                  commit(nextItems);
                }}
              />
            </Form>
          )}
        </div>
      </div>
    </div>
  );
};

const FieldsEditor = ({
  fields,
  value,
  prefix,
  collectionName,
  problems,
  onChange,
}: {
  fields: ReadonlyArray<CollectionField>;
  value: Record<string, unknown>;
  prefix: string;
  /**
   * Threaded down unchanged through every level of the recursion: it is the
   * folder uploads land in, and an image nested in a `list` belongs to the
   * same collection as one at the top.
   */
  collectionName: string;
  problems: ReadonlyArray<CollectionItemProblem>;
  onChange: (next: Record<string, unknown>) => void;
}) => (
  <>
    {fields.map((field) => {
      const path = prefix === "" ? field.name : `${prefix}.${field.name}`;
      const fieldProblems = problems.filter((p) => p.path === path);

      // Clearing a control removes the key from the item rather than storing
      // "" or null (§A: the modal must delete, never blank).
      const set = (next: unknown) => {
        if (next === undefined) {
          const { [field.name]: _removed, ...rest } = value;
          onChange(rest);
        } else {
          onChange({ ...value, [field.name]: next });
        }
      };

      return (
        <Form.Item
          key={field.name}
          label={field.label ?? field.name}
          style={{ marginBottom: 12 }}
          {...(fieldProblems.length > 0
            ? {
                validateStatus: "error" as const,
                help: fieldProblems.map((p) => p.message).join("; "),
              }
            : {})}
        >
          <FieldControl
            field={field}
            value={value[field.name]}
            path={path}
            collectionName={collectionName}
            problems={problems}
            onChange={set}
          />
        </Form.Item>
      );
    })}
  </>
);

const FieldControl = ({
  field,
  value,
  path,
  collectionName,
  problems,
  onChange,
}: {
  field: CollectionField;
  value: unknown;
  path: string;
  collectionName: string;
  problems: ReadonlyArray<CollectionItemProblem>;
  // `undefined` means "remove the key".
  onChange: (next: unknown) => void;
}) => {
  switch (field.widget) {
    case "string":
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(e) =>
            onChange(
              e.target.value === "" && !field.required
                ? undefined
                : e.target.value,
            )
          }
        />
      );
    case "text":
      return (
        <Input.TextArea
          autoSize
          value={typeof value === "string" ? value : ""}
          onChange={(e) =>
            onChange(
              e.target.value === "" && !field.required
                ? undefined
                : e.target.value,
            )
          }
        />
      );
    case "number":
      // Clearing deletes the key — never null (§A). min/max are deliberately
      // not passed to the control: validation marks fields, it never blocks or
      // clamps a keystroke.
      return (
        <InputNumber
          style={{ width: "100%" }}
          value={typeof value === "number" ? value : null}
          onChange={(v) => onChange(typeof v === "number" ? v : undefined)}
        />
      );
    case "boolean":
      // A Switch has no empty state: once touched, an optional boolean is true
      // or false forever. Documented in the core README quirks.
      return <Switch checked={value === true} onChange={(c) => onChange(c)} />;
    case "select":
      return (
        <Select
          style={{ width: "100%" }}
          allowClear={!field.required}
          value={typeof value === "string" ? value : undefined!}
          options={field.options.map((option) => ({ value: option }))}
          onChange={(v) => onChange(v)}
        />
      );
    case "image":
      return (
        <ImageControl
          field={field}
          value={value}
          collectionName={collectionName}
          onChange={onChange}
        />
      );
    case "object": {
      const child = isPlainObject(value) ? value : {};
      return (
        <div style={groupStyle}>
          <FieldsEditor
            fields={field.fields}
            value={child}
            prefix={path}
            collectionName={collectionName}
            problems={problems}
            onChange={onChange}
          />
        </div>
      );
    }
    case "list": {
      const entries = Array.isArray(value) ? value : [];
      return (
        <div style={groupStyle}>
          {entries.map((entry, index) => {
            const entryPath = `${path}[${index}]`;
            const entryProblems = problems.filter((p) => p.path === entryPath);

            return (
              <div key={index} style={listEntryStyle}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    marginBottom: 8,
                  }}
                >
                  <Typography.Text type="secondary" style={{ flex: 1, fontSize: 12 }}>
                    #{index}
                  </Typography.Text>
                  <Button
                    size="small"
                    type="text"
                    disabled={index === 0}
                    icon={<ChevronUp size={14} strokeWidth={1.2} />}
                    onClick={() => {
                      const next = [...entries];
                      next[index] = entries[index - 1];
                      next[index - 1] = entries[index];
                      onChange(next);
                    }}
                  />
                  <Button
                    size="small"
                    type="text"
                    disabled={index === entries.length - 1}
                    icon={<ChevronDown size={14} strokeWidth={1.2} />}
                    onClick={() => {
                      const next = [...entries];
                      next[index] = entries[index + 1];
                      next[index + 1] = entries[index];
                      onChange(next);
                    }}
                  />
                  <Button
                    size="small"
                    type="text"
                    icon={<Trash2 size={14} strokeWidth={1.2} />}
                    onClick={() =>
                      onChange(entries.filter((_, i) => i !== index))
                    }
                  />
                </div>

                {entryProblems.length > 0 && (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 8 }}
                    message={entryProblems.map((p) => p.message).join("; ")}
                  />
                )}

                <FieldsEditor
                  fields={field.fields}
                  value={isPlainObject(entry) ? entry : {}}
                  prefix={entryPath}
                  collectionName={collectionName}
                  problems={problems}
                  onChange={(next) => {
                    const copy = [...entries];
                    copy[index] = next;
                    onChange(copy);
                  }}
                />
              </div>
            );
          })}

          <Button
            block
            size="small"
            icon={<Plus size={14} strokeWidth={1.2} />}
            onClick={() => onChange([...entries, newItem(field.fields)])}
          >
            Add
          </Button>
        </div>
      );
    }
  }
};

/**
 * A fresh item: declared defaults applied; a required string starts at "" (the
 * same value clearing it produces), a required boolean at false (a Switch has
 * to show something), a required object/list at its empty shape. A required
 * number or select stays absent — inventing a value would be the coercion §B
 * rejects; the validity mark says what is missing.
 */
const newItem = (
  fields: ReadonlyArray<CollectionField>,
): Record<string, unknown> => {
  const item: Record<string, unknown> = {};

  for (const field of fields) {
    switch (field.widget) {
      case "string":
      case "text":
        if (field.default !== undefined) item[field.name] = field.default;
        else if (field.required) item[field.name] = "";
        break;
      case "number":
      case "select":
      // `image` sides with these, not with `string`: a required image starts
      // absent and the validity mark says so. Seeding "" would be a broken
      // image, which is worse than a missing one.
      case "image":
        if (field.default !== undefined) item[field.name] = field.default;
        break;
      case "boolean":
        if (field.default !== undefined) item[field.name] = field.default;
        else if (field.required) item[field.name] = false;
        break;
      case "object":
        if (field.required) item[field.name] = newItem(field.fields);
        break;
      case "list":
        if (field.required) item[field.name] = [];
        break;
    }
  }

  return item;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readId = (item: unknown, idField: string): string | undefined => {
  if (!isPlainObject(item)) return undefined;
  const id = item[idField];
  return typeof id === "string" && id !== "" ? id : undefined;
};

const emptyItems: ReadonlyArray<unknown> = [];
const emptyProblems: ReadonlyArray<CollectionItemProblem> = [];

const groupStyle: React.CSSProperties = {
  border: "1px solid var(--ant-color-border)",
  borderRadius: 8,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const listEntryStyle: React.CSSProperties = {
  border: "1px dashed var(--ant-color-border)",
  borderRadius: 8,
  padding: 8,
};
