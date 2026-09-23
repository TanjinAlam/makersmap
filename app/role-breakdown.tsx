import type { RoleGroup } from "./profile";

const GROUPS: RoleGroup[] = ["Founders", "Developers", "Designers", "Creators", "Business"];
const singular: Record<RoleGroup, string> = { Founders: "founder", Developers: "developer", Designers: "designer", Creators: "creator", Business: "business" };

// Who's here, by role: a stacked bar plus four readable counts. Shared by the
// country and city pages so the numbers are never a row of faint chips.
export function RoleBreakdown({ groups, total }: { groups: Record<RoleGroup, number>; total: number }) {
  if (!total) return null;
  return (
    <div className="role-breakdown" aria-label="Makers by role">
      <div className="lb-bar role-breakdown-bar" aria-hidden="true">
        {GROUPS.filter((g) => groups[g] > 0).map((g) => (
          <span key={g} className={`lb-seg lb-seg-${g.toLowerCase()}`} style={{ width: `${(groups[g] / total) * 100}%` }} />
        ))}
      </div>
      <dl className="role-breakdown-grid">
        {GROUPS.filter((g) => groups[g] > 0).map((g) => (
          <div key={g} className={`role-breakdown-cell role-${g.toLowerCase()}`}>
            <dt><i aria-hidden="true" />{groups[g] === 1 ? singular[g] : g.toLowerCase()}</dt>
            <dd><strong>{groups[g]}</strong><small>{Math.round((groups[g] / total) * 100)}%</small></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
