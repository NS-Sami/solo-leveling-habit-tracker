import { PlayerStatus } from '../components/hud/PlayerStatus';
import { DailyQuests } from '../components/today/DailyQuests';
import { MotivationHub } from '../components/media/MotivationHub';
import { WeeklyAnalytics } from '../components/analytics/WeeklyAnalytics';
import { useSystem } from '../state/SystemProvider';
import { BackupReminder } from '../components/system/BackupReminder';

export function TodayPage() {
  const { currentCycle } = useSystem();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
      <div className="space-y-4">
        <PlayerStatus />
        <BackupReminder />
        <div className="hidden lg:block">
          <MotivationHub />
        </div>
      </div>
      <div className="space-y-4">
        <DailyQuests />
        <div className="lg:hidden">
          <MotivationHub />
        </div>
        <div className="hidden lg:block">
          <WeeklyAnalytics cycle={currentCycle} />
        </div>
      </div>
    </div>
  );
}
