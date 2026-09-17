import { useRef } from "react";
import type { Snapshot } from "../contract/types.js";
import type { Preferences } from "../contract/preferences.js";
export function usePresentation(
  snapshot: Snapshot,
  prefs: Preferences,
): Snapshot {
  const completedAt = useRef<{ serial: number; at: number }>({
    serial: -1,
    at: 0,
  });
  if (snapshot.completionSerial !== completedAt.current.serial)
    completedAt.current = { serial: snapshot.completionSerial, at: Date.now() };
  const shown =
    snapshot.state === "completed" &&
    (prefs.completionMode === "quiet" ||
      snapshot.completionSerial === 0 ||
      Date.now() - completedAt.current.at > prefs.completionSeconds * 1000)
      ? { ...snapshot, state: "idle" as const }
      : snapshot;
  return shown;
}
