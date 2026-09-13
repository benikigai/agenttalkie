import type { Metadata } from "next";
import "@copilotkit/react-core/v2/styles.css";
import "./globals.css";
import "./agenttalkie.css";

export const metadata: Metadata = {
  title: "AgentTalkie",
  description: "Work scattered across agents, chats, and terminals? AgentTalkie gives you one voice workspace to direct your coding agents and review their results.",
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
        {children}
      </body>
    </html>
  );
}
