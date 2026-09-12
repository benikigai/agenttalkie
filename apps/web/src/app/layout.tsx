import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { AgentTalkieProvider } from "@/components/agenttalkie/provider";
import { AgentTalkieShell } from "@/components/agenttalkie/shell";
import "@copilotkit/react-core/v2/styles.css";
import "./globals.css";
import "./agenttalkie.css";

export const metadata: Metadata = {
  title: "AgentTalkie | Pick up the conversation",
  description: "Talk to your agents about their work, review sourced answers, and prepare the next step.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers><AgentTalkieProvider><AgentTalkieShell>{children}</AgentTalkieShell></AgentTalkieProvider></Providers>
      </body>
    </html>
  );
}
