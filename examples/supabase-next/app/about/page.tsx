import Link from "next/link";
import { palimp } from "../palimp.ts";

// A second route, so the editor's state can be driven across a navigation:
// one `next/link` (a soft navigation when the RSC payload loads) and one plain
// `<a>` (always a document load) back to the home page.
export default async function AboutPage() {
  const { p } = await palimp();

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      <nav style={{ display: "flex", gap: 16, marginBottom: 32 }}>
        <Link href="/">Home (next/link)</Link>
        <a href="/">Home (plain a)</a>
      </nav>

      <h1>{p("about.title", { defaultMessage: "About the grove" })}</h1>
      <p>
        {p("about.body", {
          defaultMessage:
            "Three generations, forty acres, and more bananas than anyone needs.",
        })}
      </p>
    </main>
  );
}
