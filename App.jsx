import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { STR, VISA_TYPES, CONTACT } from "./i18n";
import Admin from "./Admin.jsx";

const STATUS_FLOW = ["submitted", "in_review", "pending", "completed"];

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [lang, setLang] = useState(localStorage.getItem("lang") || "zh");
  const [tab, setTab] = useState("home");
  const [sub, setSub] = useState(null); // { name: "apply", visa } | { name: "track" }
  const [isAdmin, setIsAdmin] = useState(false);

  const t = (k) => (STR[k] ? STR[k][lang === "zh" ? 0 : 1] : k);
  const switchLang = () => { const n = lang === "zh" ? "en" : "zh"; setLang(n); localStorage.setItem("lang", n); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setIsAdmin(false);
    if (!session) return;
    supabase.from("profiles").select("is_admin").eq("id", session.user.id).single()
      .then(({ data }) => setIsAdmin(!!data?.is_admin));
  }, [session?.user?.id]);

  if (session === undefined) return null;
  if (!session) return <div className="shell"><Auth t={t} lang={lang} switchLang={switchLang} /></div>;

  const go = (name, extra = {}) => setSub({ name, ...extra });
  const pickTab = (x) => { setSub(null); setTab(x); };
  const user = session.user;
  const props = { t, user, lang, go, setSub, pickTab, switchLang };

  let body;
  if (sub?.name === "apply") body = <Apply {...props} visa={sub.visa} />;
  else if (sub?.name === "track") body = <Track {...props} />;
  else if (tab === "home") body = <Home {...props} />;
  else if (tab === "visa") body = <VisaList {...props} />;
  else if (tab === "chat") body = <Chat {...props} />;
  else if (tab === "admin" && isAdmin) body = <Admin t={t} lang={lang} />;
  else body = <Me {...props} />;

  return (
    <div className="shell">
      <div className="page">{body}</div>
      <nav className="tabs">
        {[["home", "home"], ["visa", "visa"], ["chat", "messages"], ["me", "me"], ...(isAdmin ? [["admin", "admin"]] : [])].map(([id, label]) => (
          <button key={id} className={!sub && tab === id ? "on" : ""} onClick={() => pickTab(id)}>{t(label)}</button>
        ))}
      </nav>
    </div>
  );
}

function Top({ title, onBack, t }) {
  return (
    <div className="top">
      {onBack && <button onClick={onBack} aria-label={t("back")}>‹</button>}
      <h1>{title}</h1>
    </div>
  );
}

/* ---------- Auth ---------- */
function Auth({ t, lang, switchLang }) {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ email: "", password: "", name: "" });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = mode === "login"
      ? await supabase.auth.signInWithPassword({ email: f.email, password: f.password })
      : await supabase.auth.signUp({ email: f.email, password: f.password, options: { data: { full_name: f.name } } });
    setBusy(false);
    if (res.error) setMsg({ err: true, text: t("error") + res.error.message });
    else if (mode === "signup" && !res.data.session) { setMsg({ text: t("checkEmail") }); setMode("login"); }
  }

  return (
    <div className="auth">
      <button className="lang" onClick={switchLang}>{lang === "zh" ? "English" : "中文"}</button>
      <h1>ChinaLink</h1>
      <p style={{ opacity: .85, margin: "4px 0 32px" }}>Sri Lanka · {t("tagline")}</p>
      <form onSubmit={submit}>
        {msg && <div className={msg.err ? "err" : "ok"}>{msg.text}</div>}
        {mode === "signup" && <label className="field"><span>{t("fullName")}</span><input value={f.name} onChange={set("name")} required /></label>}
        <label className="field"><span>{t("email")}</span><input type="email" value={f.email} onChange={set("email")} required autoComplete="email" /></label>
        <label className="field"><span>{t("password")}</span><input type="password" minLength={6} value={f.password} onChange={set("password")} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        <button className="btn" disabled={busy}>{mode === "login" ? t("login") : t("signup")}</button>
      </form>
      <button className="link" onClick={() => { setMsg(null); setMode(mode === "login" ? "signup" : "login"); }}>
        {mode === "login" ? t("toSignup") : t("toLogin")}
      </button>
    </div>
  );
}

/* ---------- Home / Visa list ---------- */
function Home({ t, user, go, pickTab }) {
  const name = user.user_metadata?.full_name || "";
  return (
    <>
      <div className="hero"><h2>{t("hello")}{name}</h2><p>{t("tagline")}</p></div>
      <div className="pad">
        <button className="card row" style={{ width: "100%", textAlign: "left" }} onClick={() => pickTab("visa")}>
          <b className="grow">{t("visa")}</b><span>›</span>
        </button>
        <button className="card row" style={{ width: "100%", textAlign: "left" }} onClick={() => go("track")}>
          <b className="grow">{t("trackApp")}</b><span>›</span>
        </button>
        <button className="btn" onClick={() => pickTab("chat")}>{t("needHelp")} {t("chatNow")}</button>
      </div>
    </>
  );
}

function VisaList({ t, go }) {
  return (
    <>
      <Top title={t("visa")} t={t} />
      <div className="pad">
        {VISA_TYPES.map((v) => (
          <button key={v.id} className="card row" style={{ width: "100%", textAlign: "left" }} onClick={() => go("apply", { visa: v })}>
            <b className="grow">{t("v_" + v.id)}</b>
            <span className="pill">${v.fee}</span><span>›</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ---------- Apply ---------- */
function Apply({ t, user, visa, setSub, go }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ passport: "", nameZh: "", nameEn: "", arrival: "" });
  const [files, setFiles] = useState({ passport: null, photo: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ref, setRef] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok1 = f.passport.trim().length >= 6 && f.nameEn.trim() && f.arrival;
  const ok2 = files.passport && files.photo;

  const pick = (k) => (e) => {
    const file = e.target.files?.[0];
    if (file && file.size > 8 * 1024 * 1024) { setErr(t("error") + "max 8 MB"); return; }
    setErr(""); setFiles({ ...files, [k]: file || null });
  };

  async function submit() {
    setBusy(true); setErr("");
    try {
      const { data: app, error } = await supabase.from("applications").insert({
        visa_type: visa.id, passport_no: f.passport.trim(), name_zh: f.nameZh.trim() || null,
        name_en: f.nameEn.trim(), arrival_date: f.arrival,
      }).select().single();
      if (error) throw error;
      for (const kind of ["passport", "photo"]) {
        const file = files[kind];
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${user.id}/${app.id}/${kind}-${Date.now()}.${ext}`;
        const up = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
        if (up.error) throw up.error;
        const ins = await supabase.from("documents").insert({ application_id: app.id, kind, path });
        if (ins.error) throw ins.error;
      }
      setRef(app.ref); setStep(4);
    } catch (e) { setErr(t("error") + e.message); }
    setBusy(false);
  }

  return (
    <>
      <Top title={`${t("apply")} · ${t("v_" + visa.id)}`} t={t} onBack={step === 4 ? () => go("track") : step > 1 ? () => setStep(step - 1) : () => setSub(null)} />
      <div className="pad">
        <div className="steps">{[1, 2, 3, 4].map((n) => <i key={n} className={step >= n ? "on" : ""} />)}</div>
        {err && <div className="err">{err}</div>}

        {step === 1 && (
          <>
            <label className="field"><span>{t("passport")}</span><input value={f.passport} onChange={set("passport")} autoCapitalize="characters" /></label>
            <label className="field"><span>{t("nameZh")}</span><input value={f.nameZh} onChange={set("nameZh")} /></label>
            <label className="field"><span>{t("nameEn")}</span><input value={f.nameEn} onChange={set("nameEn")} /></label>
            <label className="field"><span>{t("arrival")}</span><input type="date" value={f.arrival} onChange={set("arrival")} /></label>
            <button className="btn" disabled={!ok1} onClick={() => setStep(2)}>{t("next")}</button>
          </>
        )}

        {step === 2 && (
          <>
            {[["passport", "upPassport"], ["photo", "upPhoto"]].map(([k, label]) => (
              <label key={k} className={"upload" + (files[k] ? " has" : "")}>
                <b>{t(label)}</b>
                <div className="mute">{files[k] ? files[k].name : t("tapUpload")}</div>
                <input type="file" accept="image/*,application/pdf" onChange={pick(k)} />
              </label>
            ))}
            <button className="btn" disabled={!ok2} onClick={() => setStep(3)}>{t("next")}</button>
          </>
        )}

        {step === 3 && (
          <>
            <div className="card">
              <b>{t("review")}</b>
              <div className="row" style={{ marginTop: 8 }}><span className="grow">{t("v_" + visa.id)}</span></div>
              <div className="mute">{f.nameEn} · {f.passport}</div>
              <div className="row" style={{ marginTop: 8 }}><span className="grow mute">{t("fee")}</span><b>${visa.fee}</b></div>
            </div>
            <div className="ok">{t("payAfter")}</div>
            <ContactCard t={t} />
            <button className="btn" disabled={busy} onClick={submit}>{busy ? t("submitting") : t("submit")}</button>
          </>
        )}

        {step === 4 && (
          <div style={{ textAlign: "center", paddingTop: 24 }}>
            <h2>{t("done")}</h2>
            <p className="mute" style={{ margin: "10px 0 4px" }}>{t("refNo")}</p>
            <b style={{ fontSize: 20 }}>{ref}</b>
            <div style={{ height: 16 }} />
            <div className="ok">{t("payAfter")}</div>
            <ContactCard t={t} />
            <button className="btn" onClick={() => go("track")}>{t("trackApp")}</button>
          </div>
        )}
      </div>
    </>
  );
}

function WhatsAppIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path fill="#25D366" d="M16 3C8.8 3 3 8.8 3 16c0 2.3.6 4.5 1.7 6.4L3 29l6.8-1.8A13 13 0 0 0 16 29c7.2 0 13-5.8 13-13S23.2 3 16 3z" />
      <path fill="#fff" d="M22.6 19.4c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.5.1-.2.1-.4 0-.5l-1-2.3c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 1.8.8 2.5.8 3.4.7.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.200.2-1.400-.1-.1-.3-.2-.6-.4z" />
    </svg>
  );
}

function ContactCard({ t }) {
  return (
    <div className="card" style={{ textAlign: "left" }}>
      <b>{t("contactTitle")}</b>
      <p className="mute" style={{ margin: "6px 0 10px" }}>{t("contactHelp")}</p>
      <a className="btn ghost wa" href={"https://wa.me/" + CONTACT.whatsapp.replace(/\D/g, "")} target="_blank" rel="noreferrer">
        <WhatsAppIcon /> <span>{CONTACT.whatsapp}</span>
      </a>
    </div>
  );
}

/* ---------- Track ---------- */
function Track({ t, setSub }) {
  const [apps, setApps] = useState(null);
  useEffect(() => {
    supabase.from("applications").select("*").order("created_at", { ascending: false })
      .then(({ data }) => setApps(data || []));
  }, []);
  return (
    <>
      <Top title={t("trackApp")} t={t} onBack={() => setSub(null)} />
      <div className="pad">
        {apps && apps.length === 0 && <p className="mute">{t("noApps")}</p>}
        {(apps || []).map((a) => {
          const idx = STATUS_FLOW.indexOf(a.status);
          return (
            <div className="card" key={a.id}>
              <div className="row"><b className="grow">{t("v_" + a.visa_type)}</b>{a.paid && <span className="pill ok">{t("paid")}</span>}</div>
              <div className="mute" style={{ marginTop: 4 }}>{t("refNo")}: {a.ref} · {a.created_at.slice(0, 10)}</div>
              <div className="mute">{t("fee")}: ${a.fee}</div>
              <ul className="tl">
                {STATUS_FLOW.map((s, i) => <li key={s} className={i <= idx ? "done" : ""}><span className="dot" />{t("s_" + s)}</li>)}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------- Chat ---------- */
function Chat({ t, user }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const end = useRef(null);
  const add = (m) => setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));

  useEffect(() => {
    supabase.from("messages").select("*").eq("user_id", user.id).order("created_at").then(({ data }) => setMsgs(data || []));
    const ch = supabase.channel("msgs-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` }, (p) => add(p.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user.id]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    const { data, error } = await supabase.from("messages").insert({ user_id: user.id, body }).select().single();
    if (!error) add(data);
  }

  return (
    <div className="chat">
      <Top title={t("messages")} t={t} />
      <div className="msgs">
        {msgs.length === 0 && <div className="bubble">{t("chatEmpty")}</div>}
        {msgs.map((m) => <div key={m.id} className={"bubble" + (m.from_staff ? "" : " me")}>{m.body}</div>)}
        <div ref={end} />
      </div>
      <form className="compose" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("typeMsg")} />
        <button>{t("send")}</button>
      </form>
    </div>
  );
}

/* ---------- Me ---------- */
function Me({ t, user, lang, switchLang, go }) {
  return (
    <>
      <Top title={t("me")} t={t} />
      <div className="pad">
        <div className="card"><b>{user.user_metadata?.full_name || user.email}</b><div className="mute">{user.email}</div></div>
        <button className="card row" style={{ width: "100%" }} onClick={() => go("track")}><b className="grow">{t("trackApp")}</b><span>›</span></button>
        <button className="card row" style={{ width: "100%" }} onClick={switchLang}><b className="grow">{t("language")}</b><span className="mute">{lang === "zh" ? "中文 → English" : "English → 中文"}</span></button>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>{t("signOut")}</button>
      </div>
    </>
  );
}
