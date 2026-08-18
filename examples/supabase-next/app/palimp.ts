import { createServerAdapter } from "@palimp/be-supabase/server";
import { palimp, setBackendAdapter } from "@palimp/fe-next";

// The registration lives here, not in the layout body. Next does not guarantee
// the layout module is evaluated before a page's generateMetadata, and a page
// that reads a string with `asString` calls the backend from exactly there.
// Importing `palimp` from this module instead of from the package makes the
// registration impossible to skip.
setBackendAdapter(
  createServerAdapter(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  ),
);

export { palimp };
