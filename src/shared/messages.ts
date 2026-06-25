// The list of every kind of message this extension and our servers send back
// and forth, so both sides always agree on what each one looks like. The
// extension pulls work from a poll and posts back the result; there is no
// persistent connection.

export interface SendTradeWork {
  name: 'send-trade';
  messageId: string;
  clientRequestId: string;
  partner: string;
  tradeoffermessage: string;
  json_tradeoffer: unknown;
  tradelink: string;
}

export interface WithdrawTradeWork {
  name: 'withdraw-trade';
  messageId: string;
  trade_id: string;
  action: 'cancel' | 'decline';
}

export interface AcceptTradeWork {
  name: 'accept-trade';
  messageId: string;
  trade_id: string;
  partner: string;
}

export interface TradeAck {
  messageId: string;
  data: {
    status: 'ok' | 'error';
    value?: unknown;
    error?: string;
  };
}

export interface PollResponse {
  status: 'ok' | 'no-account' | 'error';
  profile?: { personaName: string | null };
  sendTrades?: SendTradeWork[];
  accepts?: AcceptTradeWork[];
  withdraws?: WithdrawTradeWork[];
  alert?: { count: number };
  fetchInventory?: boolean;
  error?: string;
}

export interface RuntimeGetStatus {
  type: 'get-status';
}

export type ConnState = 'offline' | 'connecting' | 'online' | 'no-account';

export interface RuntimeStatusReply {
  type: 'status';
  connState: ConnState;
  steamSignedIn: boolean;
  steamUsername: string | null;
  soundEnabled: boolean;
  notifEnabled: boolean;
  buildVersion: string;
  buildCommit: string;
}

export interface RuntimeSetSound {
  type: 'set-sound';
  enabled: boolean;
}

export interface RuntimeSetNotif {
  type: 'set-notif';
  enabled: boolean;
}

export type RuntimeMessage = RuntimeGetStatus | RuntimeStatusReply | RuntimeSetSound | RuntimeSetNotif;

export interface PageProbe {
  source: 'rustyharbor-setup';
  type: 'probe';
}

export interface PageProbeReply {
  source: 'rustyharbor-extension';
  type: 'probe-reply';
  installed: true;
  online: boolean;
  connState: ConnState;
  steamSignedIn: boolean;
  soundEnabled: boolean;
  notifEnabled: boolean;
  version: string;
}

export interface PageSetSound {
  source: 'rustyharbor-setup';
  type: 'set-sound';
  enabled: boolean;
}

export interface PageSetNotif {
  source: 'rustyharbor-setup';
  type: 'set-notif';
  enabled: boolean;
}

export type PageMessage = PageProbe | PageProbeReply | PageSetSound | PageSetNotif;
