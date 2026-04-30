// Shared components — SEJFA app admin dashboard
// Global-scope: all components are attached to window at the end.

const { useState, useEffect, useRef } = React;

// ---- Sidebar ----
function AppSidebar({ route, onNav }) {
  const items = [
    { id: "dashboard", label: "Dashboard", icon: "layout-grid" },
    { id: "newsflash", label: "Newsflash", icon: "newspaper" },
    { id: "expenses",  label: "Expenses",  icon: "receipt" },
    { id: "monitor",   label: "Monitor",   icon: "activity" },
    { id: "admin",     label: "Admin",     icon: "shield" },
  ];
  return (
    <aside className="app-side">
      <div className="app-side-brand">
        <img src="../../assets/logo-mark.svg" width="24" height="24" />
        <div>
          <div className="brand-wm">SEJFA</div>
          <div className="brand-tag">v1.4.0 · prod</div>
        </div>
      </div>
      <nav className="app-side-nav">
        {items.map(it => (
          <a key={it.id}
             className={"app-side-link" + (route === it.id ? " active" : "")}
             onClick={() => onNav(it.id)}>
            <i data-lucide={it.icon}></i>
            <span>{it.label}</span>
          </a>
        ))}
      </nav>
      <div className="app-side-foot">
        <div className="meta">LOGGED IN AS</div>
        <div className="kv"><span>simon</span><span className="ok-dot" /></div>
      </div>
    </aside>
  );
}

// ---- Top bar ----
function AppTopbar({ title, crumb }) {
  return (
    <header className="app-top">
      <div className="app-top-crumb">
        <span className="meta">{crumb}</span>
        <span className="meta sep">/</span>
        <span className="ty-h3">{title}</span>
      </div>
      <div className="app-top-right">
        <button className="btn-ghost"><i data-lucide="search"></i></button>
        <button className="btn-ghost"><i data-lucide="bell"></i></button>
        <div className="avatar">SF</div>
      </div>
    </header>
  );
}

// ---- KPI card ----
function KPI({ label, value, sub, tone="default", spark }) {
  return (
    <div className={"kpi kpi-"+tone}>
      <div className="meta">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
      {spark && (
        <div className="spark">
          {spark.map((h,i) => <i key={i} style={{height: (h*100)+"%"}} />)}
        </div>
      )}
    </div>
  );
}

// ---- Status pill ----
function StatusPill({ status, children }) {
  return <span className={"pill pill-"+status}>
    <span className="pill-dot" />{children || status.toUpperCase()}
  </span>;
}

// ---- Button ----
function Button({ variant="primary", children, icon, ...p }) {
  return <button className={"btn btn-"+variant} {...p}>
    {icon && <i data-lucide={icon}></i>}
    {children}
  </button>;
}

// ---- Table ----
function Table({ cols, rows }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ---- Panel ----
function Panel({ title, meta, children, action }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <div className="ty-h4">{title}</div>
          {meta && <div className="meta">{meta}</div>}
        </div>
        {action}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

// ---- Input field ----
function Field({ label, value, onChange, error, placeholder, icon }) {
  return (
    <label className="field">
      <span className="meta">{label}</span>
      <span className={"field-in" + (error ? " err" : "")}>
        {icon && <i data-lucide={icon}></i>}
        <input value={value||""} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder}/>
      </span>
      {error && <span className="field-err">{error}</span>}
    </label>
  );
}

// expose
Object.assign(window, { AppSidebar, AppTopbar, KPI, StatusPill, Button, Table, Panel, Field });
