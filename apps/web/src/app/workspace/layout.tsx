import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { AgentTalkieProvider } from "@/components/agenttalkie/provider";
import { AgentTalkieShell } from "@/components/agenttalkie/shell";

export const metadata: Metadata = {
  title: "Live workspace | AgentTalkie",
  robots: { index: false, follow: false },
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <Providers><AgentTalkieProvider><AgentTalkieShell>{children}</AgentTalkieShell></AgentTalkieProvider></Providers>;
}
