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
      <Link href="/workspace" prefetch={false} className={styles.navLink}>Open live workspace <span aria-hidden="true">↗</span></Link>
    </header>
    <main id="main">
      <section className={styles.hero} aria-labelledby="hero-title">
        <p className={styles.eyebrow}>Your voice. Your agents. One workspace.</p>
        <h1 id="hero-title">Talk to your<br />coding agents.</h1>
        <p className={styles.intro}>Direct their work by voice. Ask a question, steer the next step, and see what your agents actually did.</p>
        <div className={styles.actions}>
          <a className={styles.primary} href="#demo">{demoVideoSrc ? "Watch the 2-minute demo" : "Preview the demo"}<span aria-hidden="true">↓</span></a>
          <Link className={styles.secondary} href="/workspace" prefetch={false}>Open live workspace <span aria-hidden="true">↗</span></Link>
        </div>
        <p className={styles.accessNote}>Live workspace access requires a demo password.</p>
      </section>
      <section id="demo" className={styles.demo} aria-labelledby="demo-title">
        <div className={styles.demoHeading}>
          <div><p className={styles.eyebrow}>See it in action</p><h2 id="demo-title">A conversation that moves work forward.</h2></div>
          <span className={styles.badge}>{demoVideoSrc ? "2-minute demo" : "Demo video coming soon"}</span>
        </div>
        <div className={styles.player}>
          {demoVideoSrc ? <DemoVideo src={demoVideoSrc} poster="/agenttalkie-demo-preview.svg" /> : <>
            {/* This is an illustration, never a capture of private workspace data. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/agenttalkie-demo-preview.svg" alt="Illustrative AgentTalkie workspace with a spoken request, agent response, and voice controls." width="1200" height="675" />
            <div className={styles.comingSoon}><span className={styles.recordMark} aria-hidden="true" /><div><strong>The recording is on its way.</strong><span>A two-minute walkthrough will appear here.</span></div></div>
          </>}
        </div>
        <p className={styles.caption}>{demoVideoSrc ? "Watch without a password. No live workspace connection needed." : "Illustrative workspace preview. The recorded demo will be public, with no password required."}</p>
      </section>
      <section className={styles.workflow} aria-label="How AgentTalkie works">
        <article><span className={styles.step}>01 / SAY IT</span><h2>Start with a conversation.</h2><p>Tell your agents what you want to work on. Keep talking while they investigate.</p></article>
        <article><span className={styles.step}>02 / STEER IT</span><h2>Change direction naturally.</h2><p>Ask a follow-up or narrow the scope without losing the thread of the work.</p></article>
        <article><span className={styles.step}>03 / SEE IT</span><h2>Review what happened.</h2><p>See answers, tool activity, and results together. Approve workspace changes before they run.</p></article>
      </section>
    </main>
    <footer className={styles.footer}><span>AgentTalkie</span><p>Less switching tabs. More moving work forward.</p><Link href="/workspace" prefetch={false}>Live workspace <span aria-hidden="true">↗</span></Link></footer>
  </div>;
}
