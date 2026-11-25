import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ApiError,
  cancelJob,
  changePassword,
  csvUrl,
  deleteAccount,
  forgotPassword,
  getJobResult,
  getSession,
  listJobs,
  login,
  logout,
  openJobEvents,
  register,
  resetPassword,
  retryJob,
  uploadFiles,
  type JobBundle,
  type JobResult,
  type User,
} from "./api";

type Mode = "login" | "register" | "forgot" | "reset";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>(
    new URLSearchParams(location.search).has("token") ? "reset" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getSession()
      .then((session) => setUser(session?.user ?? null))
      .catch((reason: unknown) => setError(messageFor(reason)))
      .finally(() => setLoading(false));
  }, []);

  async function submitAuth(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      if (mode === "register") {
        const session = await register(email, password);
        setUser(session.user);
      } else if (mode === "login") {
        const session = await login(email, password);
        setUser(session.user);
      } else if (mode === "forgot") {
        await forgotPassword(email);
        setMessage("If an account exists, reset instructions are available.");
      } else {
        const token = new URLSearchParams(location.search).get("token") ?? "";
        await resetPassword(token, password);
        setMode("login");
        setMessage("Password reset. Sign in with the new password.");
      }
    } catch (reason) {
      setError(messageFor(reason));
    }
  }

  if (loading) return <main className="center">Loading…</main>;

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">Invoice extraction</p>
          <h1>{titleFor(mode)}</h1>
          <form onSubmit={submitAuth}>
            {mode !== "reset" && (
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
            )}
            {mode !== "forgot" && (
              <label>
                {mode === "reset" ? "New password" : "Password"}
                <input
                  type="password"
                  minLength={12}
                  value={password}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
            )}
            {error && <p className="error">{error}</p>}
            {message && <p className="success">{message}</p>}
            <button type="submit">{buttonFor(mode)}</button>
          </form>
          <nav className="auth-links">
            {mode !== "login" && (
              <button type="button" onClick={() => setMode("login")}>Sign in</button>
            )}
            {mode !== "register" && (
              <button type="button" onClick={() => setMode("register")}>Create account</button>
            )}
            {mode !== "forgot" && (
              <button type="button" onClick={() => setMode("forgot")}>Reset password</button>
            )}
          </nav>
        </section>
      </main>
    );
  }

  return (
    <Dashboard
      user={user}
      onSignedOut={() => setUser(null)}
    />
  );
}

function Dashboard({
  user,
  onSignedOut,
}: {
  user: User;
  onSignedOut: () => void;
}) {
  const [jobs, setJobs] = useState<JobBundle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [streamState, setStreamState] = useState("disconnected");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const streamRef = useRef<EventSource | null>(null);

  const refresh = async () => {
    const nextJobs = await listJobs();
    setJobs(nextJobs);
    if (!selectedId && nextJobs[0]) setSelectedId(nextJobs[0].job.id);
  };

  useEffect(() => {
    refresh().catch((reason: unknown) => setError(messageFor(reason)));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    getJobResult(selectedId)
      .then(setResult)
      .catch((reason: unknown) => setError(messageFor(reason)));
    streamRef.current?.close();
    const events = openJobEvents(selectedId);
    streamRef.current = events;
    events.onopen = () => setStreamState("connected");
    events.onerror = () => setStreamState("reconnecting");
    events.onmessage = () => {
      refresh().catch((reason: unknown) => setError(messageFor(reason)));
      getJobResult(selectedId)
        .then(setResult)
        .catch(() => undefined);
    };
    return () => events.close();
  }, [selectedId]);

  const totals = useMemo(() => {
    return jobs.reduce<Record<string, number>>((result, item) => {
      result[item.job.state] = (result[item.job.state] ?? 0) + 1;
      return result;
    }, {});
  }, [jobs]);

  const selected = jobs.find((item) => item.job.id === selectedId)?.job;
  const selectedDocuments =
    jobs.find((item) => item.job.id === selectedId)?.documents ?? [];

  async function upload(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (files.length === 0) return;
    setError("");
    try {
      const job = await uploadFiles(files);
      setSelectedId(job.id);
      setFiles([]);
      setNotice(`Queued job ${job.id.slice(0, 8)}`);
      await refresh();
    } catch (reason) {
      setError(messageFor(reason));
    }
  }

  async function perform(action: () => Promise<unknown>, success: string) {
    setError("");
    try {
      await action();
      setNotice(success);
      await refresh();
      return true;
    } catch (reason) {
      setError(messageFor(reason));
      return false;
    }
  }

  return (
    <div className="app-shell">
      <header>
        <div>
          <p className="eyebrow">Invoice extraction</p>
          <h1>Operations dashboard</h1>
        </div>
        <div className="account-bar">
          <span>{user.email}</span>
          <button
            className="secondary"
            onClick={() => perform(logout, "Signed out").then((ok) => {
              if (ok) onSignedOut();
            })}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="summary-grid">
        {["queued", "running", "succeeded", "failed", "dead_letter", "cancelled"].map(
          (state) => (
            <article key={state}>
              <span>{state.replace("_", " ")}</span>
              <strong>{totals[state] ?? 0}</strong>
            </article>
          ),
        )}
      </section>

      {error && <p className="error banner">{error}</p>}
      {notice && <p className="success banner">{notice}</p>}

      <main className="dashboard-grid">
        <aside className="panel">
          <h2>Upload PDFs</h2>
          <form onSubmit={upload}>
            <input
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
            <button type="submit" disabled={files.length === 0}>Queue extraction</button>
          </form>

          <h2>Jobs</h2>
          <div className="job-list">
            {jobs.map(({ job }) => (
              <button
                type="button"
                key={job.id}
                className={job.id === selectedId ? "job selected" : "job"}
                onClick={() => setSelectedId(job.id)}
              >
                <strong>{job.id.slice(0, 8)}</strong>
                <span>{job.state}</span>
                <small>{new Date(job.createdAt).toLocaleString()}</small>
              </button>
            ))}
            {jobs.length === 0 && <p className="muted">No jobs yet.</p>}
          </div>
        </aside>

        <section className="panel detail">
          {selected ? (
            <>
              <div className="detail-heading">
                <div>
                  <p className="eyebrow">Job {selected.id}</p>
                  <h2>{selected.state}</h2>
                </div>
                <span className={`stream ${streamState}`}>{streamState}</span>
              </div>

              <div className="meta-grid">
                <span>Attempt {selected.attempt}/{selected.maxAttempts}</span>
                <span>Lease {selected.workerId ?? "none"}</span>
                <span>Updated {new Date(selected.updatedAt).toLocaleTimeString()}</span>
              </div>

              <div className="actions">
                <button
                  className="secondary"
                  onClick={() => perform(() => retryJob(selected.id), "Job queued for retry")}
                >
                  Retry
                </button>
                <button
                  className="danger"
                  onClick={() => perform(() => cancelJob(selected.id), "Cancellation requested")}
                >
                  Cancel
                </button>
                {selected.state === "succeeded" && (
                  <a className="button" href={csvUrl(selected.id)}>Download CSV</a>
                )}
              </div>

              <h3>Documents</h3>
              <table>
                <thead>
                  <tr><th>File</th><th>State</th><th>Warning/error</th></tr>
                </thead>
                <tbody>
                  {selectedDocuments.map((document) => (
                    <tr key={document.id}>
                      <td>{document.sourceFile}</td>
                      <td>{document.state}</td>
                      <td>{String(document.record?.validation_warnings ?? document.error ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3>Extracted records</h3>
              <div className="records">
                {result?.records.map((record, index) => (
                  <pre key={index}>{JSON.stringify(record, null, 2)}</pre>
                ))}
                {!result?.records.length && <p className="muted">No completed records.</p>}
              </div>
            </>
          ) : (
            <p className="muted">Select a job to inspect it.</p>
          )}
        </section>
      </main>

      <section className="panel account-panel">
        <h2>Account</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            perform(
              () => changePassword(currentPassword, newPassword),
              "Password changed; sign in again",
            ).then((ok) => {
              if (ok) {
                setCurrentPassword("");
                setNewPassword("");
                onSignedOut();
              }
            });
          }}
        >
          <label>
            Current password
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </label>
          <label>
            New password
            <input type="password" minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </label>
          <button type="submit">Change password</button>
        </form>
        <button
          className="danger"
          onClick={() => {
            if (confirm("Delete this account and revoke access to all jobs?")) {
              deleteAccount().then(onSignedOut).catch((reason: unknown) => setError(messageFor(reason)));
            }
          }}
        >
          Delete account
        </button>
      </section>
    </div>
  );
}

function titleFor(mode: Mode): string {
  if (mode === "register") return "Create account";
  if (mode === "forgot") return "Reset password";
  if (mode === "reset") return "Choose a new password";
  return "Sign in";
}

function buttonFor(mode: Mode): string {
  if (mode === "register") return "Create account";
  if (mode === "forgot") return "Send reset instructions";
  if (mode === "reset") return "Set password";
  return "Sign in";
}

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
