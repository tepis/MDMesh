import { useState } from 'react';
import { uninstallApp } from '../api/commands';
import { useToast } from './toast';
import { Button } from './Button';
import { DevicePicker } from './DevicePicker';
import { Modal } from './Modal';
import './DeployModal.css';

/**
 * Uninstall a library app from the picked devices: one app.uninstall per device, removed silently by the agent as
 * Device Owner. A configuration that still installs the app can put it back, so the dialog says so.
 */
export function UninstallModal({
  app,
  onClose,
}: {
  app: { name: string; pkg: string };
  onClose: () => void;
}) {
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  async function run() {
    if (picked.size === 0) return;
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const num of picked) {
      try {
        await uninstallApp(num, app.pkg);
        ok++;
      } catch {
        fail++;
      }
    }
    setBusy(false);
    toast.push(
      fail ? 'err' : 'ok',
      `Uninstall ${app.name}`,
      `${ok} device${ok === 1 ? '' : 's'} queued${fail ? `, ${fail} failed` : ''}.`,
    );
    onClose();
  }

  return (
    <Modal
      open
      role="alertdialog"
      onClose={() => !busy && onClose()}
      dismissOnBackdrop={!busy}
      title={`Uninstall ${app.name}`}
      description={<span className="v2-mono">{app.pkg}</span>}
      footer={
        <>
          <Button size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="lg" variant="danger" disabled={busy || picked.size === 0} onClick={() => void run()}>
            {busy
              ? 'Uninstalling…'
              : picked.size > 0
                ? `Uninstall from ${picked.size} device${picked.size === 1 ? '' : 's'}`
                : 'Uninstall'}
          </Button>
        </>
      }
    >
      <div className="v2-deploy">
        <p className="v2-deploy__note">
          Each device removes the app and its data without asking. A configuration that still installs it can put it
          back: remove the app from those configurations too.
        </p>
        <div className="v2-deploy__panel">
          <DevicePicker picked={picked} onChange={setPicked} />
        </div>
      </div>
    </Modal>
  );
}
