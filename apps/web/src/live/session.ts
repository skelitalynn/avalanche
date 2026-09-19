export function reconcileLocalSession(
  id: string,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): boolean {
  if (storage.getItem("situationshit-local-session") === id) return false;
  storage.removeItem("situation-pending");
  storage.setItem("situationshit-local-session", id);
  return true;
}
