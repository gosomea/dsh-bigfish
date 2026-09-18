import type {Snapshot} from '../contract/types.js';
import type {Preferences} from '../contract/preferences.js';
/** Visual settling never rewrites the host's terminal task outcome. */
export class Presentation {
  private key = ''; private since = 0;
  show(snapshot: Snapshot, prefs: Preferences, now: number): Snapshot {
    const key = [snapshot.sessionId, snapshot.turn, snapshot.state, snapshot.completionSerial].join(':');
    if (key !== this.key) { this.key = key; this.since = now; }
    const completed = snapshot.state === 'completed';
    const stopped = snapshot.state === 'cancelled' || snapshot.state === 'interrupted';
    const settle = (completed && (prefs.completionMode === 'quiet' || snapshot.completionSerial === 0 || now - this.since >= prefs.completionSeconds * 1000))
      || (stopped && now - this.since >= 4000);
    return settle ? {...snapshot, state:'idle'} : snapshot;
  }
}
