import { getActivityLog } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function ActivityPage() {
  const activity = getActivityLog(100);

  return (
    <div>
      <h1>Activity Log</h1>
      <h2>{activity.length} recent entries</h2>

      {activity.length === 0 ? (
        <div className="card empty-state">No activity recorded</div>
      ) : (
        <table className="glass-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((a, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: "nowrap" }}>{new Date(a.timestamp).toLocaleString("he-IL")}</td>
                <td>{a.actor}</td>
                <td>{a.action}</td>
                <td>{a.target}</td>
                <td>
                  <span className={a.result.includes("error") ? "text-danger" : a.result === "success" ? "text-success" : ""}>
                    {a.result}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
