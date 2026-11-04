/** Collect selected branches and descendants exactly once, including folded descendants. */
export function mindBranchIds(nodes: { id: string; parentId: string | null }[], selected: string[]) {
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = children.get(n.parentId) ?? []; list.push(n.id); children.set(n.parentId, list);
  }
  const ids = new Set(selected), pending = [...ids];
  for (let i = 0; i < pending.length; i++) {
    for (const child of children.get(pending[i]) ?? []) {
      if (ids.has(child)) continue;
      ids.add(child); pending.push(child);
    }
  }
  return ids;
}
