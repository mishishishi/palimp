import { skipToken, useQuery } from "@tanstack/react-query";
import {
  Button,
  Empty,
  Form,
  Input,
  Space,
  Spin,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import { Images, Upload as UploadIcon, X } from "lucide-react";
import { use, useState, type ReactNode } from "react";
import type { ImageField } from "../../collections.ts";
import { PalimpMediaContext } from "../../PalimpMediaContext.ts";
import { mediaPath } from "../mediaPath.ts";
import { queryClient } from "../queryClient.ts";

interface Props {
  field: ImageField;
  value: unknown;
  /** The folder uploads land in, and the prefix the picker lists. */
  collectionName: string;
  // `undefined` means "remove the key", as everywhere else in the modal.
  onChange: (next: unknown) => void;
}

/**
 * The `image` widget: a preview, a URL input, Upload, Choose existing, Clear.
 *
 * The URL input is the whole widget when no `PalimpMediaAdapter` is mounted —
 * which is a supported mode, not a broken one: a repo path or an externally
 * managed file is typed in and works. Upload and Choose existing are what a
 * media adapter adds, and with none they render disabled saying so, the
 * Publish button's idiom.
 *
 * Nothing here verifies that the URL points at an image, or at anything. A
 * typed path is the host's business, and a fetch-to-validate would fail on a
 * site-relative path before the site is built. A broken URL shows the
 * browser's broken-image glyph, which is the honest render.
 *
 * Design record: docs/plans/collections/03-media.md §C.
 */
export const ImageControl = ({
  field,
  value,
  collectionName,
  onChange,
}: Props) => {
  const adapter = use(PalimpMediaContext);
  const [error, setError] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState(false);

  const url = typeof value === "string" ? value : "";
  const accept = field.accept ?? "image/*";

  // Lazy: the list request is only made once the picker is opened, and an
  // upload invalidates it so the new object is there when it reopens.
  // `skipToken` rather than a non-null assertion, as in `usePublishRun`.
  const assets = useQuery(
    {
      queryKey: mediaListQueryKey(collectionName),
      queryFn: adapter ? () => adapter.list(collectionName) : skipToken,
      enabled: picking,
    },
    queryClient,
  );

  const set = (next: string) => {
    setError(undefined);
    // Never "" — the `number` rule, and here also the difference between an
    // absent image and a broken one.
    onChange(next === "" ? undefined : next);
  };

  return (
    // A nested Form.Item so an upload failure lands where validation messages
    // land, under the field. The outer item's `help` carries the validator's
    // problems; this one carries the backend's own error text, verbatim.
    <Form.Item
      style={{ marginBottom: 0 }}
      {...(error !== undefined
        ? { validateStatus: "error" as const, help: error }
        : {})}
    >
      <Space orientation="vertical" size={8} style={{ width: "100%" }}>
        {url !== "" && (
          <img
            src={url}
            alt=""
            style={{
              maxHeight: 120,
              maxWidth: "100%",
              objectFit: "contain",
              display: "block",
              border: "1px solid var(--ant-color-border)",
              borderRadius: 6,
            }}
          />
        )}

        <Input
          value={url}
          readOnly={uploading}
          placeholder="https://… or /images/photo.jpg"
          onChange={(e) => set(e.target.value)}
        />

        <Space size={8} wrap>
          <NoProviderHint available={!!adapter}>
            <Upload
              showUploadList={false}
              accept={accept}
              disabled={!adapter || uploading}
              beforeUpload={(file) => {
                const reason = rejectReason(file, field, accept);
                if (reason !== undefined) {
                  setError(reason);
                  return Upload.LIST_IGNORE;
                }
                setError(undefined);
                return true;
              }}
              customRequest={({ file, onSuccess, onError }) => {
                // `file` is widened to Blob | string by rc-upload; only a real
                // File carries the name the path is built from.
                if (!adapter || !(file instanceof File)) return;

                setUploading(true);
                adapter
                  .upload(mediaPath(collectionName, file), file)
                  .then((asset) => {
                    onChange(asset.url);
                    void queryClient.invalidateQueries({
                      queryKey: mediaListQueryKey(collectionName),
                    });
                    onSuccess?.(asset);
                  })
                  .catch((cause: unknown) => {
                    // The backend's message verbatim: a bucket size limit or a
                    // MIME rejection arrives as a storage error, and paraphrasing
                    // it would hide which limit was hit.
                    setError(describeError(cause));
                    onError?.(
                      cause instanceof Error ? cause : new Error(String(cause)),
                    );
                  })
                  .finally(() => setUploading(false));
              }}
            >
              <Button
                size="small"
                icon={<UploadIcon size={14} strokeWidth={1.2} />}
                loading={uploading}
                disabled={!adapter}
              >
                Upload
              </Button>
            </Upload>
          </NoProviderHint>

          <NoProviderHint available={!!adapter}>
            <Button
              size="small"
              icon={<Images size={14} strokeWidth={1.2} />}
              disabled={!adapter}
              onClick={() => setPicking((open) => !open)}
            >
              Choose existing
            </Button>
          </NoProviderHint>

          <Button
            size="small"
            type="text"
            icon={<X size={14} strokeWidth={1.2} />}
            disabled={url === "" || uploading}
            onClick={() => set("")}
          >
            Clear
          </Button>
        </Space>

        {picking && adapter && (
          <div style={pickerStyle}>
            {assets.isPending ? (
              <Spin size="small" />
            ) : assets.error ? (
              <Typography.Text type="danger">
                {describeError(assets.error)}
              </Typography.Text>
            ) : assets.data && assets.data.length > 0 ? (
              assets.data.map((asset) => (
                <button
                  key={asset.path}
                  // Explicit: the modal's controls sit inside an antd `Form`,
                  // and a bare button defaults to submit.
                  type="button"
                  title={asset.path}
                  style={thumbnailStyle}
                  onClick={() => {
                    set(asset.url);
                    setPicking(false);
                  }}
                >
                  <img src={asset.url} alt="" style={thumbnailImageStyle} />
                </button>
              ))
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Nothing uploaded for this collection yet."
              />
            )}
          </div>
        )}
      </Space>
    </Form.Item>
  );
};

export const mediaListQueryKey = (collectionName: string) =>
  ["palimp:media", collectionName] as const;

/**
 * A disabled antd Button swallows pointer events, so a Tooltip on it never
 * fires — hence the wrapping span. Rendered only when there is something to
 * say: with an adapter mounted the buttons are plain.
 */
const NoProviderHint = ({
  available,
  children,
}: {
  available: boolean;
  children: ReactNode;
}) =>
  available ? (
    children
  ) : (
    <Tooltip title="No media provider">
      <span style={{ display: "inline-block", cursor: "not-allowed" }}>
        {children}
      </span>
    </Tooltip>
  );

/**
 * The gates the widget can apply before any request is made. The bucket's own
 * limits are the backstop and produce the message under the field instead.
 */
const rejectReason = (
  file: File,
  field: ImageField,
  accept: string,
): string | undefined => {
  if (field.maxBytes !== undefined && file.size > field.maxBytes) {
    return `${file.name} is ${formatBytes(file.size)}; the limit for this field is ${formatBytes(field.maxBytes)}.`;
  }
  // `file.type` is empty for some files on some platforms; an unknown type is
  // not evidence of a wrong one, so it passes and the bucket decides.
  if (file.type !== "" && !acceptsType(accept, file.type)) {
    return `${file.name} is ${file.type}; this field accepts ${accept}.`;
  }
  return undefined;
};

/**
 * A subset of the HTML `accept` grammar: exact types and `type/*` wildcards.
 * Extension entries (`.jpg`) are skipped rather than matched — the check is a
 * courtesy before the request, and a file the browser typed as something else
 * is the bucket's call, not ours.
 */
const acceptsType = (accept: string, type: string): boolean => {
  const wanted = type.toLowerCase();

  return accept
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "" && !entry.startsWith("."))
    .some((entry) =>
      entry === "*" || entry === "*/*"
        ? true
        : entry.endsWith("/*")
          ? wanted.startsWith(entry.slice(0, -1))
          : entry === wanted,
    );
};

const formatBytes = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const describeError = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : typeof cause === "string"
      ? cause
      : "The upload failed.";

const pickerStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  padding: 8,
  maxHeight: 200,
  overflowY: "auto",
  border: "1px solid var(--ant-color-border)",
  borderRadius: 8,
};

const thumbnailStyle: React.CSSProperties = {
  padding: 0,
  border: "1px solid var(--ant-color-border)",
  borderRadius: 6,
  background: "none",
  cursor: "pointer",
  lineHeight: 0,
};

const thumbnailImageStyle: React.CSSProperties = {
  width: 72,
  height: 72,
  objectFit: "cover",
  borderRadius: 5,
  display: "block",
};
