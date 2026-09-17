"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { normalizePlan, type Plan } from "../lib/plan-model.mjs";

type Backup = {
  plan: Plan;
  baseRevision: number;
  dirty: boolean;
  accountKey?: string;
};
type PlanReply = { plan: unknown; revision: number; accountKey?: unknown };
export type CloudPlanConnection = { apiUrl: string; accountKey: string };
export type SaveState =
  "loading" | "saved" | "saving" | "pending" | "conflict" | "unavailable" | "auth-required";

/** A failed read never authorizes a write. Only an explicit edit enters the save queue. */
export function usePlan(initial: Plan, refreshPaused = false, cloud?: CloudPlanConnection) {
  const [plan, setPlan] = useState(initial);
  const [status, setStatus] = useState<SaveState>("loading");
  const [error, setError] = useState("");
  const current = useRef(initial);
  const revision = useRef(0);
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const writable = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const loadGeneration = useRef(0);
  const loadCompleted = useRef(false);
  const refreshRequest = useRef<AbortController | null>(null);
  const pauseRefresh = useRef(refreshPaused);
  const authenticationLost = useRef(false);
  // A profile's recovery slot is shared across tabs. Only its writer may
  // replace a dirty snapshot with another edit. A reloaded snapshot can be
  // saved unchanged, but must be saved or explicitly discarded before editing.
  const writtenRecovery = useRef<string | null>(null);
  const loadedRecovery = useRef<string | null>(null);
  const apiUrl = cloud?.apiUrl ?? "/api/plan";
  const accountKey = cloud?.accountKey;
  const storageKey = accountKey === undefined
    ? "semester-navigator-v2:" + initial.profileId
    : "semester-navigator-cloud-v1:" + encodeURIComponent(accountKey) + ":" + encodeURIComponent(initial.profileId);

  const withRecoveryLock = useCallback(async (action: () => void) => {
    if (!navigator.locks)
      throw new Error("This browser cannot safely coordinate saved copies between tabs. Open this plan in a browser that supports Web Locks before editing.");
    await navigator.locks.request(storageKey, action);
  }, [storageKey]);

  const cancelRefresh = useCallback(() => {
    refreshRequest.current?.abort();
    refreshRequest.current = null;
  }, []);

  const requireAuthentication = useCallback(() => {
    if (authenticationLost.current || !mounted.current) return;
    authenticationLost.current = true;
    writable.current = false;
    pending.current = false;
    loadGeneration.current += 1;
    cancelRefresh();
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // This copy must not be read again, even when browser storage is unavailable.
    }
    current.current = normalizePlan({ profileId: initial.profileId });
    revision.current = 0;
    setPlan(current.current);
    setError("Sign in again to open your semester.");
    setStatus("auth-required");
    window.location.replace("/cloud");
  }, [cancelRefresh, initial.profileId, storageKey]);

  const backup = useCallback(
    (value: Plan, dirty: boolean, preserveDirty = false, discardRecovery?: string | null) => {
      if (authenticationLost.current) return false;
      try {
        const existing = localStorage.getItem(storageKey);
        if (existing && existing !== discardRecovery) {
          let existingDirty;
          try {
            existingDirty = JSON.parse(existing)?.dirty === true;
          } catch {
            // Do not silently destroy a recovery copy we cannot inspect.
            return !dirty;
          }
          if (existingDirty) {
            if (dirty && existing !== writtenRecovery.current) return false;
            if (!dirty && (preserveDirty ||
              (existing !== writtenRecovery.current && existing !== loadedRecovery.current))) return true;
          }
        }
        const encoded = JSON.stringify({
          plan: value,
          baseRevision: revision.current,
          dirty,
          ...(accountKey === undefined ? {} : { accountKey }),
        });
        localStorage.setItem(
          storageKey,
          encoded,
        );
        writtenRecovery.current = dirty ? encoded : null;
        loadedRecovery.current = dirty ? encoded : null;
        return true;
      } catch {
        throw new Error("This browser cannot keep a recovery copy. Enable browser storage before editing, or export your pending copy before leaving.");
      }
    },
    [accountKey, storageKey],
  );

  const load = useCallback(
    async (discardPending = false) => {
      if (authenticationLost.current) return;
      if (accountKey !== undefined && apiUrl !== "/api/plan?profileId=" + encodeURIComponent(initial.profileId)) {
        requireAuthentication();
        return;
      }
      if (inFlight.current) {
        setError("Wait for the current save to finish before reloading.");
        return;
      }
      cancelRefresh();
      const generation = ++loadGeneration.current;
      writable.current = false;
      setStatus("loading");
      let local: Backup | null = null;
      let localRaw: string | null = null;
      loadedRecovery.current = null;
      try {
        const raw = localStorage.getItem(storageKey);
        localRaw = raw;
        if (raw) {
          const parsed = JSON.parse(raw) as Backup;
          if (accountKey !== undefined && parsed.accountKey !== accountKey)
            throw new Error("The device backup belongs to a different account.");
          local = {
            plan: normalizePlan(parsed.plan, initial.profileId),
            baseRevision: parsed.baseRevision,
            dirty: parsed.dirty === true,
          };
          if (local.dirty) loadedRecovery.current = raw;
        }
      } catch {
        setError(
          "An unreadable device backup was ignored. Your saved plan has not been changed.",
        );
      }
      try {
        const response = await fetch(apiUrl, {
          cache: "no-store",
          ...(accountKey === undefined ? {} : { headers: { "x-semester-account-key": accountKey } }),
        });
        if (!mounted.current || generation !== loadGeneration.current || authenticationLost.current) return;
        if (accountKey !== undefined && [401, 403].includes(response.status)) {
          requireAuthentication();
          return;
        }
        if (!response.ok)
          throw new Error(
            "Your saved plan could not be loaded. Try again before making changes.",
          );
        const result = (await response.json()) as PlanReply;
        if (!mounted.current || generation !== loadGeneration.current || authenticationLost.current) return;
        if (accountKey !== undefined && result?.accountKey !== accountKey) {
          requireAuthentication();
          return;
        }
        const server = normalizePlan(result.plan, initial.profileId);
        if (!Number.isInteger(result.revision))
          throw new Error("The server returned an invalid saved version.");
        if (!mounted.current || generation !== loadGeneration.current || authenticationLost.current) return;
        await withRecoveryLock(() => {
          if (!mounted.current || generation !== loadGeneration.current || authenticationLost.current) return;
          writable.current = true;
          if (local?.dirty && !discardPending) {
            current.current = local.plan;
            revision.current = local.baseRevision;
            pending.current = true;
            setPlan(local.plan);
            setStatus(
              local.baseRevision === result.revision ? "pending" : "conflict",
            );
            if (local.baseRevision !== result.revision) writable.current = false;
            setError(
              local.baseRevision === result.revision
                ? "Your unsaved changes are still here. Choose Save pending changes."
                : "This plan changed on another device. Export your copy before loading the latest saved plan.",
            );
          } else {
            current.current = server;
            revision.current = result.revision;
            pending.current = false;
            setPlan(server);
            setStatus("saved");
            setError("");
            backup(server, false, false, discardPending ? localRaw : undefined);
          }
        });
      } catch (cause) {
        if (!mounted.current || generation !== loadGeneration.current || authenticationLost.current) return;
        writable.current = false;
        if (local) {
          current.current = local.plan;
          setPlan(local.plan);
          revision.current = local.baseRevision;
          pending.current = local.dirty;
        }
        setStatus("unavailable");
        setError(
          cause instanceof Error
            ? cause.message
            : "Your saved plan could not be loaded.",
        );
      } finally {
        if (mounted.current && generation === loadGeneration.current)
          loadCompleted.current = true;
      }
    },
    [accountKey, apiUrl, backup, cancelRefresh, initial.profileId, requireAuthentication, storageKey, withRecoveryLock],
  );

  const refresh = useCallback(async () => {
    // Cloud account checks continue while drafts or saves are pending. Adopting
    // the returned plan remains subject to the separate guards below.
    if (
      !mounted.current || authenticationLost.current || document.visibilityState !== "visible" ||
      !loadCompleted.current ||
      refreshRequest.current
    ) return;
    if (accountKey === undefined && (
      pauseRefresh.current || !writable.current || pending.current || inFlight.current
    )) return;
    const controller = new AbortController();
    refreshRequest.current = controller;
    const generation = loadGeneration.current;
    const checkedSequence = sequence.current;
    const checkedRevision = revision.current;
    try {
      const response = await fetch(apiUrl, {
        cache: "no-store",
        signal: controller.signal,
        ...(accountKey === undefined ? {} : { headers: { "x-semester-account-key": accountKey } }),
      });
      if (!mounted.current || refreshRequest.current !== controller || authenticationLost.current) return;
      if (accountKey !== undefined && [401, 403].includes(response.status)) {
        requireAuthentication();
        return;
      }
      if (!response.ok) return;
      const result = (await response.json()) as PlanReply;
      if (!mounted.current || refreshRequest.current !== controller || authenticationLost.current) return;
      if (accountKey !== undefined && result?.accountKey !== accountKey) {
        requireAuthentication();
        return;
      }
      const server = normalizePlan(result.plan, initial.profileId);
      await withRecoveryLock(() => {
        if (
          !Number.isInteger(result.revision) ||
          !mounted.current || refreshRequest.current !== controller ||
          pauseRefresh.current ||
          generation !== loadGeneration.current ||
          checkedSequence !== sequence.current ||
          checkedRevision !== revision.current ||
          !writable.current || pending.current || inFlight.current ||
          result.revision <= revision.current
        ) return;
        current.current = server;
        revision.current = result.revision;
        setPlan(server);
        backup(server, false, true);
      });
    } catch {
      // Keep the last confirmed view usable after a failed or cancelled check.
    } finally {
      if (refreshRequest.current === controller) refreshRequest.current = null;
    }
  }, [accountKey, apiUrl, backup, initial.profileId, requireAuthentication, withRecoveryLock]);

  // Form drafts block plan adoption, but cloud authentication must keep being
  // checked so an expired account cannot retain a private form indefinitely.
  useLayoutEffect(() => {
    pauseRefresh.current = refreshPaused;
    if (refreshPaused && accountKey === undefined) {
      cancelRefresh();
      return;
    }
    // State changes only after the asynchronous external-store read completes.
    void refresh();
  }, [accountKey, cancelRefresh, refresh, refreshPaused]);

  useEffect(() => {
    mounted.current = true;
    // Loading this external store also moves the UI into a read-only loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      mounted.current = false;
      loadGeneration.current += 1;
      cancelRefresh();
    };
  }, [cancelRefresh, load]);

  useEffect(() => {
    const check = () => { void refresh(); };
    const interval = window.setInterval(check, 15_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [refresh]);

  const flush = useCallback(async () => {
    if (authenticationLost.current || !writable.current || inFlight.current || !pending.current) return;
    inFlight.current = true;
    let failed = false;
    try {
      while (pending.current && mounted.current && !authenticationLost.current) {
        const sentSequence = sequence.current;
        const sentPlan = current.current;
        setStatus("saving");
        const response = await fetch(apiUrl, {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            ...(accountKey === undefined ? {} : { "x-semester-account-key": accountKey }),
          },
          body: JSON.stringify({
            plan: sentPlan,
            baseRevision: revision.current,
          }),
        });
        if (!mounted.current || authenticationLost.current) return;
        if (accountKey !== undefined && [401, 403].includes(response.status)) {
          requireAuthentication();
          return;
        }
        if (response.status === 409) {
          writable.current = false;
          setStatus("conflict");
          throw new Error(
            "This plan changed in another tab or device. Your edits are kept here. Export your copy, then load the latest saved plan and import the changes you want.",
          );
        }
        if (!response.ok) {
          const result = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            result.error ||
              "Saving failed. Your changes remain on this device; retry when connected.",
          );
        }
        const result = (await response.json()) as PlanReply;
        if (!mounted.current || authenticationLost.current) return;
        if (accountKey !== undefined && result?.accountKey !== accountKey) {
          requireAuthentication();
          return;
        }
        if (!Number.isInteger(result.revision))
          throw new Error(
            "The server did not confirm a saved version. Reload before retrying.",
          );
        const saved = normalizePlan(result.plan, initial.profileId);
        await withRecoveryLock(() => {
          if (!mounted.current || authenticationLost.current) return;
          revision.current = result.revision;
          pending.current = sentSequence !== sequence.current;
          current.current = pending.current
            ? {
                ...current.current,
                revision: result.revision,
                seedRevision: saved.seedRevision,
              }
            : saved;
          if (mounted.current) setPlan(current.current);
          backup(current.current, pending.current);
          if (!pending.current) {
            setStatus("saved");
            setError("");
          }
        });
      }
    } catch (cause) {
      if (!mounted.current || authenticationLost.current) return;
      failed = true;
      if (writable.current) setStatus("pending");
      setError(
        cause instanceof Error
          ? cause.message
          : "Saving failed. Export a backup and retry.",
      );
      await withRecoveryLock(() => {
        if (!mounted.current || authenticationLost.current) return;
        backup(current.current, true);
      }).catch(() => { /* Preserve the last recovery copy when storage is unavailable. */ });
    } finally {
      inFlight.current = false;
      if (failed && !authenticationLost.current) pending.current = true;
    }
  }, [accountKey, apiUrl, backup, initial.profileId, requireAuthentication, withRecoveryLock]);

  const edit = useCallback(
    async (change: (value: Plan) => Plan) => {
      setStatus((previous) => previous === "saved" ? "saving" : previous);
      try {
        await withRecoveryLock(() => {
          if (!mounted.current || authenticationLost.current || !writable.current)
            throw new Error("Load your saved plan before making changes.");
          const requested = change(current.current);
          // Imported previews may predate the last completed save. Revisions belong to
          // this store's confirmed server state, never to a student's editable input.
          const next = normalizePlan(
            {
              ...requested,
              revision: revision.current,
              seedRevision: current.current.seedRevision,
            },
            initial.profileId,
          );
          if (!backup(next, true)) {
            const message = "This browser already has unsaved changes for this student. Save the pending copy in its tab, or export it and explicitly load the latest saved plan before editing here. Your current form is still open.";
            setError(message);
            throw new Error(message);
          }
          if (accountKey === undefined) cancelRefresh();
          sequence.current += 1;
          pending.current = true;
          current.current = next;
          setPlan(next);
        });
      } catch (cause) {
        if (mounted.current && !authenticationLost.current) {
          setStatus((previous) => previous === "saving" && !inFlight.current && !pending.current ? "saved" : previous);
          setError(cause instanceof Error ? cause.message : "Your edit could not be kept safely. Try again.");
        }
        throw cause;
      }
      void flush();
    },
    [accountKey, backup, cancelRefresh, flush, initial.profileId, withRecoveryLock],
  );

  return {
    plan,
    status,
    error,
    edit,
    retry: flush,
    reload: load,
    canEdit: !["loading", "unavailable", "conflict", "auth-required"].includes(status),
  };
}
