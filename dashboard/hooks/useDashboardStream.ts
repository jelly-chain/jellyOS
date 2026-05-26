import { useState, useEffect, useRef, useCallback } from 'react';

export interface DashboardEvent {
  type: string;
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
  agentStatus: any | null;
  /** Messages sent from dashboard → agent */
  dashboardMessages: Array<{ text: string; ts: number }>;
  /** Streaming agent response */
  streamingText: string;
}

const DASHBOARD_PORT = parseInt(import.meta.env.VITE_DASHBOARD_PORT || '4320');
const MAX_EVENTS = 200;
const MAX_FEEDS = 50;
const MAX_LOGS = 100;

export function useDashboardStream(): DashboardState & {
  retry: () => void;
  sendMessage: (text: string) => void;
  setEffectLevel: (level: string) => void;
  requestStatus: () => void;
} {
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
    agentStatus: null,
    dashboardMessages: [],
    streamingText: '',
  });

  const wsRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  const sendMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'agent_message', text }));
      setState(s => ({
        ...s,
        dashboardMessages: [...s.dashboardMessages, { text, ts: Date.now() }],
        streamingText: '', // clear any previous streaming
      }));
    }
  }, []);

  const setEffectLevel = useCallback((level: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_effect', level }));
    }
  }, []);

  const requestStatus = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'get_status' }));
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(`ws://localhost:${DASHBOARD_PORT}`);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCount.current = 0;
        setState(s => ({ ...s, connected: true, reconnecting: false }));
        // Request initial status
        ws.send(JSON.stringify({ type: 'get_status' }));
      };

      ws.onmessage = (e) => {
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
          let agentStatus = s.agentStatus;

          switch (event.type) {
            case 'connected':
              break;
            case 'trade_executed':
              lastTrade = { ...event.data, time: new Date(event.timestamp).toLocaleTimeString() };
              break;
            case 'vault_update':
            case 'vault_sweep':
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
            case 'status':
              agentStatus = event.data;
              break;
            case 'text_delta':
              // @ts-ignore - streaming text
              return { ...s, events, streamingText: (s as any).streamingText + (event.data?.text ?? '') };
            case 'turn_done':
              // @ts-ignore - clear streaming
              return { ...s, events, streamingText: '' };
          }

          return { ...s, events, lastTrade, vaultBalance, activeAgents, recentFeeds, signals, logEntries, agentStatus };
        });
      };

      ws.onclose = () => {
        wsRef.current = null;
        setState(s => ({ ...s, connected: false, reconnecting: true }));
        const delay = Math.min(1000 * Math.pow(2, retryCount.current), 30_000);
        retryCount.current++;
        retryTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      setState(s => ({ ...s, connected: false, reconnecting: false }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [connect]);

  return { ...state, retry: connect, sendMessage, setEffectLevel, requestStatus };
}