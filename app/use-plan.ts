"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizePlan, type Plan } from "../lib/plan-model.mjs";

type Backup = { plan: Plan; baseRevision: number; dirty: boolean };
export type SaveState =
  "loading" | "saved" | "saving" | "pending" | "conflict" | "unavailable";

/** A failed read never authorizes a write. Only an explicit edit enters the save queue. */
export function usePlan(initial: Plan) {
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
  const storageKey = "semester-navigator-v2:" + initial.profileId;

  const backup = useCallback(
    (value: Plan, dirty: boolean) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            plan: value,
            baseRevision: revision.current,
            dirty,
          }),
        );
      } catch {
        setError(
          "This browser cannot keep an offline copy. Export a backup if saving fails.",
        );
      }
    },
    [storageKey],
  );

  const load = useCallback(
    async (discardPending = false) => {
      if (inFlight.current) {
        setError("Wait for the current save to finish before reloading.");
        return;
      }
      const generation = ++loadGeneration.current;
      writable.current = false;
      setStatus("loading");
      let local: Backup | null = null;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Backup;
          local = {
            plan: normalizePlan(parsed.plan, initial.profileId),
            baseRevision: parsed.baseRevision,
            dirty: parsed.dirty === true,
          };
        }
      } catch {
        setError(
          "An unreadable device backup was ignored. Your saved plan has not been changed.",
        );
      }
      try {
        const response = await fetch("/api/plan", { cache: "no-store" });
        if (!response.ok)
          throw new Error(
            "Your saved plan could not be loaded. Try again before making changes.",
          );
        const result = (await response.json()) as {
          plan: unknown;
          revision: number;
        };
        const server = normalizePlan(result.plan, initial.profileId);
        if (!Number.isInteger(result.revision))
          throw new Error("The server returned an invalid saved version.");
        if (!mounted.current || generation !== loadGeneration.current) return;
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
          backup(server, false);
        }
      } catch (cause) {
        if (!mounted.current || generation !== loadGeneration.current) return;
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
      }
    },
    [backup, initial.profileId, storageKey],
  );

  useEffect(() => {
    mounted.current = true;
    // Loading this external store also moves the UI into a read-only loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      mounted.current = false;
      loadGeneration.current += 1;
    };
  }, [load]);

  const flush = useCallback(async () => {
    if (!writable.current || inFlight.current || !pending.current) return;
    inFlight.current = true;
    let failed = false;
    try {
      while (pending.current && mounted.current) {
        const sentSequence = sequence.current;
        const sentPlan = current.current;
        setStatus("saving");
        const response = await fetch("/api/plan", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            plan: sentPlan,
            baseRevision: revision.current,
          }),
        });
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
        const result = (await response.json()) as {
          plan: unknown;
          revision: number;
        };
        if (!Number.isInteger(result.revision))
          throw new Error(
            "The server did not confirm a saved version. Reload before retrying.",
          );
        const saved = normalizePlan(result.plan, initial.profileId);
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
      }
    } catch (cause) {
      failed = true;
      if (writable.current) setStatus("pending");
      setError(
        cause instanceof Error
          ? cause.message
          : "Saving failed. Export a backup and retry.",
      );
      backup(current.current, true);
    } finally {
      inFlight.current = false;
      if (failed) pending.current = true;
    }
  }, [backup, initial.profileId]);

  const edit = useCallback(
    (change: (value: Plan) => Plan) => {
      if (!writable.current)
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
      sequence.current += 1;
      pending.current = true;
      current.current = next;
      setPlan(next);
      backup(next, true);
      void flush();
    },
    [backup, flush, initial.profileId],
  );

  return {
    plan,
    status,
    error,
    edit,
    retry: flush,
    reload: load,
    canEdit: !["loading", "unavailable", "conflict"].includes(status),
  };
}
