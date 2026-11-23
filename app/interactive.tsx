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
      const start = String(data.get("start"));
      const count = Number(data.get("weeks") ?? 1);
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(start);
      if (!match || !Number.isInteger(count) || count < 1 || count > 8) {
        return { message: "Choose a date, time, and one to eight weeks.", error: true };
      }
      const [, year, month, day, hour, minute] = match.map(Number);
      data.delete("starts");
      for (let week = 0; week < count; week++) {
        const date = new Date(year, month - 1, day + week * 7, hour, minute);
        if (!Number.isFinite(+date) || date.getHours() !== hour || date.getMinutes() !== minute) {
          return { message: "A slot falls in a local clock change. Choose another time.", error: true };
        }
        data.append("starts", date.toISOString());
      }
    }
    return action(previous, data);
  }, { message: "" });

  return <form onSubmit={(event) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => run(data));
  }}>
    <fieldset disabled={pending} aria-busy={pending}>{children}</fieldset>
    {pending ? <p role="status">Saving…</p> : state.message && <p role={state.error ? "alert" : "status"}>{state.message}</p>}
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
