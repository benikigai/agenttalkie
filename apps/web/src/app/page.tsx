import Link from "next/link";
import { voiceMarkPath } from "@/components/agenttalkie/brand";
import { DemoVideo } from "@/components/agenttalkie/demo-video";
import { demoVideoSrc } from "@/lib/agenttalkie-demo";
import styles from "./landing.module.css";

export default function Home() {
  return <div className={styles.page}>
    <a className={styles.skip} href="#main">Skip to content</a>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="AgentTalkie home">
        <svg viewBox="0 0 64 64" aria-hidden="true"><path d={voiceMarkPath} fill="currentColor" fillRule="evenodd" /></svg>
        AgentTalkie
      </Link>
      <nav className={styles.nav} aria-label="Main navigation">
        <a href="https://github.com/benikigai/agenttalkie" className={styles.navLink} target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>
        <Link href="/workspace" prefetch={false} className={styles.navLink}>Open live workspace <span aria-hidden="true">↗</span></Link>
      </nav>
    </header>
    <main id="main">
      <section className={styles.hero} aria-labelledby="hero-title">
        <h1 id="hero-title">More agents.<br />More context to manage.</h1>
        <p className={styles.intro}>AgentTalkie lets you direct their work by voice and review results in one place.</p>
        <div className={styles.actions}>
          <a className={styles.primary} href="#demo">{demoVideoSrc ? "Watch the demo" : "Preview the demo"}<span aria-hidden="true">↓</span></a>
          <Link className={styles.secondary} href="/workspace" prefetch={false}>Open live workspace <span aria-hidden="true">↗</span></Link>
        </div>
        <p className={styles.accessNote}>Live workspace access requires a demo password.</p>
      </section>
      <section id="demo" className={styles.demo} aria-labelledby="demo-title">
        <div className={styles.demoHeading}>
          <div><p className={styles.eyebrow}>See it in action</p><h2 id="demo-title">From a spoken request to a result you can review.</h2></div>
          <span className={styles.badge}>{demoVideoSrc ? "2:05 demo" : "Demo video coming soon"}</span>
        </div>
        <div className={styles.player}>
          {demoVideoSrc ? <DemoVideo src={demoVideoSrc} poster="/demo/agenttalkie-poster.jpg" /> : <>
            {/* This is an illustration, never a capture of private workspace data. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/agenttalkie-demo-preview.svg" alt="Illustrative AgentTalkie workspace with a spoken request, agent response, and voice controls." width="1200" height="675" />
            <div className={styles.comingSoon}><span className={styles.recordMark} aria-hidden="true" /><div><strong>The recording is on its way.</strong><span>A two-minute walkthrough will appear here.</span></div></div>
          </>}
        </div>
        <p className={styles.caption}>{demoVideoSrc ? "Watch without a password. No live workspace connection needed." : "Illustrative workspace preview. The recorded demo will be public, with no password required."}</p>
      </section>
      <section className={styles.workflow} aria-label="How AgentTalkie works">
        <article><span className={styles.step}>01 / DIRECT</span><h2>Less manual coordination.</h2><p>Direct investigation, building, and review from one conversation instead of relaying instructions between agents.</p></article>
        <article><span className={styles.step}>02 / STEER</span><h2>Less context to rebuild.</h2><p>Follow up or change direction in the same thread, with earlier instructions and results still in view.</p></article>
        <article><span className={styles.step}>03 / REVIEW</span><h2>Fewer updates to chase.</h2><p>See progress, results, and tool activity together. Know what happened and decide what to approve next.</p></article>
      </section>
      <section className={styles.event} aria-labelledby="event-title">
        <p className={styles.eyebrow}>From the hackathon</p>
        <h2 id="event-title">Built at Agents, Everywhere.</h2>
        <p className={styles.eventNote}>AI Tinkerers · San Francisco · September 12, 2026</p>
        <div className={styles.eventPhotos}>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/event/event-room.webp" alt="Hackathon attendees watching a presentation in the event space." width="1280" height="960" loading="lazy" decoding="async" />
            <figcaption>At the hackathon</figcaption>
          </figure>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/event/build-setup.webp" alt="The hackathon build setup with a laptop, monitor, and voice recorder." width="1280" height="960" loading="lazy" decoding="async" />
            <figcaption>The build setup</figcaption>
          </figure>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/event/event-poster.webp" alt="Agents, Everywhere global hackathon event graphic from AI Tinkerers San Francisco." width="1280" height="1665" loading="lazy" decoding="async" />
            <figcaption>The event</figcaption>
          </figure>
        </div>
      </section>
    </main>
    <footer className={styles.footer}><span>AgentTalkie</span><p>Your agents. One conversation.</p><Link href="/workspace" prefetch={false}>Live workspace <span aria-hidden="true">↗</span></Link></footer>
  </div>;
}
