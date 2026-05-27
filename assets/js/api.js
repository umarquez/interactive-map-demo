// Single responsibility: talk to the backend.
export async function fetchGroups() {
  const res = await fetch("/api/v1/groups", { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`GET /api/v1/groups -> ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data.groups) ? data.groups : [];
}
