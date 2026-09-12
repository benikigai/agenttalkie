"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AgentTarget, SessionSnapshot, WorkerRequest } from "@/lib/agenttalkie-contract";
import { agenttalkieFixture, agenttalkieFixtureTarget } from "@/lib/agenttalkie-fixture";
import * as api from "@/lib/client/agenttalkie-api";
import { currentAnswer, isCurrentFollowup, sameTarget } from "@/lib/client/agenttalkie-state";

function useWorkspace() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(agenttalkieFixture);
  const snapshotRef = useRef(snapshot);
  const [target, setTarget] = useState<AgentTarget>(agenttalkieFixtureTarget);
  const targetRef = useRef(target);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expected, setExpected] = useState<WorkerRequest | null>(null);
  const expectedRef = useRef<WorkerRequest | null>(null);
  const [retryRequest, setRetryRequest] = useState<WorkerRequest | null>(null);
  const [preparing, setPreparing] = useState(false);
  const epoch = useRef(0);
  const mutation = useRef(false);

  const applySnapshot = useCallback((next: SessionSnapshot) => {
    const wanted = expectedRef.current;
    if (wanted && (next.session.activeRequestId !== wanted.requestId || (next.session.activeRevision ?? 0) < wanted.revision)) return;
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const start = useCallback(async (mode: "fixture" | "live" = "fixture", signal?: AbortSignal) => {
    const thisEpoch = ++epoch.current;
    setLoading(true); setReady(false); setError(null);
    setPreparing(false); setSubmitting(false); mutation.current = false;
    expectedRef.current = null; setExpected(null); setRetryRequest(null);
    try {
      const next = await api.createSession(mode, signal);
      if (thisEpoch !== epoch.current || signal?.aborted) return;
      applySnapshot(next);
      const selected = next.targets.find((item) => sameTarget(item, targetRef.current)) ?? next.targets[0];
      if (selected) { setTarget(selected); targetRef.current = selected; }
      setReady(true);
    } catch (cause) {
      if (thisEpoch !== epoch.current || signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : "The workspace could not be opened.");
    } finally {
      if (thisEpoch === epoch.current && !signal?.aborted) setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    const controller = new AbortController();
    void start("fixture", controller.signal);
    return () => { controller.abort(); epoch.current++; };
  }, [start]);

  const hasPending = snapshot.session.requests.some((request) => request.state === "pending" || (request.state === "superseded" && !request.result && !request.error));
  useEffect(() => {
    if (!ready || !hasPending || snapshot.session.status === "ended") return;
    const sessionId = snapshot.session.id;
    const thisEpoch = epoch.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api.readSession(sessionId, controller.signal);
        if (!controller.signal.aborted && thisEpoch === epoch.current) applySnapshot(next);
      } catch (cause) {
        if (!controller.signal.aborted && thisEpoch === epoch.current) {
          setError(cause instanceof Error ? cause.message : "Could not refresh the answer. Its status is unknown.");
          if (cause instanceof api.AgentTalkieApiError && cause.code === "SESSION_NOT_FOUND") setReady(false);
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 600);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [ready, hasPending, snapshot.session.id, snapshot.session.status, applySnapshot]);

  const selectTarget = useCallback((next: AgentTarget) => {
    targetRef.current = next;
    setTarget(next);
    setError(null);
  }, []);

  const sendQuestion = useCallback(async (question: string, correction = false, retry?: WorkerRequest) => {
    if (mutation.current || !question.trim()) return null;
    const current = snapshotRef.current;
    if (current.session.status === "ended") { setError("Start a new conversation before asking another question."); return null; }
    const selected = targetRef.current;
    const previous = expectedRef.current ?? current.session.requests.find((item) => item.requestId === current.session.activeRequestId && item.revision === current.session.activeRevision);
    const revising = correction && previous && sameTarget(previous, selected);
    const request: WorkerRequest = retry ?? {
      requestId: revising ? previous.requestId : crypto.randomUUID(),
      revision: revising ? previous.revision + 1 : 1,
      projectId: selected.projectId, agentId: selected.agentId, workerSessionId: selected.workerSessionId,
      question: question.trim(),
    };
    const thisEpoch = epoch.current;
    mutation.current = true;
    setSubmitting(true); setError(null); setRetryRequest(null);
    // Hide obsolete answers before the correction reaches the server.
    expectedRef.current = request; setExpected(request);
    try {
      const next = await api.submitQuestion(current.session.id, request);
      if (thisEpoch !== epoch.current) return null;
      applySnapshot(next);
      return request;
    } catch (cause) {
      if (thisEpoch !== epoch.current) return null;
      setRetryRequest(request);
      setError(cause instanceof Error ? cause.message : "The request status is unknown. Retry checks the same request.");
      if (cause instanceof api.AgentTalkieApiError && cause.code === "SESSION_NOT_FOUND") { setReady(false); setRetryRequest(null); }
      return null;
    } finally {
      if (thisEpoch === epoch.current) { mutation.current = false; setSubmitting(false); }
    }
  }, [applySnapshot]);

  const end = useCallback(async () => {
    const current = snapshotRef.current;
    const thisEpoch = ++epoch.current;
    setReady(false);
    setSubmitting(false);
    setPreparing(false);
    expectedRef.current = null; setExpected(null); setRetryRequest(null);
    mutation.current = false;
    setError(null);
    try {
      const next = await api.endSession(current.session.id);
      if (thisEpoch === epoch.current) applySnapshot(next);
    } catch (cause) {
      if (thisEpoch === epoch.current) setError(cause instanceof Error ? cause.message : "Could not confirm the conversation ended on the server.");
    }
  }, [applySnapshot]);

  const prepare = useCallback(async () => {
    const current = snapshotRef.current;
    const result = currentAnswer(current, targetRef.current, expectedRef.current);
    const request = current.session.requests.find((item) => item.requestId === result?.requestId && item.revision === result?.revision);
    if (!result || !request) return;
    const thisEpoch = epoch.current;
    setPreparing(true); setError(null);
    try {
      await api.prepareFollowup(current.session.id, result.requestId, result.revision, `Follow up on: ${request.question}`);
      const next = await api.readSession(current.session.id);
      if (thisEpoch === epoch.current) applySnapshot(next);
    } catch (cause) {
      if (thisEpoch === epoch.current) setError(cause instanceof Error ? cause.message : "Could not prepare the follow-up.");
    } finally { if (thisEpoch === epoch.current) setPreparing(false); }
  }, [applySnapshot]);

  const answer = currentAnswer(snapshot, target, expected);
  const currentRequest = expected && sameTarget(expected, target)
    ? snapshot.session.requests.find((item) => item.requestId === expected.requestId && item.revision === expected.revision) ?? { ...expected, state: "pending" as const, result: null, error: null, createdAt: "", updatedAt: "" }
    : snapshot.session.requests.find((item) => item.requestId === snapshot.session.activeRequestId && item.revision === snapshot.session.activeRevision && sameTarget(item, target)) ?? null;
  const followup = isCurrentFollowup(snapshot, expected) && snapshot.session.preparedFollowup && sameTarget(snapshot.session.preparedFollowup, target) ? snapshot.session.preparedFollowup : null;

  return { snapshot, target, selectTarget, ready, loading, submitting, preparing, error, answer, currentRequest, followup,
    start, end, sendQuestion, prepare,
    retry: retryRequest ? () => sendQuestion(retryRequest.question, false, retryRequest) : null,
    isCurrent: (request: WorkerRequest) => {
      const wanted = expectedRef.current;
      return !!wanted && wanted.requestId === request.requestId && wanted.revision === request.revision && sameTarget(wanted, request) && sameTarget(targetRef.current, request) && snapshotRef.current.session.status === "active";
    },
  };
}

const WorkspaceContext = createContext<ReturnType<typeof useWorkspace> | null>(null);

export function AgentTalkieProvider({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspace();
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

export function useAgentTalkie() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("AgentTalkieProvider is missing.");
  return context;
}
