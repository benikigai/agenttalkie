# Public demo

`/` is the public landing page. `/workspace` opens the existing live workspace and password gate. The landing page does not mount the workspace, CopilotKit, microphone controls, or live API connections, even for an already authenticated browser.

The current preview is an illustration, not a recording or private workspace screenshot.

## Publish the recording

1. Export the actual demo as an MP4, no longer than two minutes. Check the audio and remove private data and credentials.
2. Put it at `apps/web/public/demo/agenttalkie-demo.mp4`, or upload it to the intended public media host.
3. Set `demoVideoSrc` in `src/lib/agenttalkie-demo.ts` to `/demo/agenttalkie-demo.mp4` or the direct HTTPS MP4 URL.
4. Build and deploy. Verify signed-out playback, audio, mobile playback, and seeking. The CTA changes to “Watch the 2-minute demo” and the placeholder becomes a video player.

The video is public. Live API authentication and the existing four-hour session cookie are unchanged. A returning browser with a valid cookie can reopen `/workspace` without entering the password again.
