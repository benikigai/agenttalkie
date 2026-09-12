import type { SVGProps } from "react";

type IconName = "mic" | "muted" | "end" | "keyboard" | "arrow" | "chevron" | "source" | "history" | "check" | "work" | "wave" | "alert" | "copy";
const paths: Record<IconName, React.ReactNode> = {
  mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
  muted: <><path d="m3 3 18 18M9 9v3a3 3 0 0 0 5 2M9 5a3 3 0 0 1 6 0v4M5 10v2a7 7 0 0 0 12 5M19 10v2M12 19v3M8 22h8" /></>,
  end: <path d="M3 15v-4c5-5 13-5 18 0v4l-5-1v-3a15 15 0 0 0-8 0v3z" />,
  keyboard: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 9h1m4 0h1m4 0h1M6 12h1m4 0h1m4 0h1M7 16h10" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  source: <><path d="M14 2H5v20h14V7zM14 2v6h5M8 12h8M8 16h6" /></>,
  history: <><path d="M3 10a9 9 0 1 1 1 7M3 4v6h6M12 7v6l4 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  work: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3" /></>,
  wave: <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16h.01" /></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
};

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
