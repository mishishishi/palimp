/**
 * The relative object path an upload gets, computed in core so every adapter
 * receives the same shape and none has to invent one:
 *
 *     <collection>/<yyyymmddThhmmss>-<4 random base36>-<sanitised filename>
 *     varieties/20260831T101500-k9pq-gros-michel.jpg
 *
 * Admin-side: only the image widget calls this. A third-party adapter is
 * handed the path and stores it under its own bucket or prefix.
 *
 * The timestamp does two jobs at once. It makes the path unique without a
 * lookup — no exists-check, no 409 branch in any adapter — and it makes
 * "sort by name" mean "sort by time" on every backend, which is how the
 * widget's picker lists newest first with no metadata calls. The random
 * suffix covers two uploads inside one second.
 *
 * Nothing is ever overwritten, which is what makes a stored URL stable for
 * the life of the deploy that baked it (and the year-long cache header
 * correct). Content-addressed paths were the alternative and lost: they buy
 * idempotent re-uploads and lose the ordering.
 */
export const mediaPath = (
  collectionName: string,
  file: Pick<File, "name">,
): string =>
  `${collectionName}/${utcStamp(new Date())}-${randomSuffix()}-${sanitiseFilename(file.name)}`;

/** `2026-08-31T10:15:00.123Z` → `20260831T101500`. */
const utcStamp = (at: Date): string =>
  at.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");

const randomSuffix = (): string =>
  Math.random().toString(36).slice(2, 6).padEnd(4, "0");

const MAX_FILENAME = 64;

/**
 * Lowercased and reduced to `[a-z0-9._-]`, runs of the replacement collapsed,
 * capped at 64 characters with the extension kept — a long stem loses its
 * middle, never its `.jpg`. The result is only ever a *name*: the uniqueness
 * lives in the timestamp, so two files called the same thing are two objects.
 */
const sanitiseFilename = (name: string): string => {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-");

  const dot = clean.lastIndexOf(".");
  // A leading dot is not an extension, it is a dotfile.
  const ext = dot > 0 ? clean.slice(dot) : "";
  const stem = dot > 0 ? clean.slice(0, dot) : clean;

  if (stem === "" && ext === "") return "file";
  if (ext.length >= MAX_FILENAME) return ext.slice(0, MAX_FILENAME);

  return `${stem.slice(0, MAX_FILENAME - ext.length)}${ext}` || "file";
};
