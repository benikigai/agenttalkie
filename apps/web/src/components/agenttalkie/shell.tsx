"use client";
import { useAgentTalkie } from "./provider";
import { VoiceDock } from "./voice-dock";
import { LiveAccess } from "./live-access";
import { Icon } from "./icons";

export function AgentTalkieShell({ children }: { children: React.ReactNode }) {
  const { snapshot } = useAgentTalkie();
  return <div className="at-shell"><a className="at-sr-only" href="#main-content">Skip to current work</a>
    <header className="at-topbar"><div className="at-brand"><span className="at-brand-mark"><Icon name="wave" size={20} /></span>AgentTalkie</div><div className="at-top-meta"><span>Your work, in conversation.</span><span className="at-mode"><span className="at-dot" />{snapshot.session.mode === "fixture" ? "Fixture mode" : "Live workspace"}</span><LiveAccess /></div></header>
    {children}<VoiceDock />
  </div>;
}
