import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";

const FLOW = ["submitted", "in_review", "pending", "completed"];

// Staff screen text: [中文, English]
const AD = {
  apps: ["申请", "Applications"],
  chats: ["聊天", "Chats"],
  all: ["全部", "All"],
  unpaid: ["未付款", "Unpaid"],
  search: ["搜索姓名、编号或护照号", "Search name, reference or passport"],
  none: ["没有符合条件的申请。", "No applications match."],
  noChats: ["还没有客户消息。", "No customer messages yet."],
  status: ["状态", "Status"],
  paid: ["已付款（归还护照后）", "Paid (after passport returned)"],
  markPaid: ["标记为已付款", "Mark as paid"],
  markUnpaid: ["改为未付款", "Mark as unpaid"],
  docs: ["文件", "Documents"],
  open: ["查看", "Open"],
  noDocs: ["没有文件。", "No documents."],
  msgCustomer: ["给客户发消息", "Message customer"],
  passport: ["护照号", "Passport"],
  arrival: ["入境日期", "Arrival"],
  fee: ["费用", "Fee"],
  submitted: ["提交于", "Submitted"],
  back: ["返回", "Back"],
  reply: ["回复客户…", "Reply to customer…"],
  send: ["发送", "Send"],
  saved: ["已保存", "Saved"],
  err: ["出错了：", "Something went wrong: "],
  waiting: ["等待回复", "Waiting for reply"],
  s_submitted: ["已提交", "Submitted"],
  s_in_review: ["审核中", "Under review"],
  s_pending: ["待处理", "Pending"],
  s_completed: ["已完成", "Completed"],
  v_tourist: ["旅游签证", "Tourist visa"],
  v_business: ["商务签证", "Business visa"],
  v_work: ["工作签证", "Work visa"],
  v_extension: ["签证延期", "Visa extension"],
  v_overstay: ["逾期处理", "Overstay & penalty"],
};

export default function Admin({ lang, t }) {
  const a = (k) => (AD[k] ? AD[k][lang === "zh" ? 0 : 1] : k);
  const [view, setView] = useState("apps");
  const [threadFor, setThreadFor] = useState(null); // customer user_id
  const [apps, setApps] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [names, setNames] = useState({});
  const [msg, setMsg] = useState("");

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2000); };

  useEffect(() => {
    supabase.from("applications").select("*").order("created_at", { ascending: false }).then(({ data }) => setApps(data || []));
    supabase.from("messages").select("*").order("created_at").then(({ data }) => setMsgs(data || []));
    supabase.from("profiles").select("id, full_name").then(({ data }) => {
      const m = {}; (data || []).forEach((p) => { m[p.id] = p.full_name; }); setNames(m);
    });
    const ch = supabase.channel("admin-msgs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) =>
        setMsgs((x) => (x.some((y) => y.id === p.new.id) ? x : [...x, p.new])))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const nameOf = (uid) => names[uid] || apps.find((x) => x.user_id === uid)?.name_en || uid.slice(0, 6);
  const waiting = useMemo(() => {
    const last = {};
    msgs.forEach((m) => { last[m.user_id] = m; });
    return Object.values(last).filter((m) => !m.from_staff).length;
  }, [msgs]);

  if (threadFor) {
    return <Thread a={a} uid={threadFor} name={nameOf(threadFor)} msgs={msgs.filter((m) => m.user_id === threadFor)}
      onBack={() => setThreadFor(null)} onSent={(m) => setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]))} />;
  }

  return (
    <>
      <div className="top"><h1>{view === "apps" ? a("apps") : a("chats")}</h1></div>
      <div className="chips" style={{ paddingTop: 12 }}>
        <button className={"chip" + (view === "apps" ? " on" : "")} onClick={() => setView("apps")}>{a("apps")}</button>
        <button className={"chip" + (view === "chats" ? " on" : "")} onClick={() => setView("chats")}>{a("chats")}{waiting > 0 ? ` (${waiting})` : ""}</button>
      </div>
      {msg && <div className="pad" style={{ paddingTop: 0 }}><div className="ok">{msg}</div></div>}
      {view === "apps"
        ? <AppList a={a} apps={apps} setApps={setApps} flash={flash} openChat={(uid) => setThreadFor(uid)} />
        : <ChatList a={a} msgs={msgs} nameOf={nameOf} open={setThreadFor} />}
    </>
  );
}

/* ---------- Applications ---------- */
function AppList({ a, apps, setApps, flash, openChat }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  const [sel, setSel] = useState(null);

  const list = apps.filter((x) => {
    const hit = (x.name_en + (x.name_zh || "") + x.ref + x.passport_no).toLowerCase().includes(q.toLowerCase());
    const ok = f === "all" || (f === "unpaid" ? !x.paid : x.status === f);
    return hit && ok;
  });

  async function update(id, patch) {
    const { error } = await supabase.from("applications").update(patch).eq("id", id);
    if (error) { flash(a("err") + error.message); return; }
    setApps(apps.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    flash(a("saved"));
  }

  if (sel) {
    const app = apps.find((x) => x.id === sel);
    return <Detail a={a} app={app} update={update} onBack={() => setSel(null)} openChat={openChat} />;
  }

  return (
    <>
      <div className="pad" style={{ paddingBottom: 8 }}>
        <label className="field" style={{ marginBottom: 0 }}><input placeholder={a("search")} value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <div className="chips">
        {["all", ...FLOW, "unpaid"].map((s) => (
          <button key={s} className={"chip" + (f === s ? " on" : "")} onClick={() => setF(s)}>{s === "all" ? a("all") : s === "unpaid" ? a("unpaid") : a("s_" + s)}</button>
        ))}
      </div>
      <div className="pad" style={{ paddingTop: 0 }}>
        {list.length === 0 && <p className="mute">{a("none")}</p>}
        {list.map((x) => (
          <button key={x.id} className="card" style={{ width: "100%", textAlign: "left" }} onClick={() => setSel(x.id)}>
            <div className="row"><b className="grow">{x.name_en} {x.name_zh}</b><span className="pill">{a("s_" + x.status)}</span></div>
            <div className="mute" style={{ marginTop: 4 }}>{a("v_" + x.visa_type)} · {x.ref} · {x.created_at.slice(0, 10)}</div>
            {!x.paid && x.status === "completed" && <div className="pill warn" style={{ display: "inline-block", marginTop: 8 }}>{a("unpaid")}</div>}
            {x.paid && <div className="pill ok" style={{ display: "inline-block", marginTop: 8 }}>$ {x.fee}</div>}
          </button>
        ))}
      </div>
    </>
  );
}

function Detail({ a, app, update, onBack, openChat }) {
  const [docs, setDocs] = useState(null);
  useEffect(() => {
    supabase.from("documents").select("*").eq("application_id", app.id).then(({ data }) => setDocs(data || []));
  }, [app.id]);

  async function view(path) {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60);
    if (!error) window.open(data.signedUrl, "_blank", "noopener");
  }

  const rows = [
    [a("passport"), app.passport_no], [a("arrival"), app.arrival_date],
    [a("fee"), "$" + app.fee], [a("submitted"), app.created_at.slice(0, 10)],
  ];

  return (
    <>
      <div className="top"><button onClick={onBack} aria-label={a("back")}>‹</button><h1>{app.name_en} {app.name_zh}</h1></div>
      <div className="pad">
        <div className="card">
          <div className="mute" style={{ marginBottom: 8 }}>{a("v_" + app.visa_type)} · {app.ref}</div>
          {rows.map(([k, v]) => <div key={k} className="row" style={{ padding: "3px 0" }}><span className="grow mute">{k}</span><b>{v}</b></div>)}
        </div>

        <div className="card">
          <b>{a("status")}</b>
          <div className="chips" style={{ padding: "10px 0 0" }}>
            {FLOW.map((s) => <button key={s} className={"chip" + (app.status === s ? " on" : "")} onClick={() => app.status !== s && update(app.id, { status: s })}>{a("s_" + s)}</button>)}
          </div>
        </div>

        <div className="card">
          <div className="row"><b className="grow">{a("paid")}</b><span className={"pill " + (app.paid ? "ok" : "warn")}>{app.paid ? "✓" : "—"}</span></div>
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => update(app.id, { paid: !app.paid })}>{app.paid ? a("markUnpaid") : a("markPaid")}</button>
        </div>

        <div className="card">
          <b>{a("docs")}</b>
          {docs && docs.length === 0 && <p className="mute" style={{ marginTop: 6 }}>{a("noDocs")}</p>}
          {(docs || []).map((d) => (
            <div key={d.id} className="row" style={{ padding: "8px 0" }}>
              <span className="grow">{d.kind}</span>
              <button className="pill" onClick={() => view(d.path)}>{a("open")}</button>
            </div>
          ))}
        </div>

        <button className="btn" onClick={() => openChat(app.user_id)}>{a("msgCustomer")}</button>
      </div>
    </>
  );
}

/* ---------- Chats ---------- */
function ChatList({ a, msgs, nameOf, open }) {
  const threads = useMemo(() => {
    const m = {};
    msgs.forEach((x) => { m[x.user_id] = x; });
    return Object.values(m).sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
  }, [msgs]);
  return (
    <div className="pad" style={{ paddingTop: 0 }}>
      {threads.length === 0 && <p className="mute">{a("noChats")}</p>}
      {threads.map((m) => (
        <button key={m.user_id} className="card" style={{ width: "100%", textAlign: "left" }} onClick={() => open(m.user_id)}>
          <div className="row"><b className="grow">{nameOf(m.user_id)}</b>{!m.from_staff && <span className="pill warn">{a("waiting")}</span>}</div>
          <div className="mute" style={{ marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.from_staff ? "→ " : ""}{m.body}</div>
        </button>
      ))}
    </div>
  );
}

function Thread({ a, uid, name, msgs, onBack, onSent }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText(""); setErr("");
    const { data, error } = await supabase.from("messages").insert({ user_id: uid, from_staff: true, body }).select().single();
    if (error) setErr(a("err") + error.message); else onSent(data);
  }

  return (
    <div className="chat">
      <div className="top"><button onClick={onBack} aria-label={a("back")}>‹</button><h1>{name}</h1></div>
      <div className="msgs">
        {msgs.map((m) => <div key={m.id} className={"bubble" + (m.from_staff ? " me" : "")}>{m.body}</div>)}
        {err && <div className="err">{err}</div>}
        <div ref={end} />
      </div>
      <form className="compose" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={a("reply")} />
        <button>{a("send")}</button>
      </form>
    </div>
  );
}
