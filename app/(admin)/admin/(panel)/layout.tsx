import { Shell } from "@/components/admin/Shell";
import { requireAdmin } from "@/lib/admin/auth";

/**
 * The guard, and the frame around everything behind it.
 *
 * `/admin/login` and `/admin/auth/callback` are deliberately outside this route
 * group: a layout that redirected an unauthenticated visitor would redirect the
 * login page too, and the loop would be indefinite.
 *
 * This checks `read`. Each page and every action checks its own capability
 * again — a layout is the wrong place to be the only thing standing between a
 * read-only account and the settings screen.
 */

export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const admin = await requireAdmin("read");

  return (
    <Shell email={admin.email} role={admin.role}>
      {children}
    </Shell>
  );
}
