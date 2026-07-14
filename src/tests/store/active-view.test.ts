import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../renderer/store';

// Reset store before each test
beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
});

describe('activeView routing', () => {
  it('defaults to home', () => {
    expect(useAppStore.getState().activeView).toBe('home');
  });

  it('setActiveView sets the view and closes settings', () => {
    useAppStore.getState().setShowSettings(true);
    useAppStore.getState().setActiveView('skills');

    const state = useAppStore.getState();
    expect(state.activeView).toBe('skills');
    expect(state.showSettings).toBe(false);
  });

  it('setActiveView preserves activeSessionId (return-to-chat works)', () => {
    useAppStore.getState().setActiveSession('s1');
    useAppStore.getState().setActiveView('connectors');

    const state = useAppStore.getState();
    expect(state.activeView).toBe('connectors');
    expect(state.activeSessionId).toBe('s1');
  });

  it('selecting a session leaves any nav view (resets to home)', () => {
    useAppStore.getState().setActiveView('tasks');
    useAppStore.getState().setActiveSession('s1');

    const state = useAppStore.getState();
    expect(state.activeSessionId).toBe('s1');
    expect(state.activeView).toBe('home');
  });

  it('new task (setActiveSession(null)) resets to home', () => {
    useAppStore.getState().setActiveView('files');
    useAppStore.getState().setActiveSession(null);

    const state = useAppStore.getState();
    expect(state.activeSessionId).toBeNull();
    expect(state.activeView).toBe('home');
  });

  it('opening/closing settings preserves the active nav view (overlay semantics)', () => {
    useAppStore.getState().setActiveView('experts');
    // setActiveView already cleared showSettings; now open settings as an overlay
    useAppStore.getState().setShowSettings(true);
    expect(useAppStore.getState().activeView).toBe('experts');

    // closing settings returns to the same nav view
    useAppStore.getState().setShowSettings(false);
    expect(useAppStore.getState().activeView).toBe('experts');
  });
});
