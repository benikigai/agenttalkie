"use client";
import { useAgentTalkie } from "./provider";
import { VoiceDock } from "./voice-dock";
import { LiveAccess } from "./live-access";
import { Icon } from "./icons";

export function AgentTalkieShell({ children }: { children: React.ReactNode }) {
  const { snapshot, loading } = useAgentTalkie();
  return <div className="at-shell"><a className="at-sr-only" href="#main-content">Skip to current work</a>
    <header className="at-topbar"><div className="at-brand"><span className="at-brand-mark"><Icon name="wave" size={20} /></span>AgentTalkie</div><div className="at-top-meta"><span>Your work, in conversation.</span><span className="at-mode"><span className="at-dot" />{snapshot.session.mode === "fixture" ? "Workspace locked" : "Live workspace"}</span><LiveAccess /><span className="at-avatar" aria-label="Your workspace">AT</span></div></header>
    {children}{snapshot.session.mode === "live" && <VoiceDock key={`${snapshot.session.id}:${loading}`} />}
  </div>;
}
