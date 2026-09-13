# Public demo

`/` is the public landing page. `/workspace` opens the existing live workspace and password gate. The landing page does not mount the workspace, CopilotKit, microphone controls, or live API connections, even for an already authenticated browser.

The public player serves the 2:05 AgentTalkie recording from `public/demo/agenttalkie-demo.mp4`, with a frame from the recording as its poster. The MP4 uses H.264 video, AAC audio, and fast-start metadata for browser playback.

## Publish the recording

1. Export the actual demo as an MP4. Keep the displayed duration accurate when replacing the recording.
2. Put it at `apps/web/public/demo/agenttalkie-demo.mp4`, or upload it to the intended public media host.
3. Set `demoVideoSrc` in `src/lib/agenttalkie-demo.ts` to `/demo/agenttalkie-demo.mp4` or the direct HTTPS MP4 URL.
4. Build and deploy. Verify public playback and seeking. The CTA reads “Watch the demo” and the placeholder becomes a video player.

The video is public. Live API authentication and the existing four-hour session cookie are unchanged. A returning browser with a valid cookie can reopen `/workspace` without entering the password again.
