export type Reply = { at: number; tokens: number; model: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { lastReply: Reply | null; isHidden: boolean; now: number }
  }
}
