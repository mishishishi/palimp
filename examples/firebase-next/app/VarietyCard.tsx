"use client";

import { collectionItemKey, PalimpText } from "@palimp/fe-next";

// The host's card, a client component, written once and used on both sides:
// it renders the baked children (server-side, into the visitor's HTML) and
// the live admin map. The live map supplies `{ item }` and nothing else, so
// everything beyond `item` is optional — `staleBody` arrives only from the
// baked side, where p() resolved it against the stored rows.
//
// Note the bare collection *name* passed to collectionItemKey: importing the
// schema module here would ship it — defaultItems included — in the visitor's
// JS. The server side, already holding the schema, passes the schema itself.
interface Props {
  item: { id: string; name: string; featured?: boolean; photo?: string };
  staleBody?: string;
}

export const VarietyCard = ({ item, staleBody }: Props) => (
  <div style={styles.card}>
    {/*
      A plain <img>, not next/image: on a static export next/image needs
      `unoptimized` or a custom loader and buys nothing for a URL the build
      cannot process. The value is the file's public URL, so nothing resolves
      it — palimp is not in this render path at all.
    */}
    {item.photo ? (
      <img src={item.photo} alt={item.name} style={styles.cardImage} />
    ) : null}
    <h3 style={styles.cardTitle}>
      {item.name}
      {item.featured ? " ★" : ""}
    </h3>
    <p style={styles.cardBody}>
      <PalimpText
        messageKey={collectionItemKey("varieties", item.id, "body")}
        {...(staleBody !== undefined ? { staleValue: staleBody } : {})}
      />
    </p>
  </div>
);

const styles = {
  card: {
    background: "#fff8d6",
    border: "1px solid #ecdf8c",
    borderRadius: "10px",
    padding: "1.25rem 1.25rem 1.5rem",
  },
  cardImage: {
    display: "block",
    width: "100%",
    aspectRatio: "4 / 3",
    objectFit: "cover" as const,
    borderRadius: "6px",
    marginBottom: "0.75rem",
  },
  cardTitle: {
    margin: "0 0 0.5rem",
    fontSize: "1.15rem",
    fontWeight: 700,
  },
  cardBody: {
    margin: 0,
    fontSize: "0.97rem",
    lineHeight: 1.55,
    color: "#4a4a30",
  },
};
