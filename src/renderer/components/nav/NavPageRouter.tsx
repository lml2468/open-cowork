import { useAppStore } from '../../store';
import type { ActiveView } from '../../store';
import { SkillsPage } from './SkillsPage';
import { ConnectorsPage } from './ConnectorsPage';
import { TasksPage } from './TasksPage';

/**
 * Renders the full-width page for the active nav-rail destination. Only mounted
 * by App.tsx when `activeView !== 'home'`, so each page's data effects run only
 * while its view is active. Every nav destination is a functional management
 * surface — there are no placeholder / "coming soon" dead-ends.
 */
export function NavPageRouter({ view }: { view: ActiveView }) {
  const setActiveView = useAppStore((s) => s.setActiveView);
  const back = () => setActiveView('home');

  switch (view) {
    case 'skills':
      return <SkillsPage onClose={back} />;
    case 'connectors':
      return <ConnectorsPage onClose={back} />;
    case 'tasks':
      return <TasksPage onClose={back} />;
    default:
      return null; // 'home' is handled by App.tsx, never routed here
  }
}
