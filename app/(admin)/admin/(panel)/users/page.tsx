import type { Metadata } from "next";
import { InviteForm, UserControls } from "@/components/admin/UserForms";
import { Badge, Card, Cell, Empty, PageHeader, Table } from "@/components/admin/ui";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { requireAdmin } from "@/lib/admin/auth";
import { ROLE_LABELS, isRole, type Role } from "@/lib/admin/roles";
import { when } from "@/lib/admin/labels";

/**
 * Panel users, and the record of what they have done.
 *
 * The audit log is on the same page as the access list on purpose. The two
 * questions an owner has here are "who can get in" and "what did they do", and
 * an audit trail kept one click away from the list of accounts is one nobody
 * reads.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Panel users" };

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
};

type AuditRow = {
  id: string;
  created_at: string;
  actor_email: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
};

export default async function UsersPage() {
  const admin = await requireAdmin("manage");

  const db = requireAdminDb();

  const [{ data: userRows }, { data: auditRows }] = await Promise.all([
    db
      .from("admin_users")
      .select("id, email, name, role, is_active, created_at, last_login_at")
      .order("created_at", { ascending: true }),
    db
      .from("audit_log")
      .select("id, created_at, actor_email, action, target, detail")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const users = (userRows ?? []) as UserRow[];
  const entries = (auditRows ?? []) as AuditRow[];

  return (
    <>
      <PageHeader
        title="Panel users"
        description="Access is a row in a table only the server can write. Removing somebody is a delete, not a password change."
      />

      <InviteForm />

      <Card title="Who has access">
        {users.length === 0 ? (
          <Empty>Nobody yet — which should be impossible, since you are reading this.</Empty>
        ) : (
          <Table head={["Person", "Role", "Added", "Last signed in", ""]}>
            {users.map((user) => (
              <tr key={user.id}>
                <Cell>
                  <p className="font-medium text-ink">{user.name ?? user.email}</p>
                  {user.name && <p className="text-slate">{user.email}</p>}
                </Cell>
                <Cell>
                  <Badge tone={user.role === "owner" ? "good" : "neutral"}>
                    {ROLE_LABELS[(isRole(user.role) ? user.role : "read_only") as Role]}
                  </Badge>
                </Cell>
                <Cell className="whitespace-nowrap text-slate">{when(user.created_at)}</Cell>
                <Cell className="whitespace-nowrap text-slate">
                  {user.last_login_at ? when(user.last_login_at) : "Never"}
                </Cell>
                <Cell>
                  <UserControls
                    email={user.email}
                    role={(isRole(user.role) ? user.role : "read_only") as Role}
                    isSelf={user.email === admin.email}
                  />
                </Cell>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card
        title="Audit log"
        description="The last hundred changes. Kept even after the account that made them is removed."
      >
        {entries.length === 0 ? (
          <Empty>Nothing has been recorded yet.</Empty>
        ) : (
          <Table head={["When", "Who", "What", "Target"]}>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <Cell className="whitespace-nowrap text-slate">{when(entry.created_at)}</Cell>
                <Cell className="text-ink">{entry.actor_email ?? "—"}</Cell>
                <Cell className="text-ink">
                  <span className="font-medium">{entry.action}</span>
                  {entry.detail && Object.keys(entry.detail).length > 0 && (
                    <span className="ms-2 text-slate">
                      {Object.entries(entry.detail)
                        .map(([key, value]) => `${key}: ${String(value)}`)
                        .join(", ")}
                    </span>
                  )}
                </Cell>
                <Cell className="max-w-xs break-words text-slate">
                  {entry.target ?? "—"}
                </Cell>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
