import { PalimpFields } from "@palimp/fe-next";
import { type Metadata } from "next";
import { palimp } from "./palimp.ts";
import { asString, seoFields } from "./seo.ts";

export const generateMetadata = async (): Promise<Metadata> => {
  const { p } = await palimp();
  const [title, description] = seoFields;

  return {
    title: asString(p, title),
    description: asString(p, description),
  };
};

export default async function Page() {
  const { p } = await palimp();

  return (
    <main style={styles.page}>
      <header style={styles.nav}>
        <span style={styles.brand}>
          {p("nav.brand", { defaultMessage: "Sunny Grove Bananas" })}
        </span>
        <nav style={styles.navLinks}>
          <a href="#about" style={styles.navLink}>
            {p("nav.about", { defaultMessage: "About" })}
          </a>
          <a href="#varieties" style={styles.navLink}>
            {p("nav.varieties", { defaultMessage: "Our Bananas" })}
          </a>
          <a href="#farming" style={styles.navLink}>
            {p("nav.farming", { defaultMessage: "Farming" })}
          </a>
          <a href="#visit" style={styles.navLink}>
            {p("nav.visit", { defaultMessage: "Visit" })}
          </a>
        </nav>
      </header>

      <section style={styles.hero}>
        <p style={styles.eyebrow}>
          {p("hero.eyebrow", {
            defaultMessage: "Family-run since 1978",
          })}
        </p>
        <h1 style={styles.heroTitle}>
          {p("hero.title", {
            defaultMessage: "Bananas grown slowly, the way they should be.",
          })}
        </h1>
        <p style={styles.heroLead}>
          {p("hero.lead", {
            defaultMessage:
              "We're a small independent farm on the slopes of the Sierra Verde, producing rare and heritage banana varieties for chefs, markets, and curious neighbours.",
          })}
        </p>
      </section>

      <section id="about" style={styles.section}>
        <h2 style={styles.sectionTitle}>
          {p("about.title", { defaultMessage: "Our story" })}
        </h2>
        <p style={styles.body}>
          {p("about.body", {
            defaultMessage:
              "Three generations of the Alvarez family have tended these eighteen hectares of volcanic soil. We don't ship overseas and we don't grow Cavendish — instead we cultivate Gros Michel, Lady Finger, Manzano, and Red Dacca varieties that supermarkets gave up on decades ago. Every bunch is cut by hand and ripened on the stem.",
          })}
        </p>
      </section>

      <section id="varieties" style={styles.section}>
        <h2 style={styles.sectionTitle}>
          {p("varieties.title", { defaultMessage: "What we grow" })}
        </h2>
        <div style={styles.cards}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>
              {p("varieties.one.name", { defaultMessage: "Gros Michel" })}
            </h3>
            <p style={styles.cardBody}>
              {p("varieties.one.body", {
                defaultMessage:
                  "The pre-1950s 'original' banana. Creamier, sweeter, and more aromatic than what you'll find at the supermarket.",
              })}
            </p>
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>
              {p("varieties.two.name", { defaultMessage: "Manzano" })}
            </h3>
            <p style={styles.cardBody}>
              {p("varieties.two.body", {
                defaultMessage:
                  "Small, firm, and faintly apple-flavoured. A favourite of local bakers and cocktail bars.",
              })}
            </p>
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>
              {p("varieties.three.name", { defaultMessage: "Red Dacca" })}
            </h3>
            <p style={styles.cardBody}>
              {p("varieties.three.body", {
                defaultMessage:
                  "Dense, raspberry-tinted flesh under a deep maroon skin. Wonderful grilled or eaten ripe with sharp cheese.",
              })}
            </p>
          </div>
        </div>
      </section>

      <section id="farming" style={styles.section}>
        <h2 style={styles.sectionTitle}>
          {p("farming.title", { defaultMessage: "How we farm" })}
        </h2>
        <p style={styles.body}>
          {p("farming.body", {
            defaultMessage:
              "No synthetic pesticides, no plastic bagging, no ripening gas. We intercrop with cacao and coffee for shade, compost every scrap of plant matter back into the soil, and let the wild parrots have their share. It's slower, smaller-yield growing — but the bananas taste like bananas.",
          })}
        </p>
      </section>

      <section id="visit" style={styles.section}>
        <h2 style={styles.sectionTitle}>
          {p("visit.title", { defaultMessage: "Come visit" })}
        </h2>
        <p style={styles.body}>
          {p("visit.body", {
            defaultMessage:
              "The farm gate is open to visitors on Saturdays from 9 to 1. We run a short tour at 10am and sell fresh bunches, dried banana flour, and homemade vinegar from the shed.",
          })}
        </p>
        <dl style={styles.details}>
          <div style={styles.detailRow}>
            <dt style={styles.detailKey}>
              {p("visit.address.label", { defaultMessage: "Address" })}
            </dt>
            <dd style={styles.detailValue}>
              {p("visit.address.value", {
                defaultMessage: "Camino del Plátano 12, Sierra Verde",
              })}
            </dd>
          </div>
          <div style={styles.detailRow}>
            <dt style={styles.detailKey}>
              {p("visit.email.label", { defaultMessage: "Email" })}
            </dt>
            <dd style={styles.detailValue}>
              {p("visit.email.value", {
                defaultMessage: "hello@sunnygrovebananas.example",
              })}
            </dd>
          </div>
          <div style={styles.detailRow}>
            <dt style={styles.detailKey}>
              {p("visit.phone.label", { defaultMessage: "Phone" })}
            </dt>
            <dd style={styles.detailValue}>
              {p("visit.phone.value", { defaultMessage: "+00 555 0142" })}
            </dd>
          </div>
        </dl>
      </section>

      {/*
        Renders nothing. It declares the two metadata keys above so they get an
        editor in the Devtools "Fields" modal — an `asString` key has no element
        on the page, so there is nowhere to put an inline one.
      */}
      <PalimpFields group="SEO" fields={seoFields} />

      <footer style={styles.footer}>
        <span>
          {p("footer.copy", {
            defaultMessage: "© Sunny Grove Bananas. Grown with patience.",
          })}
        </span>
      </footer>
    </main>
  );
}

const styles = {
  page: {
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    color: "#2b2b1f",
    background: "#fffdf3",
    margin: 0,
    minHeight: "100vh",
  },
  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1.25rem 2rem",
    borderBottom: "1px solid #e8e3c8",
  },
  brand: {
    fontWeight: 700,
    letterSpacing: "0.02em",
  },
  navLinks: {
    display: "flex",
    gap: "1.5rem",
  },
  navLink: {
    color: "#5a5a3d",
    textDecoration: "none",
    fontSize: "0.95rem",
  },
  hero: {
    padding: "5rem 2rem 4rem",
    maxWidth: "820px",
    margin: "0 auto",
    textAlign: "center" as const,
  },
  eyebrow: {
    textTransform: "uppercase" as const,
    fontSize: "0.8rem",
    letterSpacing: "0.18em",
    color: "#8a7a3d",
    margin: 0,
  },
  heroTitle: {
    fontSize: "3rem",
    lineHeight: 1.1,
    margin: "1rem 0 1.5rem",
    fontWeight: 700,
  },
  heroLead: {
    fontSize: "1.2rem",
    lineHeight: 1.55,
    color: "#5a5a3d",
    margin: 0,
  },
  section: {
    maxWidth: "820px",
    margin: "0 auto",
    padding: "3rem 2rem",
    borderTop: "1px solid #e8e3c8",
  },
  sectionTitle: {
    fontSize: "1.8rem",
    margin: "0 0 1rem",
    fontWeight: 700,
  },
  body: {
    fontSize: "1.05rem",
    lineHeight: 1.65,
    color: "#3d3d28",
    margin: 0,
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "1.25rem",
    marginTop: "1.5rem",
  },
  card: {
    background: "#fff8d6",
    border: "1px solid #ecdf8c",
    borderRadius: "10px",
    padding: "1.25rem 1.25rem 1.5rem",
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
  details: {
    marginTop: "1.5rem",
    display: "grid",
    gap: "0.5rem",
  },
  detailRow: {
    display: "grid",
    gridTemplateColumns: "120px 1fr",
    alignItems: "baseline",
  },
  detailKey: {
    fontSize: "0.85rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em",
    color: "#8a7a3d",
    margin: 0,
  },
  detailValue: {
    margin: 0,
    fontSize: "1rem",
  },
  footer: {
    textAlign: "center" as const,
    padding: "2rem",
    borderTop: "1px solid #e8e3c8",
    fontSize: "0.9rem",
    color: "#6b6b48",
  },
};
