import { AccountPanel } from './AccountScreens';

/** Settings: the signed-in account (D-127). Sharing moved to the admin menu. */
export default function SettingsScreen({ onBack }: { onBack?: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {onBack && <div className="flex items-center justify-between"><h1 className="headline text-3xl font-bold">Settings</h1><button className="btn" onClick={onBack}>Back</button></div>}
      <AccountPanel />
    </div>
  );
}
