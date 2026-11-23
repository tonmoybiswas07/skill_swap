"use client";

import { createAuthClient } from "better-auth/react";
import { useState, type FormEvent } from "react";

const auth = createAuthClient();

export default function AccountForm({ email }: { email?: string }) {
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email"));
    const password = String(fields.get("password"));
    setBusy(true);
    setMessage("");

    try {
      const result = registering
        ? await auth.signUp.email({ name: String(fields.get("name")), email, password })
        : await auth.signIn.email({ email, password });

      if (result.error) {
        setMessage(result.error.message || "Sign-in failed. Please try again.");
      } else {
        window.location.assign(registering ? "/profile" : "/");
      }
    } catch {
      setMessage("The account service is unavailable. Check the server configuration.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await auth.signOut();
      if (error) setMessage(error.message || "Sign-out failed.");
      else window.location.assign("/");
    } catch {
      setMessage("The account service is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  if (email) return <main className="account">
    <h1>Your account</h1>
    <p>{email}</p>
    <button className="primary" disabled={busy} onClick={signOut}>Sign out</button>
    {message && <p role="alert">{message}</p>}
  </main>;

  return (
    <main className="account">
      <h1>{registering ? "Create your account" : "Welcome back"}</h1>
      <form onSubmit={submit}>
        {registering && <label>Name<input name="name" autoComplete="name" required /></label>}
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" minLength={8} autoComplete={registering ? "new-password" : "current-password"} required /></label>
        <button className="primary" disabled={busy}>{registering ? "Sign up" : "Sign in"}</button>
        {message && <p role="alert">{message}</p>}
      </form>
      <button type="button" onClick={() => { setRegistering(!registering); setMessage(""); }}>
        {registering ? "I already have an account" : "Create an account"}
      </button>
    </main>
  );
}
