import { useState, useEffect, useRef, useCallback } from 'react';

export interface DashboardEvent {
  type: 'agent_status' | 'trade_executed' | 'wallet_balance' | 'vault_update' |
        'feed_item' | 'log_entry' | 'swarm_update' | 'signal_update' | 'connected';
  data: any;
  timestamp: number;
}

export interface DashboardState {
  connected: boolean;
  events: DashboardEvent[];
  lastTrade: any | null;
  vaultBalance: number;
  activeAgents: number;
  recentFeeds: any[];
  signals: any[];
  logEntries: any[];
  reconnecting: boolean;
}

const DASHBOARD_PORT = parseInt(import.meta.env.VITE_DASHBOARD_PORT || '4320');
const BASE_URL = `http://localhost:${DASHBOARD_PORT}`;
const MAX_EVENTS = 200;
const MAX_FEEDS = 50;
const MAX_LOGS = 100;

export function useDashboardStream(): DashboardState & { retry: () => void } {
  const [state, setState] = useState<DashboardState>({
    connected: false,
    events: [],
    lastTrade: null,
    vaultBalance: 0,
    activeAgents: 0,
    recentFeeds: [],
    signals: [],
    logEntries: [],
    reconnecting: false,
  });

  const esRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    try {
      const es = new EventSource(`${BASE_URL}/events`);
      esRef.current = es;

      es.onopen = () => {
        retryCount.current = 0;
        setState(s => ({ ...s, connected: true, reconnecting: false }));
      };

      es.onmessage = (e) => {
        let event: DashboardEvent;
        try { event = JSON.parse(e.data); } catch { return; }

        setState(s => {
          const events = [event, ...s.events].slice(0, MAX_EVENTS);
          let lastTrade = s.lastTrade;
          let vaultBalance = s.vaultBalance;
          let activeAgents = s.activeAgents;
          let recentFeeds = s.recentFeeds;
          let signals = s.signals;
          let logEntries = s.logEntries;

          switch (event.type) {
            case 'trade_executed':
              lastTrade = { ...event.data, time: new Date(event.timestamp).toLocaleTimeString() };
              break;
            case 'vault_update':
              if (event.data?.balance !== undefined) vaultBalance = event.data.balance;
              break;
            case 'agent_status':
            case 'swarm_update':
              activeAgents = event.data?.activeAgents ?? activeAgents;
              break;
            case 'feed_item':
              recentFeeds = [event.data, ...s.recentFeeds].slice(0, MAX_FEEDS);
              break;
            case 'signal_update':
              signals = [event.data, ...s.signals].slice(0, 50);
              break;
            case 'log_entry':
              logEntries = [{ ...event.data, time: new Date(event.timestamp).toLocaleTimeString() }, ...s.logEntries].slice(0, MAX_LOGS);
              break;
          }

          return { ...s, events, lastTrade, vaultBalance, activeAgents, recentFeeds, signals, logEntries };
        });
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        setState(s => ({ ...s, connected: false, reconnecting: true }));

        const delay = Math.min(1000 * Math.pow(2, retryCount.current), 30_000);
        retryCount.current++;
        retryTimerRef.current = setTimeout(connect, delay);
      };
    } catch {
      setState(s => ({ ...s, connected: false, reconnecting: false }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [connect]);

  return { ...state, retry: connect };
}
