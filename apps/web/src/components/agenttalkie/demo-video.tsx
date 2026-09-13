"use client";

import { useState } from "react";

export function DemoVideo({ src, poster }: { src: string; poster: string }) {
  const [failed, setFailed] = useState(false);
  return <>
    <video controls playsInline preload="none" poster={poster} aria-label="AgentTalkie demo recording" onError={() => setFailed(true)}>
      <source src={src} type="video/mp4" onError={() => setFailed(true)} />
      Your browser does not support embedded video. <a href={src}>Open the demo video</a>.
    </video>
    {failed && <p role="status">The video could not load. <a href={src}>Try opening the recording directly</a>.</p>}
  </>;
}
