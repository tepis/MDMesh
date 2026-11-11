import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { searchDevices, type DeviceView } from '../api/devices';
import { Checkbox, SearchInput } from './Input';
import { RelativeTime } from './RelativeTime';
import { StatusDot, type StatusTone } from './Status';
import './DeployModal.css';

/** Device check-in recency (the server's statusCode colour) as a shape-coded mark + word. */
const PRESENCE: Record<string, { tone: StatusTone; label: string }> = {
  green: { tone: 'ok', label: 'Online' },
  yellow: { tone: 'idle', label: 'Idle' },
  red: { tone: 'idle', label: 'Offline' },
};
const UNKNOWN = { tone: 'idle' as StatusTone, label: 'Unknown' };

/**
 * The device list of the Deploy and Uninstall dialogs: loads the devices, filters them, and keeps the picked device
 * numbers in `picked` (owned by the dialog). `foot` sits under the list, beside the selected count.
 */
export function DevicePicker({
  picked,
  onChange,
  foot,
}: {
  picked: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  foot?: ReactNode;
}) {
  const [devices, setDevices] = useState<DeviceView[] | null>(null);
  const [devicesError, setDevicesError] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    searchDevices({ pageSize: 1000 })
      .then((r) => !cancelled && setDevices(r.devices?.items ?? []))
      .catch(() => {
        if (cancelled) return;
        setDevices([]);
        setDevicesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = devices ?? [];
    if (!q) return list;
    return list.filter((d) => `${d.number ?? ''} ${d.description ?? ''}`.toLowerCase().includes(q));
  }, [devices, filter]);

  const allShownPicked = shown.length > 0 && shown.every((d) => picked.has(d.number));

  function toggle(num: string) {
    const next = new Set(picked);
    if (next.has(num)) next.delete(num);
    else next.add(num);
    onChange(next);
  }

  function toggleShown() {
    const next = new Set(picked);
    for (const d of shown) {
      if (allShownPicked) next.delete(d.number);
      else next.add(d.number);
    }
    onChange(next);
  }

  return (
    <>
      <div className="v2-deploy__tools">
        <SearchInput
          className="v2-deploy__search"
          aria-label="Filter devices"
          placeholder="Filter devices"
          value={filter}
          onChange={setFilter}
        />
        {shown.length > 0 ? (
          <Checkbox
            label={allShownPicked ? 'Clear shown' : `Select all ${shown.length} shown`}
            checked={allShownPicked}
            indeterminate={!allShownPicked && shown.some((d) => picked.has(d.number))}
            onChange={toggleShown}
          />
        ) : null}
      </div>
      <ul className="v2-deploy__list" aria-label="Devices">
        {devices === null ? (
          <li className="v2-deploy__empty">Loading devices…</li>
        ) : shown.length === 0 ? (
          <li className="v2-deploy__empty">
            {devicesError ? 'Could not load the devices.' : devices.length === 0 ? 'No devices yet.' : 'No devices match.'}
          </li>
        ) : (
          shown.map((d) => {
            const p = (d.statusCode && PRESENCE[d.statusCode]) || UNKNOWN;
            return (
              <li key={d.id}>
                <label className="v2-deploy__row">
                  <Checkbox checked={picked.has(d.number)} onChange={() => toggle(d.number)} />
                  <StatusDot tone={p.tone} />
                  <span className="v2-visually-hidden">{p.label}, </span>
                  <span className="v2-deploy__num">{d.number || '—'}</span>
                  <span className="v2-deploy__desc">{d.description}</span>
                  <RelativeTime className="v2-deploy__seen" value={d.lastUpdate} />
                </label>
              </li>
            );
          })
        )}
      </ul>
      <div className="v2-deploy__foot">
        {foot ?? <span />}
        <span className="v2-deploy__count" aria-live="polite">
          {picked.size} selected
        </span>
      </div>
    </>
  );
}
