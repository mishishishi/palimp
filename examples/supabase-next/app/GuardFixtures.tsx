"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Manual fixtures for the interaction guard (docs/plans/interactive-ancestors.md §E).
 * Each wraps a `p()` editor — passed in as children from the server component —
 * in a different interactive ancestor. As admin, each editor should focus and
 * type without triggering its ancestor; in preview mode every ancestor must
 * work normally again.
 */

export const FixtureAnchor = ({ children }: { children: ReactNode }) => (
  <p style={row}>
    <a href="https://example.com/plain-anchor">{children}</a>
    <em style={hint}> — click, drag-select, and middle-click must not open it</em>
  </p>
);

export const FixtureLink = ({ children }: { children: ReactNode }) => (
  <p style={row}>
    <Link href="/login">{children}</Link>
    <em style={hint}> — next/link; must not navigate to /login</em>
  </p>
);

export const FixtureSummary = ({ children }: { children: ReactNode }) => (
  <details style={row}>
    <summary>{children}</summary>
    If this text is visible, a click on the editor toggled the ancestor.
  </details>
);

export const FixtureForm = ({ children }: { children: ReactNode }) => {
  const [submits, setSubmits] = useState(0);

  return (
    <form
      style={row}
      onSubmit={(e) => {
        e.preventDefault();
        setSubmits((n) => n + 1);
      }}
    >
      {children}
      <button type="submit">Submit</button>
      <button type="reset">Reset</button>
      <em style={hint}>
        {" "}
        — Enter in the editor must not submit ({submits} submits); Reset must
        not clear a pending edit
      </em>
    </form>
  );
};

export const FixtureNativeMousedown = ({
  children,
}: {
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null!);
  const [hits, setHits] = useState(0);

  // Attached natively, not through React — the case a synthetic
  // stopPropagation() can never reach.
  useEffect(() => {
    const el = ref.current;
    const onMousedown = () => {
      console.log("[guard-fixture] native mousedown reached the ancestor");
      setHits((n) => n + 1);
    };
    el.addEventListener("mousedown", onMousedown);
    return () => el.removeEventListener("mousedown", onMousedown);
  }, []);

  return (
    <div ref={ref} style={row}>
      {children}
      <em style={hint}>
        {" "}
        — native mousedown listener; must stay at 0 hits ({hits} hits)
      </em>
    </div>
  );
};

export const FixtureHotkeyProbe = () => {
  const [last, setLast] = useState("none yet");

  // A document-level hotkey, the way hosts write them. Keys typed into any
  // editor on the page must never show up here.
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "/" || e.key === "Escape") {
        setLast(`"${e.key}" at ${new Date().toLocaleTimeString()}`);
      }
    };
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, []);

  return (
    <p style={row}>
      Document hotkey probe (<code>/</code> and <code>Escape</code>): last hit{" "}
      {last}
      <em style={hint}>
        {" "}
        — typing them in an editor must not update this; typing them anywhere
        else must
      </em>
    </p>
  );
};

const row: React.CSSProperties = {
  margin: "0.75rem 0",
};

const hint: React.CSSProperties = {
  color: "#8a7a3d",
  fontSize: "0.85rem",
};
