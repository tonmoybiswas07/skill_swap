"use client";

import { startTransition, useActionState, useSyncExternalStore, type ReactNode } from "react";
import type { Result } from "./actions";

export function ActionForm({ action, children, localTime = false }: {
  action: (state: Result, data: FormData) => Promise<Result>;
  children: ReactNode;
  localTime?: boolean;
}) {
  const [state, run, pending] = useActionState(async (previous: Result, data: FormData) => {
    if (localTime) {
      const date = new Date(String(data.get("start")));
      if (!Number.isFinite(+date)) return { message: "Choose a date and time.", error: true };
      data.set("start", date.toISOString());
    }
    return action(previous, data);
  }, { message: "" });

  return <form onSubmit={(event) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => run(data));
  }}>
    <fieldset disabled={pending}>{children}</fieldset>
    {state.message && <p role={state.error ? "alert" : "status"}>{state.message}</p>}
  </form>;
}

const subscribe = () => () => {};
const browserReady = () => true;
const serverReady = () => false;

export function LocalTime({ start, end }: { start: string; end?: string }) {
  const ready = useSyncExternalStore(subscribe, browserReady, serverReady);
  if (!ready) {
    const utc = (iso: string) => iso.slice(0, 16).replace("T", " ");
    return <time dateTime={start}>{end ? `${utc(start)} – ${utc(end)} UTC` : `${utc(start)} UTC`}</time>;
  }
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatter = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone });
  return <time dateTime={start}>{end ? formatter.formatRange(new Date(start), new Date(end)) : formatter.format(new Date(start))} ({timeZone})</time>;
}
