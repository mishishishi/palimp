/**
 * The media seam. Optional and orthogonal to storage, like publishing — but
 * unlike publishing it is not orthogonal to the *backend*: media lives in the
 * same project, under the same key and the same signed-in session as the rows,
 * which is why the first-party implementations ride the backend providers
 * rather than getting a provider of their own.
 *
 * Design record: docs/plans/collections/03-media.md.
 */
export interface PalimpMediaAdapter {
  /**
   * Stores `file` at the relative `path` core computed (`mediaPath`). The
   * adapter prepends its own location — a bucket, a prefix — and never
   * overwrites: paths are unique by construction and the backend rules are
   * expected to permit create only, so a published page's bytes cannot be
   * replaced from a browser.
   */
  upload: (path: string, file: File) => Promise<PalimpMediaAsset>;
  /** Assets under a relative prefix — a collection's folder — newest first. */
  list: (prefix: string) => Promise<ReadonlyArray<PalimpMediaAsset>>;
  /**
   * The public URL of a stored relative path. Pure and synchronous: no
   * network, no SDK. Both first-party backends have a deterministic public-URL
   * format, which is what lets `upload` and `list` return URLs without extra
   * round trips — and lets a host compute one on the server, for a seed or an
   * `og:image`, from the same factory with nothing initialised.
   */
  url: (path: string) => string;
}

export interface PalimpMediaAsset {
  /** The relative path `upload` was given. */
  path: string;
  /** What the item stores: the public URL, not the path. */
  url: string;
  size?: number;
  contentType?: string;
}
