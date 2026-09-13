import type { Metadata } from "next";
import "@copilotkit/react-core/v2/styles.css";
import "./globals.css";
import "./agenttalkie.css";

export const metadata: Metadata = {
  title: "AgentTalkie",
  description: "Talk to your coding agents. Direct their work by voice, review their results, and decide what happens next.",
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
