import { useEffect, useId, useState } from 'react';
import { listConfigurationNames, type ConfigurationSummary } from '../api/configurations';
import { getAppConfigLinks, updateAppConfigLinks, type AppConfigLink } from '../api/applications';
import { installApp } from '../api/commands';
import type { DeployModes, DeploySubject } from '../data/apps';
import { useToast } from './toast';
import { Button } from './Button';
import { DevicePicker } from './DevicePicker';
import { Field } from './Field';
import { Checkbox, Select } from './Input';
import { Modal } from './Modal';
import { TabPanel, Tabs } from './Tabs';
import './DeployModal.css';

type Mode = 'device' | 'config';

/**
 * Deploy dialog (classic components/DeployModal): push the app to any number of devices now, or add it to a
 * configuration (library apps only), offering the modes the role may use.
 */
export function DeployModal({
  subject,
  modes,
  onClose,
  onAssigned,
}: {
  subject: DeploySubject;
  modes: DeployModes;
  onClose: () => void;
  /** After the app was added to a configuration (its "Used in" changed). */
  onAssigned?: (applicationId: number) => void;
}) {
  const toast = useToast();
  const idBase = useId();
  const canAssign = subject.applicationId != null;
  const [chosenMode, setMode] = useState<Mode>(modes.devices ? 'device' : 'config');
  // A role refresh can take a mode away while the dialog is open: the other one shows (the page closes the dialog
  // when the role has none left).
  const mode: Mode = chosenMode === 'device' ? (modes.devices ? 'device' : 'config') : modes.configuration ? 'config' : 'device';
  const [configs, setConfigs] = useState<Pick<ConfigurationSummary, 'id' | 'name'>[]>([]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [config, setConfig] = useState('');
  const [runAfter, setRunAfter] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listConfigurationNames()
      .then((l) => !cancelled && setConfigs(l ?? []))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function pushNow() {
    if (picked.size === 0) return;
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const num of picked) {
      try {
        await installApp(num, {
          url: subject.url,
          packageName: subject.packageName,
          versionCode: subject.versionCode,
          sha256: subject.sha256,
          runAfterInstall: runAfter,
          parts: subject.parts,
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setBusy(false);
    toast.push(
      fail ? 'err' : 'ok',
      `Deploy ${subject.label}`,
      `${ok} device${ok === 1 ? '' : 's'} queued${fail ? `, ${fail} failed` : ''}.`,
    );
    onClose();
  }

  async function assignConfig() {
    if (!config || subject.applicationId == null) return;
    setBusy(true);
    try {
      const cid = Number(config);
      const links = await getAppConfigLinks(subject.applicationId);
      let found = false;
      const updated: AppConfigLink[] = links.map((l) => {
        if (l.configurationId !== cid) return l;
        found = true;
        return { ...l, action: 1, remove: false, notify: true };
      });
      if (!found) {
        updated.push({
          configurationId: cid,
          applicationId: subject.applicationId,
          action: 1,
          showIcon: true, // configurationApplications.showIcon is NOT NULL
          remove: false,
          notify: true,
        });
      }
      await updateAppConfigLinks({ applicationId: subject.applicationId, configurations: updated });
      const name = configs.find((c) => c.id === cid)?.name ?? 'configuration';
      toast.push('ok', `Added ${subject.label}`, `Assigned to ${name}.`);
      onAssigned?.(subject.applicationId);
      onClose();
    } catch (e) {
      toast.push('err', 'Assign failed', e instanceof Error ? e.message : '');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = mode === 'device' ? picked.size > 0 : !!config;
  const submitLabel = busy
    ? 'Deploying…'
    : mode === 'device'
      ? picked.size > 0
        ? `Deploy to ${picked.size} device${picked.size === 1 ? '' : 's'}`
        : 'Deploy'
      : 'Add to configuration';

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      dismissOnBackdrop={!busy}
      title={`Deploy ${subject.label}`}
      description={
        <>
          <span className="v2-mono">{subject.packageName}</span>
          {subject.versionCode != null ? ` · version code ${subject.versionCode}` : ''}
          {subject.parts?.length ? ` · ${subject.parts.length} parts` : ''}
        </>
      }
      footer={
        <>
          <Button size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={busy || !canSubmit}
            onClick={() => void (mode === 'device' ? pushNow() : assignConfig())}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="v2-deploy">
        <Tabs
          size="md"
          idBase={idBase}
          aria-label="How to deploy"
          value={mode}
          onChange={setMode}
          items={[
            ...(modes.devices ? [{ key: 'device' as const, label: 'Push to devices' }] : []),
            ...(modes.configuration ? [{ key: 'config' as const, label: 'Add to a configuration', disabled: !canAssign }] : []),
          ]}
        />
        {modes.configuration && !canAssign ? (
          <p className="v2-deploy__note">Only apps in the library can be added to a configuration.</p>
        ) : null}

        {mode === 'device' ? (
          <TabPanel idBase={idBase} tabKey="device" className="v2-deploy__panel">
            <DevicePicker
              picked={picked}
              onChange={setPicked}
              foot={<Checkbox label="Launch the app after install" checked={runAfter} onChange={(e) => setRunAfter(e.target.checked)} />}
            />
          </TabPanel>
        ) : (
          <TabPanel idBase={idBase} tabKey="config" className="v2-deploy__panel">
            <Field label="Configuration" help="Every device on this configuration installs the app on its next sync.">
              <Select value={config} onChange={(e) => setConfig(e.target.value)}>
                <option value="">Select a configuration…</option>
                {configs.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </TabPanel>
        )}

      </div>
    </Modal>
  );
}
