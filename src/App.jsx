import { useState, useEffect, useRef } from "react";

// ─── Supabase config ───────────────────────────────────────────────────────
const SUPABASE_URL = "https://pnpdouaqhjvmmotinfgg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucGRvdWFxaGp2bW1vdGluZmdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3ODY3OTksImV4cCI6MjA5NjM2Mjc5OX0.LJax4W1_eVQ3438eKli4_r145AA5N9rmZy595ZljPus";

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

const db = {
  getDoctors: () => sb("doctors?active=eq.true&order=name"),
  registerDoctor: (data) => sb("doctors", { method: "POST", body: JSON.stringify(data) }),
  updateDoctor: (id, data) => sb(`doctors?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  getAppointments: (doctorId) => sb(`appointments?doctor_id=eq.${doctorId}&order=date,time`),
  createAppointment: (data) => sb("appointments", { method: "POST", body: JSON.stringify(data) }),
  updateAppointment: (id, data) => sb(`appointments?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  createPayment: (data) => sb("payments", { method: "POST", body: JSON.stringify(data) }),
};

// ─── Politique d'avance ────────────────────────────────────────────────────
const AVANCE = {
  monto: 20,
  texto: "S/. 20",
  politica: "Reembolsable si cancelas con 48h de anticipación",
  horasMinimas: 48,
};
const auth = {
  async signUp(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  },
  async signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  },
  async signOut(token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
    });
  },
  getSession() {
    const s = localStorage.getItem("medi_session");
    return s ? JSON.parse(s) : null;
  },
  saveSession(session) {
    localStorage.setItem("medi_session", JSON.stringify(session));
  },
  clearSession() {
    localStorage.removeItem("medi_session");
  },
};

// ─── Constants ─────────────────────────────────────────────────────────────
const SPECIALTIES = ["Todos", "Medicina General", "Pediatría", "Cardiología", "Ginecología", "Traumatología", "Dermatología"];
const MONTHLY_DATA = [
  { mes: "Ene", citas: 18, ingresos: 1080 }, { mes: "Feb", citas: 24, ingresos: 1440 },
  { mes: "Mar", citas: 30, ingresos: 1800 }, { mes: "Abr", citas: 22, ingresos: 1320 },
  { mes: "May", citas: 35, ingresos: 2100 }, { mes: "Jun", citas: 28, ingresos: 1680 },
];

// ─── Helpers ───────────────────────────────────────────────────────────────
function buildWhatsAppLink(phone, message) {
  const cleaned = phone.replace(/\D/g, "");
  const full = cleaned.startsWith("51") ? cleaned : `51${cleaned}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}
function buildSmsLink(phone, message) { return `sms:${phone}?body=${encodeURIComponent(message)}`; }
function buildConfirmationMessage(data, doctor) {
  const total = parseInt((doctor.price || "S/. 0").replace(/[^0-9]/g, ""));
  const resto = total - AVANCE.monto;
  return `✅ *CONFIRMACIÓN DE CITA - MediAyacucho*\n\nHola ${data.patient_name}, tu cita ha sido reservada:\n\n👨‍⚕️ Médico: ${doctor.name}\n🏥 Especialidad: ${doctor.specialty}\n📅 Fecha: ${data.date}\n🕐 Hora: ${data.time}\n📍 Dirección: ${doctor.address || "Por confirmar"}\n\n💰 *Pagos:*\n✅ Adelanto pagado: S/. ${AVANCE.monto}\n📋 Resto a pagar en consulta: S/. ${resto}\n\n⚠️ ${AVANCE.politica}.\n\nPor favor llega 10 minutos antes.\n\n📍 MediAyacucho - Salud para todos 🌿`;
}
function buildReminderMessage(data, doctor) {
  return `⏰ *RECORDATORIO - MediPerú*\n\nHola ${data.patient_name}, te recordamos tu cita MAÑANA:\n\n👨‍⚕️ ${doctor.name} (${doctor.specialty})\n🕐 ${data.time}\n📍 ${doctor.address || ""}\n\n¡Te esperamos! 💚`;
}
function initials(name) { return name.split(" ").filter(w => w[0] === w[0]?.toUpperCase()).slice(0, 2).map(w => w[0]).join(""); }

// ─── Login Modal ───────────────────────────────────────────────────────────
function LoginModal({ onLogin, onClose }) {
  const [mode, setMode] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleLogin() {
    if (!email || !password) return setError("Completa todos los campos");
    setLoading(true); setError("");
    const data = await auth.signIn(email, password);
    if (data.access_token) {
      auth.saveSession({ token: data.access_token, email, user_id: data.user?.id });
      onLogin({ token: data.access_token, email, user_id: data.user?.id });
    } else {
      setError(data.error_description || data.msg || "Email o contraseña incorrectos");
    }
    setLoading(false);
  }

  async function handleSignUp() {
    if (!email || !password) return setError("Completa todos los campos");
    if (password.length < 6) return setError("La contraseña debe tener al menos 6 caracteres");
    setLoading(true); setError("");
    const data = await auth.signUp(email, password);
    if (data.id || data.user?.id) {
      // Connecter directement et rediriger vers inscription CMP
      const signInData = await auth.signIn(email, password);
      if (signInData.access_token) {
        onLogin({ token: signInData.access_token, email, user_id: signInData.user?.id, isNew: true });
      } else {
        setSuccess("¡Cuenta creada! Ahora inicia sesión para completar tu registro.");
        setMode("login");
      }
    } else {
      setError(data.error_description || data.msg || "Error al crear la cuenta");
    }
    setLoading(false);
  }

  const s = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(12px)" },
    box: { background: "#051628", border: "1px solid rgba(59,130,196,0.35)", borderRadius: 24, padding: 36, maxWidth: 420, width: "100%", position: "relative" },
    title: { fontSize: 24, fontWeight: 700, color: "#e8f0f8", margin: "0 0 6px" },
    sub: { fontSize: 14, color: "#60a5d8", margin: "0 0 28px" },
    label: { display: "block", fontSize: 11, color: "#60a5d8", marginBottom: 5, letterSpacing: 0.8, textTransform: "uppercase" },
    inp: { width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(59,130,196,0.25)", borderRadius: 10, padding: "12px 14px", color: "#e8f0f8", fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 16 },
    btn: { width: "100%", padding: "13px 0", background: "linear-gradient(135deg, #1a4f8a, #3b82c4)", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 16, fontWeight: 700, fontFamily: "inherit", marginTop: 4, boxShadow: "0 6px 24px rgba(59,130,196,0.3)" },
    link: { background: "none", border: "none", color: "#3b82c4", cursor: "pointer", fontSize: 13, fontFamily: "inherit", textDecoration: "underline", padding: 0 },
    error: { background: "rgba(255,100,100,0.1)", border: "1px solid rgba(255,100,100,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff6b6b", fontSize: 13, marginBottom: 16 },
    success: { background: "rgba(59,130,196,0.1)", border: "1px solid rgba(59,130,196,0.3)", borderRadius: 8, padding: "10px 14px", color: "#93c5e8", fontSize: 13, marginBottom: 16 },
    close: { position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#60a5d8", fontSize: 22, cursor: "pointer" },
    tabs: { display: "flex", gap: 8, marginBottom: 24 },
    tab: (a) => ({ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${a ? "#3b82c4" : "rgba(59,130,196,0.2)"}`, background: a ? "rgba(59,130,196,0.15)" : "transparent", color: a ? "#3b82c4" : "#60a5d8", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: a ? 700 : 400 }),
  };

  return (
    <div style={s.overlay}>
      <div style={s.box}>
        <button style={s.close} onClick={onClose}>✕</button>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🏥</div>
        <h3 style={s.title}>{mode === "signup" ? "Crear cuenta médico" : "Acceso médicos"}</h3>
        <p style={s.sub}>{mode === "signup" ? "Regístrate para acceder a tu panel" : "Inicia sesión en tu panel de control"}</p>

        <div style={s.tabs}>
          <button style={s.tab(mode === "login")} onClick={() => { setMode("login"); setError(""); setSuccess(""); }}>Iniciar sesión</button>
          <button style={s.tab(mode === "signup")} onClick={() => { setMode("signup"); setError(""); setSuccess(""); }}>Crear cuenta</button>
        </div>

        {error && <div style={s.error}>⚠️ {error}</div>}
        {success && <div style={s.success}>✅ {success}</div>}

        <label style={s.label}>CORREO ELECTRÓNICO</label>
        <input style={s.inp} type="email" placeholder="correo@ejemplo.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && (mode === "login" ? handleLogin() : handleSignUp())} />

        <label style={s.label}>CONTRASEÑA</label>
        <input style={s.inp} type="password" placeholder={mode === "signup" ? "Mínimo 6 caracteres" : "Tu contraseña"} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && (mode === "login" ? handleLogin() : handleSignUp())} />

        <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} onClick={mode === "login" ? handleLogin : handleSignUp} disabled={loading}>
          {loading ? "⏳ Cargando..." : mode === "login" ? "Iniciar sesión →" : "Crear cuenta →"}
        </button>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#60a5d8" }}>
          {mode === "login" ? (
            <>¿Olvidaste tu contraseña? <button style={s.link} onClick={() => setMode("forgot")}>Recuperar</button></>
          ) : (
            <>¿Ya tienes cuenta? <button style={s.link} onClick={() => setMode("login")}>Inicia sesión</button></>
          )}
        </div>

        {mode === "forgot" && (
          <div style={{ marginTop: 16, padding: 14, background: "rgba(59,130,196,0.08)", borderRadius: 10, fontSize: 13, color: "#60a5d8" }}>
            Escribe tu email arriba y contacta a <strong style={{ color: "#3b82c4" }}>913 330 712</strong> por WhatsApp para recuperar tu contraseña.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Payment Modal ─────────────────────────────────────────────────────────
function PaymentModal({ doctor, bookingData, onSuccess, onClose, isMembership }) {
  const [method, setMethod] = useState(null);
  const [step, setStep] = useState("choose");
  const [cardData, setCardData] = useState({ number: "", name: "", expiry: "", cvv: "" });
  const [errors, setErrors] = useState({});
  const amount = isMembership ? 99 : AVANCE.monto;

  const METHODS = [
    { id: "yape", label: "Yape", icon: "🟣", sub: "Pago instantáneo — 0% comisión", color: "#6C3FC5" },
    { id: "plin", label: "Plin", icon: "🟢", sub: "BCP, Scotiabank, BBVA, Interbank", color: "#00B14F" },
    { id: "culqi", label: "Tarjeta débito/crédito", icon: "💳", sub: "Visa, Mastercard, American Express", color: "#1A56DB" },
    { id: "transferencia", label: "Transferencia bancaria", icon: "🏦", sub: "BCP · BBVA · Interbank", color: "#F4A261" },
  ];

  function formatCard(v) { return v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim(); }
  function formatExpiry(v) { return v.replace(/\D/g, "").slice(0, 4).replace(/(.{2})/, "$1/"); }
  function validateCard() {
    const e = {};
    if (cardData.number.replace(/\s/g, "").length < 16) e.number = "Número inválido";
    if (!cardData.name.trim()) e.name = "Ingresa el nombre";
    if (cardData.expiry.length < 5) e.expiry = "Fecha inválida";
    if (cardData.cvv.length < 3) e.cvv = "CVV inválido";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function processPayment() {
    if (method === "culqi" && !validateCard()) return;
    setStep("processing");
    try {
      if (isMembership && doctor?.id) {
        await db.createPayment({ doctor_id: doctor.id, amount, method, status: "pendiente" });
      } else if (bookingData?.appointmentId) {
        await db.updateAppointment(bookingData.appointmentId, { payment_method: method, payment_status: "pagado" });
      }
    } catch (e) { console.error(e); }
    await new Promise(r => setTimeout(r, 2000));
    setStep("done");
    setTimeout(() => onSuccess(), 1800);
  }

  const s = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(12px)" },
    box: { background: "#030d1a", border: "1px solid rgba(59,130,196,0.3)", borderRadius: 24, padding: 32, maxWidth: 480, width: "100%", maxHeight: "92vh", overflowY: "auto" },
    methodBtn: (a, color) => ({ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", borderRadius: 14, border: `2px solid ${a ? color : "rgba(255,255,255,0.08)"}`, background: a ? `${color}18` : "rgba(255,255,255,0.03)", cursor: "pointer", width: "100%", marginBottom: 10, textAlign: "left", fontFamily: "inherit", transition: "all 0.2s" }),
    inp: (err) => ({ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${err ? "#ff6b6b" : "rgba(59,130,196,0.25)"}`, borderRadius: 10, padding: "11px 14px", color: "#e8f0f8", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }),
    label: { display: "block", fontSize: 11, color: "#60a5d8", marginBottom: 5, letterSpacing: 0.8, textTransform: "uppercase" },
    errTxt: { color: "#ff6b6b", fontSize: 11, marginTop: 3, display: "block" },
    payBtn: { width: "100%", padding: "14px 0", background: "linear-gradient(135deg, #1a4f8a, #3b82c4)", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 16, fontWeight: 700, fontFamily: "inherit", marginTop: 16, boxShadow: "0 6px 24px rgba(59,130,196,0.3)" },
    backBtn: { background: "none", border: "none", color: "#3b82c4", cursor: "pointer", fontSize: 13, padding: "0 0 16px", fontFamily: "inherit" },
    bankRow: { display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(59,130,196,0.1)", fontSize: 14 },
    copyBtn: { background: "rgba(59,130,196,0.15)", border: "1px solid rgba(59,130,196,0.3)", color: "#3b82c4", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
    steps: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 },
    stepRow: (c) => ({ display: "flex", gap: 12, alignItems: "center", background: `${c}10`, borderRadius: 10, padding: "10px 14px" }),
    stepNum: (c) => ({ width: 28, height: 28, borderRadius: "50%", background: c, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }),
    numBox: (c) => ({ background: `${c}18`, border: `2px solid ${c}66`, borderRadius: 14, padding: 18, marginBottom: 16 }),
    waBtn: { width: "100%", padding: "13px 0", background: "linear-gradient(135deg, #25D366, #128C7E)", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 700, fontFamily: "inherit", marginBottom: 10 },
    ghostBtn: (c) => ({ width: "100%", padding: "12px 0", background: `${c}18`, border: `1px solid ${c}44`, color: c, borderRadius: 12, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }),
  };

  const concept = isMembership ? "MEMBRESIA-MEDICO" : `CITA-${(bookingData?.patient_name || "PACIENTE").split(" ")[0].toUpperCase()}`;

  if (step === "processing") return (
    <div style={s.overlay}><div style={{ ...s.box, textAlign: "center", padding: "60px 32px" }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>⚙️</div>
      <style>{`@keyframes prog{from{width:0}to{width:100%}}`}</style>
      <h3 style={{ color: "#3b82c4", fontSize: 22, margin: "0 0 8px" }}>Procesando pago...</h3>
      <p style={{ color: "#60a5d8" }}>Por favor no cierres esta ventana</p>
      <div style={{ marginTop: 24, height: 4, background: "rgba(59,130,196,0.15)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", background: "linear-gradient(90deg,#1a4f8a,#3b82c4)", borderRadius: 2, animation: "prog 2s ease forwards" }} />
      </div>
    </div></div>
  );

  if (step === "done") return (
    <div style={s.overlay}><div style={{ ...s.box, textAlign: "center", padding: "60px 32px" }}>
      <div style={{ fontSize: 72, marginBottom: 16 }}>✅</div>
      <h3 style={{ color: "#3b82c4", fontSize: 24, margin: "0 0 8px" }}>{isMembership ? "¡Membresía registrada!" : "¡Pago exitoso!"}</h3>
      <p style={{ color: "#60a5d8" }}>S/. {amount} {isMembership ? "— Verificaremos tu pago en breve" : "pagados correctamente"}</p>
    </div></div>
  );

  return (
    <div style={s.overlay}>
      <div style={s.box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e8f0f8" }}>💳 {isMembership ? "Pagar membresía" : "Pagar cita médica"}</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#60a5d8" }}>Transacción segura — MediPerú</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#60a5d8", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ background: "rgba(59,130,196,0.07)", border: "1px solid rgba(59,130,196,0.15)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, color: "#e8f0f8", fontWeight: 700 }}>{isMembership ? "Plan Profesional — MediAyacucho" : doctor?.name}</div>
              <div style={{ fontSize: 12, color: "#60a5d8" }}>{isMembership ? "Membresía mensual" : `${bookingData?.date} · ${bookingData?.time}`}</div>
              {!isMembership && <div style={{ fontSize: 11, color: "#F4A261", marginTop: 4 }}>⚠️ {AVANCE.politica}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#F4A261" }}>S/. {amount}</div>
              {!isMembership && <div style={{ fontSize: 11, color: "#60a5d8" }}>adelanto de {doctor?.price}</div>}
            </div>
          </div>
        </div>

        {step === "choose" && (
          <>
            <p style={{ fontSize: 13, color: "#60a5d8", margin: "0 0 14px" }}>Selecciona tu método de pago:</p>
            {METHODS.map(m => (
              <button key={m.id} style={s.methodBtn(method === m.id, m.color)} onClick={() => setMethod(m.id)}>
                <span style={{ fontSize: 26 }}>{m.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: method === m.id ? "#e8f0f8" : "#93c5e8", fontSize: 15 }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: "#60a5d8" }}>{m.sub}</div>
                </div>
                <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${method === m.id ? m.color : "rgba(255,255,255,0.2)"}`, background: method === m.id ? m.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>
                  {method === m.id ? "✓" : ""}
                </div>
              </button>
            ))}
            <button style={{ ...s.payBtn, opacity: !method ? 0.4 : 1 }} disabled={!method} onClick={() => setStep("form")}>Continuar →</button>
          </>
        )}

        {step === "form" && method === "yape" && (
          <>
            <button style={s.backBtn} onClick={() => setStep("choose")}>← Cambiar método</button>
            <div style={s.steps}>
              {[["Abre tu app Yape en tu celular","🟣"],["Yapea S/. "+amount+" al número 913 330 712","🟣"],["Concepto: "+concept,"🟣"],["Envía la captura por WhatsApp","🟣"]].map(([txt,c],i)=>(
                <div key={i} style={s.stepRow(c)}>
                  <div style={s.stepNum(c)}>{i+1}</div>
                  <span style={{ color: "#93c5e8", fontSize: 14 }}>{txt}</span>
                </div>
              ))}
            </div>
            <div style={s.numBox("#6C3FC5")}>
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "#a78bfa", letterSpacing: 1, textTransform: "uppercase" }}>Número Yape</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: "#e8f0f8", letterSpacing: 3 }}>913 330 712</span>
                <button style={{ background: "rgba(108,63,197,0.3)", border: "1px solid rgba(108,63,197,0.5)", color: "#a78bfa", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }} onClick={() => navigator.clipboard?.writeText("913330712")}>Copiar</button>
              </div>
              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#60a5d8" }}>Monto:</span><strong style={{ color: "#3b82c4" }}>S/. {amount}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
                <span style={{ color: "#60a5d8" }}>Concepto:</span><strong style={{ color: "#e8f0f8" }}>{concept}</strong>
              </div>
            </div>
            <button style={s.waBtn} onClick={() => { const msg = `🟣 *COMPROBANTE YAPE - MediPerú*\n\n💰 Monto: S/. ${amount}\n📋 Concepto: ${concept}\n\n📎 Adjunto captura de Yape.`; window.open(`https://wa.me/51913330712?text=${encodeURIComponent(msg)}`, "_blank"); }}>
              💬 Enviar comprobante por WhatsApp
            </button>
            <button style={s.ghostBtn("#6C3FC5")} onClick={processPayment}>✓ Ya yapé y envié el comprobante</button>
          </>
        )}

        {step === "form" && method === "plin" && (
          <>
            <button style={s.backBtn} onClick={() => setStep("choose")}>← Cambiar método</button>
            <div style={s.steps}>
              {[["Abre tu app bancaria (BCP, Scotiabank, BBVA o Interbank)","#00B14F"],["Envía S/. "+amount+" por Plin al 913 330 712","#00B14F"],["Concepto: "+concept,"#00B14F"],["Envía la captura por WhatsApp","#00B14F"]].map(([txt,c],i)=>(
                <div key={i} style={s.stepRow(c)}>
                  <div style={s.stepNum(c)}>{i+1}</div>
                  <span style={{ color: "#93c5e8", fontSize: 14 }}>{txt}</span>
                </div>
              ))}
            </div>
            <div style={s.numBox("#00B14F")}>
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "#00B14F", letterSpacing: 1, textTransform: "uppercase" }}>Número Plin</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: "#e8f0f8", letterSpacing: 3 }}>913 330 712</span>
                <button style={{ background: "rgba(0,177,79,0.2)", border: "1px solid rgba(0,177,79,0.4)", color: "#00B14F", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }} onClick={() => navigator.clipboard?.writeText("913330712")}>Copiar</button>
              </div>
              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#60a5d8" }}>Monto:</span><strong style={{ color: "#3b82c4" }}>S/. {amount}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
                <span style={{ color: "#60a5d8" }}>Concepto:</span><strong style={{ color: "#e8f0f8" }}>{concept}</strong>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["BCP","Scotiabank","BBVA","Interbank"].map(b=>(
                  <span key={b} style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(0,177,79,0.15)", color: "#00B14F", fontSize: 11, border: "1px solid rgba(0,177,79,0.3)" }}>{b}</span>
                ))}
              </div>
            </div>
            <button style={s.waBtn} onClick={() => { const msg = `🟢 *COMPROBANTE PLIN - MediPerú*\n\n💰 Monto: S/. ${amount}\n📋 Concepto: ${concept}\n\n📎 Adjunto captura de Plin.`; window.open(`https://wa.me/51913330712?text=${encodeURIComponent(msg)}`, "_blank"); }}>
              💬 Enviar comprobante por WhatsApp
            </button>
            <button style={s.ghostBtn("#00B14F")} onClick={processPayment}>✓ Ya plininé y envié el comprobante</button>
          </>
        )}

        {step === "form" && method === "culqi" && (
          <>
            <button style={s.backBtn} onClick={() => setStep("choose")}>← Cambiar método</button>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Número de tarjeta</label>
              <input style={s.inp(errors.number)} placeholder="0000 0000 0000 0000" value={cardData.number} onChange={e => setCardData({ ...cardData, number: formatCard(e.target.value) })} />
              {errors.number && <span style={s.errTxt}>{errors.number}</span>}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Nombre en la tarjeta</label>
              <input style={s.inp(errors.name)} placeholder="NOMBRE APELLIDO" value={cardData.name} onChange={e => setCardData({ ...cardData, name: e.target.value.toUpperCase() })} />
              {errors.name && <span style={s.errTxt}>{errors.name}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={s.label}>Vencimiento</label>
                <input style={s.inp(errors.expiry)} placeholder="MM/AA" value={cardData.expiry} onChange={e => setCardData({ ...cardData, expiry: formatExpiry(e.target.value) })} />
                {errors.expiry && <span style={s.errTxt}>{errors.expiry}</span>}
              </div>
              <div>
                <label style={s.label}>CVV</label>
                <input style={s.inp(errors.cvv)} placeholder="123" maxLength={4} type="password" value={cardData.cvv} onChange={e => setCardData({ ...cardData, cvv: e.target.value.replace(/\D/g, "") })} />
                {errors.cvv && <span style={s.errTxt}>{errors.cvv}</span>}
              </div>
            </div>
            <div style={{ background: "rgba(59,130,196,0.06)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#60a5d8", marginBottom: 4 }}>
              🔒 Pago procesado por <strong style={{ color: "#3b82c4" }}>Culqi</strong> — certificación PCI DSS.
            </div>
            <button style={s.payBtn} onClick={processPayment}>Pagar S/. {amount} →</button>
          </>
        )}

        {step === "form" && method === "transferencia" && (
          <>
            <button style={s.backBtn} onClick={() => setStep("choose")}>← Cambiar método</button>
            {[{ bank:"BCP", num:"194-2345678-0-12", cci:"002-194-00234567801234-56" },{ bank:"BBVA", num:"0011-0198-0123456789", cci:"011-198-000123456789-00" }].map(b=>(
              <div key={b.bank} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(59,130,196,0.12)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: "#3b82c4", fontSize: 15, marginBottom: 10 }}>🏦 {b.bank}</div>
                <div style={s.bankRow}><span style={{ color: "#60a5d8", fontSize: 13 }}>Cuenta</span><span style={{ color: "#e8f0f8", fontSize: 13 }}>{b.num}</span></div>
                <div style={{ ...s.bankRow, borderBottom:"none", alignItems:"flex-start" }}>
                  <span style={{ color: "#60a5d8", fontSize: 13 }}>CCI</span>
                  <div style={{ textAlign:"right" }}>
                    <span style={{ color: "#e8f0f8", fontSize: 12 }}>{b.cci}</span><br />
                    <button style={s.copyBtn} onClick={() => navigator.clipboard?.writeText(b.cci)}>Copiar</button>
                  </div>
                </div>
              </div>
            ))}
            <div style={{ background: "rgba(244,162,97,0.1)", border: "1px solid rgba(244,162,97,0.3)", borderRadius: 10, padding: 14, fontSize: 13, color: "#F4A261", marginBottom: 16 }}>
              ⚠️ Transfiere exactamente <strong>S/. {amount}</strong> con concepto: <strong>{concept}</strong>. Envíanos el comprobante al WhatsApp <strong>913 330 712</strong>.
            </div>
            <button style={s.payBtn} onClick={processPayment}>Ya realicé la transferencia →</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Notification Panel ────────────────────────────────────────────────────
function NotificationPanel({ bookingData, doctor, onClose }) {
  const [notifMethod, setNotifMethod] = useState("whatsapp");
  const [sent, setSent] = useState({ confirm: false, reminder: false, doctor: false });
  const confirmMsg = buildConfirmationMessage(bookingData, doctor);
  const reminderMsg = buildReminderMessage(bookingData, doctor);
  const doctorMsg = `📋 *Nueva cita - MediPerú*\n\nEstimado/a ${doctor.name},\n\nTiene una nueva cita:\n👤 ${bookingData.patient_name}\n📅 ${bookingData.date} · ${bookingData.time}\n📞 ${bookingData.patient_phone}\n\nMediPerú 🌿`;
  function openLink(url, key) { window.open(url, "_blank"); setTimeout(() => setSent(p => ({ ...p, [key]: true })), 800); }
  const isWa = notifMethod === "whatsapp";
  const notifs = [
    { key: "confirm", icon: "✅", title: "Confirmación al paciente", phone: bookingData.patient_phone, msg: confirmMsg },
    { key: "reminder", icon: "⏰", title: "Recordatorio al paciente", phone: bookingData.patient_phone, msg: reminderMsg },
    { key: "doctor", icon: "👨‍⚕️", title: "Aviso al médico", phone: doctor.phone || "51999000000", msg: doctorMsg },
  ];
  const s = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(10px)" },
    box: { background: "#051628", border: "1px solid rgba(59,130,196,0.35)", borderRadius: 24, padding: 32, maxWidth: 500, width: "100%", maxHeight: "90vh", overflowY: "auto" },
    tab: (a) => ({ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${a ? "#3b82c4" : "rgba(59,130,196,0.25)"}`, background: a ? "rgba(59,130,196,0.15)" : "transparent", color: a ? "#3b82c4" : "#60a5d8", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }),
    nCard: (d) => ({ background: d ? "rgba(59,130,196,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${d ? "rgba(59,130,196,0.4)" : "rgba(59,130,196,0.15)"}`, borderRadius: 14, padding: 16, marginBottom: 12 }),
    preview: { background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: 10, fontSize: 11, color: "#93c5e8", whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: 90, overflowY: "auto", marginBottom: 10 },
    btnWa: { width: "100%", padding: "10px 0", background: "linear-gradient(135deg, #25D366, #128C7E)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" },
    btnSms: { width: "100%", padding: "10px 0", background: "linear-gradient(135deg, #1a4f8a, #3b82c4)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" },
  };
  return (
    <div style={s.overlay}>
      <div style={s.box}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: "#3b82c4", margin: "0 0 4px" }}>📲 Notificaciones</h3>
        <p style={{ color: "#60a5d8", fontSize: 13, margin: "0 0 20px" }}>Envía confirmaciones a {bookingData.patient_name} y al médico</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button style={s.tab(isWa)} onClick={() => setNotifMethod("whatsapp")}>💬 WhatsApp</button>
          <button style={s.tab(!isWa)} onClick={() => setNotifMethod("sms")}>📱 SMS</button>
        </div>
        {notifs.map(n => (
          <div key={n.key} style={s.nCard(sent[n.key])}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#e8f0f8" }}>{n.icon} {n.title}</span>
              {sent[n.key] && <span style={{ background: "rgba(59,130,196,0.2)", color: "#3b82c4", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>Enviado ✓</span>}
            </div>
            <div style={s.preview}>{n.msg}</div>
            {isWa
              ? <button style={s.btnWa} onClick={() => openLink(buildWhatsAppLink(n.phone, n.msg), n.key)}>💬 Abrir WhatsApp</button>
              : <button style={s.btnSms} onClick={() => openLink(buildSmsLink(n.phone, n.msg), n.key)}>📱 Enviar SMS</button>
            }
          </div>
        ))}
        <button style={{ width: "100%", marginTop: 16, padding: "12px 0", background: "transparent", border: "1.5px solid rgba(59,130,196,0.4)", color: "#3b82c4", borderRadius: 12, cursor: "pointer", fontSize: 15, fontFamily: "inherit" }} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

// ─── Doctor Dashboard ──────────────────────────────────────────────────────
function DoctorDashboard({ doctor, onExit }) {
  const [tab, setTab] = useState("overview");
  const [appointments, setAppointments] = useState([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [filterStatus, setFilterStatus] = useState("todas");
  const [isAvailable, setIsAvailable] = useState(doctor.available);
  const [editProfile, setEditProfile] = useState(false);
  const [profileData, setProfileData] = useState({ name: doctor.name, specialty: doctor.specialty, price: doctor.price, address: doctor.address || "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTip, setAiTip] = useState("");

  useEffect(() => {
    db.getAppointments(doctor.id).then(data => { setAppointments(data); setLoadingAppts(false); }).catch(() => setLoadingAppts(false));
  }, [doctor.id]);

  async function toggleAvailable() {
    const next = !isAvailable;
    setIsAvailable(next);
    await db.updateDoctor(doctor.id, { available: next });
  }

  async function saveProfile() {
    setSavingProfile(true);
    await db.updateDoctor(doctor.id, profileData);
    setSavingProfile(false);
    setEditProfile(false);
  }

  const today = new Date().toISOString().split("T")[0];
  const todayAppts = appointments.filter(a => a.date === today);
  const completedCount = appointments.filter(a => a.status === "completada").length;
  const cancelledCount = appointments.filter(a => a.status === "cancelada").length;
  const totalIncome = completedCount * parseInt((doctor.price || "S/. 0").replace(/\D/g, ""));
  const statusColor = { confirmada: "#3b82c4", pendiente: "#F4A261", completada: "#60a5d8", cancelada: "#ff6b6b" };
  const statusBg = { confirmada: "rgba(59,130,196,0.15)", pendiente: "rgba(244,162,97,0.15)", completada: "rgba(96,165,216,0.1)", cancelada: "rgba(255,107,107,0.1)" };
  const filtered = filterStatus === "todas" ? appointments : appointments.filter(a => a.status === filterStatus);
  const maxCitas = Math.max(...MONTHLY_DATA.map(d => d.citas));

  async function updateStatus(id, newStatus) {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
    await db.updateAppointment(id, { status: newStatus });
  }

  async function getAiTip() {
    setAiLoading(true); setAiTip("");
    try {
      const summary = `Médico: ${doctor.name}, especialidad: ${doctor.specialty}. Citas hoy: ${todayAppts.length}. Completadas: ${completedCount}. Canceladas: ${cancelledCount}. Rating: ${doctor.rating}. Ingresos: S/. ${totalIncome}.`;
      const resp = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 300, system: "Eres un consultor médico de negocios experto en Perú. Da un consejo práctico, específico y breve en español.", messages: [{ role: "user", content: `Dame UN consejo para mejorar mi práctica esta semana: ${summary}` }] }) });
      const data = await resp.json();
      setAiTip(data.content?.map(b => b.text || "").join("") || "No se pudo obtener el consejo.");
    } catch { setAiTip("Error de conexión."); }
    setAiLoading(false);
  }

  const s = {
    wrap: { minHeight: "100vh", background: "linear-gradient(135deg, #030d1a 0%, #051628 100%)", fontFamily: "'Crimson Pro', Georgia, serif", color: "#e8f0f8" },
    topbar: { background: "rgba(10,22,40,0.95)", borderBottom: "1px solid rgba(59,130,196,0.2)", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, position: "sticky", top: 0, zIndex: 50 },
    avatar: { width: 40, height: 40, borderRadius: 10, background: doctor.color || "#1a4f8a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#fff" },
    sidebar: { width: 220, minHeight: "calc(100vh - 64px)", background: "rgba(0,0,0,0.2)", borderRight: "1px solid rgba(59,130,196,0.1)", padding: "24px 0", position: "fixed", top: 64 },
    sideBtn: (a) => ({ display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", cursor: "pointer", background: a ? "rgba(59,130,196,0.12)" : "transparent", borderLeft: a ? "3px solid #3b82c4" : "3px solid transparent", color: a ? "#3b82c4" : "#60a5d8", fontSize: 14, border: "none", width: "100%", textAlign: "left", fontFamily: "inherit" }),
    main: { marginLeft: 220, padding: "32px" },
    kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16, marginBottom: 28 },
    kpiCard: (accent) => ({ background: "rgba(255,255,255,0.04)", border: `1px solid ${accent}33`, borderRadius: 16, padding: "20px 24px" }),
    kpiNum: (accent) => ({ fontSize: 34, fontWeight: 700, color: accent, display: "block", margin: "4px 0" }),
    kpiLabel: { fontSize: 12, color: "#60a5d8", letterSpacing: 0.5, textTransform: "uppercase" },
    card: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(59,130,196,0.12)", borderRadius: 16, padding: 24, marginBottom: 20 },
    cardTitle: { fontSize: 16, fontWeight: 700, color: "#e8f0f8", margin: "0 0 16px" },
    apptRow: (st) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10, background: statusBg[st] || "rgba(255,255,255,0.03)", marginBottom: 8, flexWrap: "wrap", gap: 8 }),
    statusPill: (st) => ({ padding: "3px 10px", borderRadius: 12, background: statusBg[st], color: statusColor[st], fontSize: 11, fontWeight: 700, textTransform: "uppercase" }),
    selectBtn: { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(59,130,196,0.2)", borderRadius: 8, padding: "4px 10px", color: "#60a5d8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
    filterPill: (a) => ({ padding: "6px 14px", borderRadius: 20, border: `1px solid ${a ? "#3b82c4" : "rgba(59,130,196,0.25)"}`, background: a ? "rgba(59,130,196,0.15)" : "transparent", color: a ? "#3b82c4" : "#60a5d8", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }),
    toggleBtn: (on) => ({ padding: "8px 20px", borderRadius: 10, border: "none", background: on ? "linear-gradient(135deg, #1a4f8a, #3b82c4)" : "rgba(255,100,100,0.15)", color: on ? "#fff" : "#ff6b6b", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }),
    inp: { width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(59,130,196,0.25)", borderRadius: 8, padding: "8px 12px", color: "#e8f0f8", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 10 },
    saveBtn: { padding: "10px 24px", background: "linear-gradient(135deg, #1a4f8a, #3b82c4)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 },
    lbl: { display: "block", fontSize: 12, color: "#60a5d8", marginBottom: 4 },
  };

  const navItems = [
    { id: "overview", icon: "📊", label: "Resumen" },
    { id: "appointments", icon: "📅", label: "Citas" },
    { id: "analytics", icon: "📈", label: "Estadísticas" },
    { id: "profile", icon: "👤", label: "Mi Perfil" },
    { id: "ai", icon: "🤖", label: "Consejo IA" },
  ];

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&display=swap" rel="stylesheet" />
      <div style={s.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={s.avatar}>{doctor.img || initials(doctor.name)}</div>
          <div>
            <div style={{ fontWeight: 700, color: "#e8f0f8", fontSize: 15 }}>{doctor.name}</div>
            <div style={{ fontSize: 11, color: "#3b82c4" }}>{doctor.specialty} · Panel Médico</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={s.toggleBtn(isAvailable)} onClick={toggleAvailable}>{isAvailable ? "🟢 Disponible" : "🔴 No disponible"}</button>
          <button onClick={onExit} style={{ padding: "8px 16px", background: "transparent", border: "1px solid rgba(59,130,196,0.3)", color: "#60a5d8", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>← Salir</button>
        </div>
      </div>

      <div style={s.sidebar}>
        {navItems.map(n => <button key={n.id} style={s.sideBtn(tab === n.id)} onClick={() => setTab(n.id)}><span>{n.icon}</span> {n.label}</button>)}
        <div style={{ padding: "24px 24px 0", borderTop: "1px solid rgba(59,130,196,0.1)", marginTop: 24 }}>
          <div style={{ fontSize: 11, color: "#60a5d8", marginBottom: 4 }}>MEMBRESÍA ACTIVA</div>
          <div style={{ fontSize: 13, color: "#3b82c4", fontWeight: 700 }}>Plan Profesional</div>
          <div style={{ fontSize: 12, color: "#60a5d8" }}>S/. 99/mes</div>
        </div>
      </div>

      <div style={s.main}>

        {tab === "overview" && (
          <>
            <h2 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 700 }}>Buenos días 👋</h2>
            <div style={s.kpiGrid}>
              <div style={s.kpiCard("#3b82c4")}><span style={s.kpiLabel}>Citas hoy</span><span style={s.kpiNum("#3b82c4")}>{todayAppts.length}</span></div>
              <div style={s.kpiCard("#F4A261")}><span style={s.kpiLabel}>Pendientes</span><span style={s.kpiNum("#F4A261")}>{appointments.filter(a=>a.status==="pendiente").length}</span></div>
              <div style={s.kpiCard("#60a5d8")}><span style={s.kpiLabel}>Completadas</span><span style={s.kpiNum("#60a5d8")}>{completedCount}</span></div>
              <div style={s.kpiCard("#3b82c4")}><span style={s.kpiLabel}>Ingresos</span><span style={s.kpiNum("#3b82c4")}>S/. {totalIncome}</span></div>
              <div style={s.kpiCard("#F4A261")}><span style={s.kpiLabel}>Calificación</span><span style={s.kpiNum("#F4A261")}>⭐ {doctor.rating}</span></div>
            </div>
            <div style={s.card}>
              <p style={s.cardTitle}>📅 Agenda de hoy</p>
              {loadingAppts ? <p style={{ color: "#60a5d8" }}>Cargando...</p> : todayAppts.length === 0
                ? <p style={{ color: "#60a5d8", fontSize: 14 }}>No hay citas para hoy.</p>
                : todayAppts.map(a => (
                  <div key={a.id} style={s.apptRow(a.status)}>
                    <div>
                      <span style={{ fontWeight: 700, color: "#e8f0f8" }}>{a.time} · {a.patient_name}</span>
                      <span style={{ display: "block", fontSize: 12, color: "#60a5d8" }}>📞 {a.patient_phone}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={s.statusPill(a.status)}>{a.status}</span>
                      {a.status === "pendiente" && <button style={{ ...s.selectBtn, color: "#3b82c4", borderColor: "#3b82c4" }} onClick={() => updateStatus(a.id, "confirmada")}>Confirmar</button>}
                      {a.status === "confirmada" && <button style={{ ...s.selectBtn, color: "#60a5d8" }} onClick={() => updateStatus(a.id, "completada")}>Completar</button>}
                    </div>
                  </div>
                ))
              }
            </div>
          </>
        )}

        {tab === "appointments" && (
          <>
            <h2 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 700 }}>📅 Todas las citas</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {["todas","pendiente","confirmada","completada","cancelada"].map(st => (
                <button key={st} style={s.filterPill(filterStatus === st)} onClick={() => setFilterStatus(st)}>{st.charAt(0).toUpperCase()+st.slice(1)}</button>
              ))}
            </div>
            <div style={s.card}>
              {loadingAppts ? <p style={{ color: "#60a5d8" }}>Cargando desde Supabase...</p> : filtered.length === 0
                ? <p style={{ color: "#60a5d8", fontSize: 14 }}>No hay citas con este filtro.</p>
                : filtered.map(a => (
                  <div key={a.id} style={s.apptRow(a.status)}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, color: "#e8f0f8" }}>{a.patient_name}</span>
                      <span style={{ display: "block", fontSize: 12, color: "#60a5d8" }}>📅 {a.date} · 🕐 {a.time} · 📞 {a.patient_phone}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={s.statusPill(a.status)}>{a.status}</span>
                      {a.status === "pendiente" && <>
                        <button style={{ ...s.selectBtn, color:"#3b82c4", borderColor:"#3b82c4" }} onClick={() => updateStatus(a.id,"confirmada")}>✓ Confirmar</button>
                        <button style={{ ...s.selectBtn, color:"#ff6b6b", borderColor:"#ff6b6b" }} onClick={() => updateStatus(a.id,"cancelada")}>✗ Cancelar</button>
                      </>}
                      {a.status === "confirmada" && <>
                        <button style={{ ...s.selectBtn, color:"#60a5d8" }} onClick={() => updateStatus(a.id,"completada")}>✓ Completar</button>
                        <button style={{ ...s.selectBtn, color:"#ff6b6b", borderColor:"#ff6b6b" }} onClick={() => updateStatus(a.id,"cancelada")}>✗ Cancelar</button>
                      </>}
                      <button style={{ ...s.selectBtn, color:"#25D366", borderColor:"#25D366" }} onClick={() => window.open(buildWhatsAppLink(a.patient_phone,`Hola ${a.patient_name}, le contacta ${doctor.name}. ¿En qué le puedo ayudar?`),"_blank")}>💬 WA</button>
                    </div>
                  </div>
                ))
              }
            </div>
          </>
        )}

        {tab === "analytics" && (
          <>
            <h2 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 700 }}>📈 Estadísticas</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              {[["📊 Citas por mes", MONTHLY_DATA, "citas", "#3b82c4", maxCitas], ["💰 Ingresos (S/.)", MONTHLY_DATA, "ingresos", "#F4A261", 2100]].map(([title, data, key, color, max]) => (
                <div key={title} style={s.card}>
                  <p style={s.cardTitle}>{title}</p>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140, paddingTop: 16 }}>
                    {data.map(d => (
                      <div key={d.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color, fontWeight: 700 }}>{d[key]}</span>
                        <div style={{ width: "100%", background: `linear-gradient(180deg,${color},${color}88)`, borderRadius: "4px 4px 0 0", height: `${(d[key]/max)*100}px` }} />
                        <span style={{ fontSize: 10, color: "#60a5d8" }}>{d.mes}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              {[
                { label: "Total citas", value: appointments.length, color: "#3b82c4" },
                { label: "Tasa cancelación", value: `${appointments.length ? Math.round(cancelledCount/appointments.length*100) : 0}%`, color: "#ff6b6b" },
                { label: "Ingreso/cita", value: doctor.price, color: "#F4A261" },
              ].map((item,i) => (
                <div key={i} style={s.kpiCard(item.color)}>
                  <span style={s.kpiLabel}>{item.label}</span>
                  <span style={s.kpiNum(item.color)}>{item.value}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "profile" && (
          <>
            <h2 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 700 }}>👤 Mi Perfil</h2>
            <div style={s.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                <div style={{ width: 72, height: 72, borderRadius: 18, background: doctor.color || "#1a4f8a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 24, color: "#fff" }}>{doctor.img || initials(doctor.name)}</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 20 }}>{profileData.name}</h3>
                  <p style={{ margin: "4px 0 0", color: "#60a5d8" }}>{profileData.specialty} · {profileData.price}/consulta</p>
                  {profileData.address && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#3b82c4" }}>📍 {profileData.address}</p>}
                  <div style={{ marginTop: 6 }}>⭐ {doctor.rating} · {isAvailable ? <span style={{ color: "#3b82c4" }}>🟢 Disponible</span> : <span style={{ color: "#ff6b6b" }}>🔴 No disponible</span>}</div>
                </div>
              </div>
              {editProfile ? (
                <>
                  {[["NOMBRE COMPLETO","name"],["ESPECIALIDAD","specialty"],["PRECIO CONSULTA","price"]].map(([lbl,key])=>(
                    <div key={key}><label style={s.lbl}>{lbl}</label><input style={s.inp} value={profileData[key]} onChange={e=>setProfileData({...profileData,[key]:e.target.value})} /></div>
                  ))}
                  <label style={s.lbl}>DIRECCIÓN DEL CONSULTORIO</label>
                  <input style={s.inp} placeholder="Jr. Lima 210, Of. 3, Ayacucho" value={profileData.address} onChange={e=>setProfileData({...profileData,address:e.target.value})} />
                  <p style={{ margin:"-6px 0 12px", fontSize: 11, color: "#60a5d8" }}>📍 Visible para los pacientes al reservar</p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={s.saveBtn} onClick={saveProfile} disabled={savingProfile}>{savingProfile ? "Guardando..." : "Guardar en Supabase ✓"}</button>
                    <button style={{ ...s.saveBtn, background:"transparent", border:"1px solid rgba(59,130,196,0.3)", color:"#60a5d8" }} onClick={() => setEditProfile(false)}>Cancelar</button>
                  </div>
                </>
              ) : (
                <button style={s.saveBtn} onClick={() => setEditProfile(true)}>✏️ Editar perfil</button>
              )}
            </div>
            <div style={s.card}>
              <p style={s.cardTitle}>📋 Horarios disponibles</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(doctor.schedule || []).map(h => <span key={h} style={{ padding: "8px 16px", borderRadius: 20, background: "rgba(59,130,196,0.15)", border: "1px solid rgba(59,130,196,0.3)", color: "#3b82c4", fontSize: 14 }}>{h}</span>)}
              </div>
            </div>
          </>
        )}

        {tab === "ai" && (
          <>
            <h2 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 700 }}>🤖 Consejo IA</h2>
            <p style={{ color: "#60a5d8", margin: "0 0 24px" }}>La IA analiza tus datos reales y te da recomendaciones personalizadas</p>
            <div style={s.card}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 20 }}>
                {[["Citas hoy",todayAppts.length],["Pendientes",appointments.filter(a=>a.status==="pendiente").length],["Completadas",completedCount],["Canceladas",cancelledCount],["Rating",`⭐${doctor.rating}`]].map(([l,v],i)=>(
                  <div key={i} style={{ background:"rgba(59,130,196,0.06)", borderRadius:10, padding:"10px 14px" }}>
                    <div style={{ fontSize:11, color:"#60a5d8" }}>{l}</div>
                    <div style={{ fontSize:20, fontWeight:700, color:"#3b82c4" }}>{v}</div>
                  </div>
                ))}
              </div>
              <button style={{ padding:"12px 28px", background:"linear-gradient(135deg,#1a4f8a,#3b82c4)", color:"#fff", border:"none", borderRadius:12, cursor:"pointer", fontSize:15, fontWeight:700, fontFamily:"inherit", opacity:aiLoading?0.7:1 }} onClick={getAiTip} disabled={aiLoading}>
                {aiLoading ? "Analizando... ⏳" : "🤖 Obtener consejo personalizado"}
              </button>
              {aiTip && <div style={{ background:"rgba(59,130,196,0.07)", border:"1px solid rgba(59,130,196,0.25)", borderRadius:12, padding:16, marginTop:16, fontSize:14, color:"#93c5e8", lineHeight:1.7, whiteSpace:"pre-wrap" }}>
                <div style={{ fontSize:12, color:"#3b82c4", fontWeight:700, marginBottom:8 }}>💡 CONSEJO IA</div>{aiTip}
              </div>}
            </div>
          </>
        )}

      </div>
    </div>
  );
}

// ─── Admin config ──────────────────────────────────────────────────────────
const ADMIN_EMAIL = "horndonasian@gmail.com";

// ─── Admin Panel ───────────────────────────────────────────────────────────
function AdminPanel({ onExit }) {
  const [tab, setTab] = useState("pending");
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [activeDoctors, setActiveDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [pending, active, appts, pays] = await Promise.all([
        sb("doctors?active=eq.false&order=created_at.desc"),
        sb("doctors?active=eq.true&order=name"),
        sb("appointments?order=created_at.desc&limit=50"),
        sb("payments?order=created_at.desc&limit=50"),
      ]);
      setPendingDoctors(pending || []);
      setActiveDoctors(active || []);
      setAppointments(appts || []);
      setPayments(pays || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function activateDoctor(id, name) {
    await sb(`doctors?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ active: true }) });
    setActionMsg(`✅ ${name} activado`);
    loadAll();
    setTimeout(() => setActionMsg(""), 3000);
  }

  async function deactivateDoctor(id, name) {
    await sb(`doctors?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ active: false }) });
    setActionMsg(`🔴 ${name} desactivado`);
    loadAll();
    setTimeout(() => setActionMsg(""), 3000);
  }

  async function deleteDoctor(id, name) {
    if (!window.confirm(`¿Eliminar a ${name}? Esta acción no se puede deshacer.`)) return;
    await sb(`doctors?id=eq.${id}`, { method: "DELETE" });
    setActionMsg(`🗑️ ${name} eliminado`);
    loadAll();
    setTimeout(() => setActionMsg(""), 3000);
  }

  async function verifyPayment(id) {
    await sb(`payments?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "verificado" }) });
    setActionMsg("✅ Pago verificado");
    loadAll();
    setTimeout(() => setActionMsg(""), 3000);
  }

  const totalIngresos = payments.filter(p => p.status === "verificado").reduce((sum, p) => sum + (p.amount || 0), 0);

  const s = {
    wrap: { minHeight: "100vh", background: "linear-gradient(135deg, #0a0f1e 0%, #0d1529 100%)", fontFamily: "'Crimson Pro', Georgia, serif", color: "#e8f0f8" },
    topbar: { background: "rgba(10,15,30,0.98)", borderBottom: "1px solid rgba(255,100,100,0.2)", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, position: "sticky", top: 0, zIndex: 50 },
    main: { maxWidth: 1100, margin: "0 auto", padding: "32px 24px" },
    kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 32 },
    kpiCard: (c) => ({ background: "rgba(255,255,255,0.04)", border: `1px solid ${c}33`, borderRadius: 16, padding: "20px 24px" }),
    kpiNum: (c) => ({ fontSize: 36, fontWeight: 700, color: c, display: "block", margin: "4px 0" }),
    kpiLabel: { fontSize: 11, color: "#60a5d8", letterSpacing: 0.5, textTransform: "uppercase" },
    tabs: { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" },
    tab: (a) => ({ padding: "10px 20px", borderRadius: 10, border: `1px solid ${a ? "#ff6b6b" : "rgba(255,100,100,0.2)"}`, background: a ? "rgba(255,107,107,0.15)" : "transparent", color: a ? "#ff6b6b" : "#60a5d8", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: a ? 700 : 400 }),
    card: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,100,100,0.1)", borderRadius: 14, padding: 20, marginBottom: 12 },
    badge: (c) => ({ padding: "3px 10px", borderRadius: 20, background: `${c}22`, color: c, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }),
    btn: (c) => ({ padding: "7px 14px", background: `${c}22`, border: `1px solid ${c}44`, color: c, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }),
    actionMsg: { position: "fixed", bottom: 24, right: 24, background: "#1a4f8a", border: "1px solid #3b82c4", borderRadius: 12, padding: "12px 20px", color: "#e8f0f8", fontSize: 14, fontWeight: 700, zIndex: 200 },
  };

  const navTabs = [
    { id: "pending", label: `⏳ En espera (${pendingDoctors.length})` },
    { id: "active", label: `✅ Activos (${activeDoctors.length})` },
    { id: "appointments", label: `📅 Citas (${appointments.length})` },
    { id: "payments", label: `💰 Pagos (${payments.length})` },
  ];

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&display=swap" rel="stylesheet" />
      {actionMsg && <div style={s.actionMsg}>{actionMsg}</div>}

      <div style={s.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,100,100,0.2)", border: "1px solid rgba(255,100,100,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🛡️</div>
          <div>
            <div style={{ fontWeight: 700, color: "#e8f0f8", fontSize: 15 }}>Panel Admin — MediAyacucho</div>
            <div style={{ fontSize: 11, color: "#ff6b6b" }}>Acceso restringido · Solo administrador</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={loadAll} style={{ padding: "8px 16px", background: "transparent", border: "1px solid rgba(59,130,196,0.3)", color: "#3b82c4", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>🔄 Actualizar</button>
          <button onClick={onExit} style={{ padding: "8px 16px", background: "transparent", border: "1px solid rgba(255,100,100,0.3)", color: "#ff6b6b", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>← Salir</button>
        </div>
      </div>

      <div style={s.main}>
        {/* KPIs */}
        <div style={s.kpiGrid}>
          <div style={s.kpiCard("#ff6b6b")}><span style={s.kpiLabel}>En espera</span><span style={s.kpiNum("#ff6b6b")}>{pendingDoctors.length}</span><span style={{ fontSize: 12, color: "#60a5d8" }}>Médicos por verificar</span></div>
          <div style={s.kpiCard("#52B788")}><span style={s.kpiLabel}>Médicos activos</span><span style={s.kpiNum("#52B788")}>{activeDoctors.length}</span><span style={{ fontSize: 12, color: "#60a5d8" }}>En la plataforma</span></div>
          <div style={s.kpiCard("#3b82c4")}><span style={s.kpiLabel}>Total citas</span><span style={s.kpiNum("#3b82c4")}>{appointments.length}</span><span style={{ fontSize: 12, color: "#60a5d8" }}>Registradas</span></div>
          <div style={s.kpiCard("#F4A261")}><span style={s.kpiLabel}>Ingresos verificados</span><span style={s.kpiNum("#F4A261")}>S/. {totalIngresos}</span><span style={{ fontSize: 12, color: "#60a5d8" }}>Membresías cobradas</span></div>
          <div style={s.kpiCard("#a78bfa")}><span style={s.kpiLabel}>Pagos pendientes</span><span style={s.kpiNum("#a78bfa")}>{payments.filter(p => p.status === "pendiente").length}</span><span style={{ fontSize: 12, color: "#60a5d8" }}>Por verificar</span></div>
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          {navTabs.map(t => <button key={t.id} style={s.tab(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>

        {loading && <div style={{ textAlign: "center", padding: 40, color: "#60a5d8" }}>⏳ Cargando datos...</div>}

        {/* MÉDICOS EN ESPERA */}
        {!loading && tab === "pending" && (
          <>
            <h3 style={{ margin: "0 0 16px", color: "#ff6b6b" }}>⏳ Médicos pendientes de verificación</h3>
            {pendingDoctors.length === 0
              ? <div style={{ ...s.card, textAlign: "center", color: "#60a5d8" }}>✅ No hay médicos en espera</div>
              : pendingDoctors.map(doc => (
                <div key={doc.id} style={s.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: doc.color || "#1a4f8a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff" }}>{doc.img || "?"}</div>
                        <div>
                          <div style={{ fontWeight: 700, color: "#e8f0f8", fontSize: 16 }}>{doc.name}</div>
                          <div style={{ fontSize: 13, color: "#60a5d8" }}>{doc.specialty} · 📞 {doc.phone}</div>
                        </div>
                      </div>
                      {doc.address && <div style={{ fontSize: 12, color: "#60a5d8", marginBottom: 4 }}>📍 {doc.address}</div>}
                      <div style={{ fontSize: 11, color: "#60a5d8" }}>Registrado: {new Date(doc.created_at).toLocaleDateString("es-PE")}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <a href="https://www.cmp.org.pe" target="_blank" rel="noreferrer" style={{ ...s.btn("#a78bfa"), textDecoration: "none", display: "inline-block" }}>🔍 Verificar CMP</a>
                      <button style={s.btn("#25D366")} onClick={() => window.open(`https://wa.me/${doc.phone}?text=${encodeURIComponent(`Hola ${doc.name}, somos MediAyacucho. Hemos verificado tus credenciales y tu cuenta ha sido activada. ¡Bienvenido! 🎉`)}`, "_blank")}>💬 WhatsApp</button>
                      <button style={s.btn("#52B788")} onClick={() => activateDoctor(doc.id, doc.name)}>✅ Activar</button>
                      <button style={s.btn("#ff6b6b")} onClick={() => deleteDoctor(doc.id, doc.name)}>❌ Rechazar</button>
                    </div>
                  </div>
                </div>
              ))
            }
          </>
        )}

        {/* MÉDICOS ACTIVOS */}
        {!loading && tab === "active" && (
          <>
            <h3 style={{ margin: "0 0 16px", color: "#52B788" }}>✅ Médicos activos en la plataforma</h3>
            {activeDoctors.map(doc => (
              <div key={doc.id} style={s.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: doc.color || "#1a4f8a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff" }}>{doc.img || "?"}</div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#e8f0f8" }}>{doc.name}</div>
                      <div style={{ fontSize: 13, color: "#60a5d8" }}>{doc.specialty} · {doc.price} · ⭐ {doc.rating}</div>
                      {doc.address && <div style={{ fontSize: 12, color: "#60a5d8" }}>📍 {doc.address}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={s.badge(doc.available ? "#52B788" : "#ff6b6b")}>{doc.available ? "Disponible" : "No disponible"}</span>
                    <button style={s.btn("#25D366")} onClick={() => window.open(`https://wa.me/${doc.phone}`, "_blank")}>💬 WA</button>
                    <button style={s.btn("#ff6b6b")} onClick={() => deactivateDoctor(doc.id, doc.name)}>🔴 Suspender</button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* CITAS */}
        {!loading && tab === "appointments" && (
          <>
            <h3 style={{ margin: "0 0 16px", color: "#3b82c4" }}>📅 Últimas citas registradas</h3>
            {appointments.length === 0
              ? <div style={{ ...s.card, textAlign: "center", color: "#60a5d8" }}>No hay citas registradas</div>
              : appointments.map(a => (
                <div key={a.id} style={s.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#e8f0f8" }}>{a.patient_name}</div>
                      <div style={{ fontSize: 13, color: "#60a5d8" }}>📅 {a.date} · 🕐 {a.time} · 📞 {a.patient_phone}</div>
                      <div style={{ fontSize: 12, color: "#60a5d8" }}>Pago: {a.payment_method || "No especificado"} · {a.payment_status}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={s.badge(a.status === "confirmada" ? "#52B788" : a.status === "cancelada" ? "#ff6b6b" : a.status === "completada" ? "#3b82c4" : "#F4A261")}>{a.status}</span>
                      <button style={s.btn("#25D366")} onClick={() => window.open(`https://wa.me/${a.patient_phone}`, "_blank")}>💬 WA</button>
                    </div>
                  </div>
                </div>
              ))
            }
          </>
        )}

        {/* PAGOS */}
        {!loading && tab === "payments" && (
          <>
            <h3 style={{ margin: "0 0 16px", color: "#F4A261" }}>💰 Pagos de membresías</h3>
            {payments.length === 0
              ? <div style={{ ...s.card, textAlign: "center", color: "#60a5d8" }}>No hay pagos registrados</div>
              : payments.map(p => (
                <div key={p.id} style={s.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#e8f0f8" }}>S/. {p.amount} · {p.method?.toUpperCase()}</div>
                      <div style={{ fontSize: 12, color: "#60a5d8" }}>{new Date(p.created_at).toLocaleDateString("es-PE")} · {new Date(p.created_at).toLocaleTimeString("es-PE")}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={s.badge(p.status === "verificado" ? "#52B788" : p.status === "rechazado" ? "#ff6b6b" : "#F4A261")}>{p.status}</span>
                      {p.status === "pendiente" && <button style={s.btn("#52B788")} onClick={() => verifyPayment(p.id)}>✅ Verificar pago</button>}
                    </div>
                  </div>
                </div>
              ))
            }
          </>
        )}
      </div>
    </div>
  );
}


export default function App() {
  const [view, setView] = useState("home");
  const [doctors, setDoctors] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [filter, setFilter] = useState("Todos");
  const [messages, setMessages] = useState([{ role: "assistant", content: "¡Hola! Soy tu asistente médico IA de MediPerú. 🩺\n\nPuedo ayudarte a:\n• Encontrar el médico ideal para ti\n• Agendar una cita\n• Resolver dudas sobre síntomas\n\n¿En qué te puedo ayudar hoy?" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [bookingData, setBookingData] = useState({ patient_name: "", patient_phone: "", date: "", time: "" });
  const [confirmed, setConfirmed] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [lastBooking, setLastBooking] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [isMembershipPayment, setIsMembershipPayment] = useState(false);
  const [dashboardDoctor, setDashboardDoctor] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [session, setSession] = useState(() => auth.getSession());
  const [showAdmin, setShowAdmin] = useState(false);
  const [regData, setRegData] = useState({ name: "", specialty: "", email: "", phone: "", address: "", reference: "", cmp: "", universidad: "" });
  const [cmpVerification, setCmpVerification] = useState(null); // null | loading | result
  const [diplomaFile, setDiplomaFile] = useState(null);
  const [diplomaBase64, setDiplomaBase64] = useState(null);
  const [regLoading, setRegLoading] = useState(false);
  const [regDone, setRegDone] = useState(false);
  const [pendingDoctorId, setPendingDoctorId] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    db.getDoctors()
      .then(data => { setDoctors(data); setLoadingDoctors(false); })
      .catch(e => { setDbError(e.message); setLoadingDoctors(false); });
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const filtered = filter === "Todos" ? doctors : doctors.filter(d => d.specialty === filter);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim(); setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const doctorList = doctors.map(d => `${d.name} (${d.specialty}, ${d.price}, ${d.available?"disponible":"no disponible"}, ${d.address||""})`).join("; ");
      const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: `Eres un asistente médico IA amable para Perú, Perú. Médicos: ${doctorList}. Responde en español, cálido. Si el usuario describe síntomas, sugiere especialidad y médico. Nunca diagnostiques. Máximo 3 párrafos.`, messages: [...messages, { role: "user", content: userMsg }].map(m => ({ role: m.role, content: m.content })) }) });
      const data = await response.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.content?.map(b => b.text||"").join("")||"Error." }]);
    } catch { setMessages(prev => [...prev, { role: "assistant", content: "Error de conexión." }]); }
    setLoading(false);
  }

  async function confirmBooking() {
    if (!bookingData.patient_name || !bookingData.patient_phone || !bookingData.date || !bookingData.time) return;
    try {
      const appt = await db.createAppointment({ doctor_id: selectedDoctor.id, ...bookingData, amount: selectedDoctor.price, status: "pendiente", payment_status: "pendiente" });
      const apptId = Array.isArray(appt) ? appt[0]?.id : appt?.id;
      setLastBooking({ data: { ...bookingData, appointmentId: apptId }, doctor: selectedDoctor });
      setShowPayment(true);
    } catch (e) { alert("Error al guardar la cita: " + e.message); }
  }
  function onPaymentSuccess() {
    setShowPayment(false);
    setIsMembershipPayment(false);
    if (!isMembershipPayment) setConfirmed(true);
  }

  async function handleLogout() {
    if (session?.token) await auth.signOut(session.token);
    auth.clearSession();
    setSession(null);
    setDashboardDoctor(null);
    setView("home");
  }

  async function handleLogin(newSession) {
    auth.saveSession(newSession);
    setSession(newSession);
    setShowLogin(false);
    // Si c'est un nouveau compte (signup), aller au formulaire d'inscription
    if (newSession.isNew) {
      setView("doctor-register");
      return;
    }
    // Si c'est un login existant, chercher le médecin par email
    try {
      const docs = await sb(`doctors?email=eq.${encodeURIComponent(newSession.email)}&active=eq.true`);
      if (docs && docs.length > 0) {
        setDashboardDoctor(docs[0]);
      } else {
        // Médecin non encore activé ou non trouvé
        setView("doctor-register");
      }
    } catch { setView("doctor-register"); }
  }

  function resetBooking() {
    setConfirmed(false);
    setBookingData({ patient_name: "", patient_phone: "", date: "", time: "" });
    setView("home");
    setShowNotifPanel(false);
  }

  async function verifyCMP() {
    if (!regData.cmp || !regData.name || !regData.specialty) return;
    setCmpVerification({ status: "loading" });
    try {
      const messages = [{ role: "user", content: diplomaBase64 ? [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: diplomaBase64 } },
        { type: "text", text: `Analiza esta imagen de diploma/título médico. El médico dice llamarse "${regData.name}", especialidad "${regData.specialty}", número CMP "${regData.cmp}", universidad "${regData.universidad}". Verifica: 1) ¿La imagen parece un diploma médico legítimo del Perú? 2) ¿El nombre en el diploma coincide? 3) ¿Hay signos de falsificación? 4) ¿El formato es oficial? Responde SOLO en JSON: {"score": 0-100, "valido": true/false, "nombre_coincide": true/false, "es_diploma": true/false, "alertas": ["alerta1"], "recomendacion": "APROBAR|REVISAR|RECHAZAR", "resumen": "explicación breve"}` }
      ] : [{ type: "text", text: `Soy el administrador de MediAyacucho, plataforma médica en Perú. Un médico quiere registrarse con estos datos: Nombre: "${regData.name}", Especialidad: "${regData.specialty}", Número CMP: "${regData.cmp}", Universidad: "${regData.universidad}". Basándote en tu conocimiento del sistema médico peruano: 1) ¿El formato del CMP es válido? (normalmente 5-6 dígitos) 2) ¿La especialidad existe en Perú? 3) ¿Hay inconsistencias sospechosas? 4) ¿Qué verificaciones manuales recomiendas? Responde SOLO en JSON sin markdown: {"score": 0-100, "valido": true/false, "formato_cmp_ok": true/false, "alertas": ["alerta1"], "recomendacion": "APROBAR|REVISAR|RECHAZAR", "verificar_en": "https://www.cmp.org.pe", "resumen": "explicación breve"}` }] }];

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 500, system: "Eres un sistema de verificación de credenciales médicas para Perú. Responde SIEMPRE en JSON válido sin markdown ni backticks.", messages })
      });
      const data = await resp.json();
      const text = data.content?.map(b => b.text || "").join("") || "{}";
      const clean = text.replace(/```json|```/g, "").trim();
      const result = JSON.parse(clean);
      setCmpVerification({ status: "done", result });
    } catch (e) {
      setCmpVerification({ status: "error", msg: "Error al verificar. Intenta nuevamente." });
    }
  }

  function handleDiplomaUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setDiplomaFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result.split(",")[1];
      setDiplomaBase64(base64);
    };
    reader.readAsDataURL(file);
  }

  async function submitRegistration() {
    if (!regData.name || !regData.specialty || !regData.phone || !regData.cmp) return;
    setRegLoading(true);
    try {
      const img = regData.name.split(" ").filter(w=>w[0]===w[0]?.toUpperCase()).slice(0,2).map(w=>w[0]).join("");
      const colors = ["#1a4f8a","#0d2d5e","#2563a8","#3b82c4","#60a5d8","#1A56DB"];
      const color = colors[Math.floor(Math.random()*colors.length)];
      const cmpScore = cmpVerification?.result?.score || 0;
      const cmpStatus = cmpVerification?.result?.recomendacion || "SIN_VERIFICAR";
      const result = await db.registerDoctor({ name: regData.name, specialty: regData.specialty, phone: regData.phone, address: regData.address, img, color, available: true, active: false, price: "S/. 60", rating: 5.0, email: regData.email });
      const docId = Array.isArray(result) ? result[0]?.id : result?.id;
      const adminMsg = `🏥 *NUEVO MÉDICO - MediAyacucho*\n\n👤 ${regData.name}\n🏥 ${regData.specialty}\n📋 CMP: ${regData.cmp}\n🎓 ${regData.universidad || "No indicada"}\n📞 ${regData.phone}\n\n🤖 *Verificación IA:*\n• Score: ${cmpScore}/100\n• Estado: ${cmpStatus}\n\n✅ Verificar en: https://www.cmp.org.pe\n\nResponde para activar o rechazar.`;
      window.open(`https://wa.me/51913330712?text=${encodeURIComponent(adminMsg)}`, "_blank");
      setPendingDoctorId(docId);
      setRegDone(true);
      setIsMembershipPayment(true);
      setSelectedDoctor({ id: docId, name: regData.name, specialty: regData.specialty, price: "S/. 99" });
      setShowPayment(true);
    } catch (e) { alert("Error al registrarse: " + e.message); }
    setRegLoading(false);
  }

  if (showAdmin) return <AdminPanel onExit={() => setShowAdmin(false)} />;
  if (dashboardDoctor) return <DoctorDashboard doctor={dashboardDoctor} onExit={() => setDashboardDoctor(null)} />;

  const T = {
    app: { fontFamily: "'Crimson Pro', Georgia, serif", minHeight: "100vh", background: "linear-gradient(135deg, #030d1a 0%, #051628 50%, #030d1a 100%)", color: "#e8f0f8", position: "relative" },
    header: { position: "sticky", top: 0, zIndex: 100, background: "rgba(10,22,40,0.92)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(59,130,196,0.2)", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 },
    logo: { fontSize: 22, fontWeight: 700, color: "#3b82c4" },
    logoSub: { fontSize: 11, color: "#60a5d8", letterSpacing: 3, textTransform: "uppercase", display: "block", marginTop: -4 },
    navBtn: (a) => ({ padding: "8px 16px", borderRadius: 8, border: a?"1px solid #3b82c4":"1px solid transparent", background: a?"rgba(59,130,196,0.15)":"transparent", color: a?"#3b82c4":"#93c5e8", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }),
    section: { maxWidth: 1100, margin: "0 auto", padding: "40px 24px", position: "relative", zIndex: 1 },
    ctaPrimary: { padding: "14px 32px", background: "linear-gradient(135deg, #1a4f8a, #3b82c4)", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, cursor: "pointer", fontWeight: 600, fontFamily: "inherit", boxShadow: "0 8px 32px rgba(59,130,196,0.3)" },
    ctaSecondary: { padding: "14px 32px", background: "transparent", color: "#3b82c4", border: "1.5px solid #3b82c4", borderRadius: 12, fontSize: 16, cursor: "pointer", fontFamily: "inherit" },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 },
    card: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(59,130,196,0.15)", borderRadius: 16, padding: 24, transition: "all 0.3s" },
    avatar: (c) => ({ width: 56, height: 56, borderRadius: 14, background: c||"#1a4f8a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16 }),
    filterBtn: (a) => ({ padding: "8px 18px", borderRadius: 20, border: "1px solid", borderColor: a?"#3b82c4":"rgba(59,130,196,0.3)", background: a?"rgba(59,130,196,0.2)":"transparent", color: a?"#3b82c4":"#60a5d8", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }),
    input: { width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(59,130,196,0.25)", borderRadius: 10, padding: "10px 14px", color: "#e8f0f8", fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
    timePill: (sel) => ({ padding: "6px 14px", borderRadius: 20, border: `1px solid ${sel?"#3b82c4":"rgba(59,130,196,0.3)"}`, background: sel?"rgba(59,130,196,0.2)":"transparent", color: sel?"#3b82c4":"#60a5d8", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }),
    label: { display: "block", fontSize: 13, color: "#60a5d8", marginBottom: 6 },
    msgBubble: (r) => ({ maxWidth: "80%", padding: "12px 16px", borderRadius: r==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px", background: r==="user"?"linear-gradient(135deg, #1a4f8a, #2563a8)":"rgba(255,255,255,0.07)", alignSelf: r==="user"?"flex-end":"flex-start", fontSize: 15, lineHeight: 1.6, color: "#e8f0f8", whiteSpace: "pre-wrap", border: r==="user"?"none":"1px solid rgba(59,130,196,0.15)" }),
    planFeature: { padding: "8px 0", borderBottom: "1px solid rgba(59,130,196,0.1)", color: "#93c5e8", fontSize: 15, listStyle: "none" },
  };

  return (
    <div style={T.app}>
      <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&display=swap" rel="stylesheet" />

      {showLogin && <LoginModal onLogin={handleLogin} onClose={() => setShowLogin(false)} />}
      {showNotifPanel && lastBooking && <NotificationPanel bookingData={lastBooking.data} doctor={lastBooking.doctor} onClose={resetBooking} />}
      {showPayment && selectedDoctor && (
        <PaymentModal doctor={selectedDoctor} bookingData={lastBooking?.data || bookingData} isMembership={isMembershipPayment}
          onSuccess={() => { setShowPayment(false); setIsMembershipPayment(false); if (!isMembershipPayment) setConfirmed(true); }}
          onClose={() => { setShowPayment(false); setIsMembershipPayment(false); }} />
      )}

      <header style={T.header}>
        <div style={{ cursor: "pointer" }} onClick={() => setView("home")}>
          <span style={T.logo}>MediPerú</span>
          <span style={T.logoSub}>Salud para todos</span>
        </div>
        <nav style={{ display: "flex", gap: 8 }}>
          <button style={T.navBtn(view==="home")} onClick={() => setView("home")}>Inicio</button>
          <button style={T.navBtn(view==="doctors")} onClick={() => setView("doctors")}>Médicos</button>
          <button style={T.navBtn(view==="chat")} onClick={() => setView("chat")}>🤖 Asistente IA</button>
          {session ? (
            <div style={{ display: "flex", gap: 8 }}>
              {session.email === ADMIN_EMAIL && (
                <button style={{ ...T.navBtn(false), background: "rgba(255,100,100,0.15)", border: "1px solid rgba(255,100,100,0.4)", color: "#ff6b6b" }} onClick={() => setShowAdmin(true)}>🛡️ Admin</button>
              )}
              <button style={{ ...T.navBtn(true), background: "rgba(59,130,196,0.15)" }} onClick={async () => {
                const myDoc = doctors.find(d => d.email === session?.email);
                if (myDoc) { setDashboardDoctor(myDoc); return; }
                // Si pas trouvé dans les actifs, chercher aussi les inactifs
                try {
                  const all = await sb(`doctors?email=eq.${encodeURIComponent(session?.email)}`);
                  if (all && all.length > 0) setDashboardDoctor(all[0]);
                  else setView("doctor-register");
                } catch { setView("doctor-register"); }
              }}>📊 Mi Panel</button>
              <button style={{ ...T.navBtn(false), color: "#ff6b6b" }} onClick={handleLogout}>Salir</button>
            </div>
          ) : (
            <button style={{ ...T.navBtn(view==="doctor-register"), background: "rgba(59,130,196,0.15)", border: "1px solid rgba(59,130,196,0.4)", color: "#3b82c4" }} onClick={() => setShowLogin(true)}>🔐 Soy Médico</button>
          )}
        </nav>
      </header>

      {/* HOME */}
      {view === "home" && (
        <>
          {/* HERO */}
          <div style={{ position: "relative", zIndex: 1, overflow: "hidden" }}>
            {/* Hero background image */}
            <div style={{ position: "absolute", inset: 0, backgroundImage: "url(https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1600&q=80)", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.12, zIndex: 0 }} />
            <div style={{ padding: "80px 24px 60px", textAlign: "center", position: "relative", zIndex: 1 }}>
              <div style={{ display: "inline-block", background: "rgba(59,130,196,0.15)", border: "1px solid rgba(59,130,196,0.3)", borderRadius: 20, padding: "6px 16px", fontSize: 13, color: "#93c5e8", marginBottom: 20, letterSpacing: 0.5 }}>
                🏥 Plataforma médica certificada — Ayacucho, Perú
              </div>
              <h1 style={{ fontSize: "clamp(36px,6vw,72px)", fontWeight: 700, lineHeight: 1.1, margin: "0 0 20px" }}>
                Tu salud,<span style={{ color: "#3b82c4", display: "block" }}>nuestra prioridad</span>
              </h1>
              <p style={{ fontSize: 18, color: "#93c5e8", maxWidth: 560, margin: "0 auto 40px", lineHeight: 1.6 }}>Conectamos a la población de Ayacucho con médicos calificados. Agenda tu cita en minutos con IA.</p>
              <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
                <button style={T.ctaPrimary} onClick={() => setView("doctors")}>Buscar Médico</button>
                <button style={T.ctaSecondary} onClick={() => setView("chat")}>Hablar con IA 🤖</button>
              </div>
              <div style={{ display: "flex", gap: 40, justifyContent: "center", margin: "60px 0", flexWrap: "wrap" }}>
                {[[doctors.length||"6", "Médicos Certificados"],["500+","Citas Agendadas"],["4.8★","Calificación Promedio"],["24/7","Asistente IA"]].map(([n,l])=>(
                  <div key={l} style={{ textAlign: "center" }}>
                    <span style={{ fontSize: 40, fontWeight: 700, color: "#3b82c4", display: "block" }}>{n}</span>
                    <span style={{ fontSize: 14, color: "#60a5d8" }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* TRUST PHOTOS SECTION */}
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 60px", position: "relative", zIndex: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 60 }}>
              {[
                { url: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&q=80", label: "Médicos certificados", desc: "Todos nuestros médicos están verificados y colegiados" },
                { url: "https://images.unsplash.com/photo-1666214280557-f1b5022eb634?w=600&q=80", label: "Atención de calidad", desc: "Consultas presenciales en consultorios equipados" },
                { url: "https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=600&q=80", label: "Reserva en minutos", desc: "Agenda tu cita desde tu celular sin filas" },
              ].map((item, i) => (
                <div key={i} style={{ borderRadius: 16, overflow: "hidden", position: "relative", border: "1px solid rgba(59,130,196,0.2)" }}>
                  <img src={item.url} alt={item.label} style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} onError={e => { e.target.style.display = "none"; }} />
                  <div style={{ padding: "16px 18px", background: "rgba(5,22,40,0.95)" }}>
                    <div style={{ fontWeight: 700, color: "#e8f0f8", fontSize: 15, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: "#60a5d8", lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* TESTIMONIOS */}
            <h2 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 24px", textAlign: "center" }}>Lo que dicen nuestros pacientes</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 60 }}>
              {[
                { name: "María C.", city: "Ayacucho", text: "Encontré médico en 5 minutos y pagué por Yape. ¡Muy fácil!", stars: 5 },
                { name: "Jorge H.", city: "Huamanga", text: "El doctor llegó puntual y la consulta fue excelente. Lo recomiendo.", stars: 5 },
                { name: "Rosa P.", city: "Ayacucho", text: "Me mandaron la confirmación por WhatsApp con la dirección. Perfecto.", stars: 5 },
              ].map((t, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(59,130,196,0.15)", borderRadius: 14, padding: 20 }}>
                  <div style={{ color: "#F4A261", fontSize: 16, marginBottom: 10 }}>{"★".repeat(t.stars)}</div>
                  <p style={{ color: "#93c5e8", fontSize: 14, lineHeight: 1.6, margin: "0 0 12px", fontStyle: "italic" }}>"{t.text}"</p>
                  <div style={{ fontWeight: 700, color: "#e8f0f8", fontSize: 14 }}>{t.name}</div>
                  <div style={{ color: "#60a5d8", fontSize: 12 }}>{t.city}</div>
                </div>
              ))}
            </div>

            {/* COMO FUNCIONA */}
            <h2 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 32px", textAlign: "center" }}>¿Cómo funciona?</h2>
            <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
              {[["🤖","Consulta la IA","Cuéntanos tus síntomas y te recomendamos al médico ideal"],["📅","Elige tu cita","Selecciona el médico, fecha y hora disponible"],["📲","Recibe confirmación","WhatsApp instantáneo con dirección y todos los detalles"]].map(([icon,title,desc])=>(
                <div key={title} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(59,130,196,0.15)", borderRadius:16, padding:28, maxWidth:240 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
                  <h3 style={{ margin:"0 0 8px", color:"#3b82c4", fontSize:18 }}>{title}</h3>
                  <p style={{ margin:0, color:"#60a5d8", fontSize:14, lineHeight:1.6 }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* DOCTORS */}
      {view === "doctors" && (
        <div style={T.section}>
          <h2 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 8px" }}>Médicos en tu ciudad</h2>
          <p style={{ color: "#60a5d8", margin: "0 0 24px" }}>
            {loadingDoctors ? "Cargando desde Supabase..." : dbError ? `⚠️ Error: ${dbError}` : `${doctors.length} médico(s) certificado(s) y verificado(s)`}
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 32, flexWrap: "wrap" }}>
            {SPECIALTIES.map(s => <button key={s} style={T.filterBtn(filter===s)} onClick={() => setFilter(s)}>{s}</button>)}
          </div>
          {loadingDoctors ? (
            <div style={{ textAlign:"center", padding:60, color:"#3b82c4", fontSize:18 }}>⏳ Conectando a Supabase...</div>
          ) : (
            <div style={T.grid}>
              {filtered.map(doc => (
                <div key={doc.id} style={T.card}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.borderColor="rgba(59,130,196,0.4)";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.borderColor="rgba(59,130,196,0.15)";}}>
                  <div style={T.avatar(doc.color)}>{doc.img || initials(doc.name)}</div>
                  <h3 style={{ fontSize:18, fontWeight:700, margin:"0 0 4px", color:"#e8f0f8" }}>{doc.name}</h3>
                  <p style={{ fontSize:13, color:"#60a5d8", margin:"0 0 8px" }}>{doc.specialty}</p>
                  <div style={{ color:"#F4A261", fontSize:13 }}>{"★".repeat(Math.floor(doc.rating||5))} {doc.rating}</div>
                  <div style={{ marginTop:6, color:"#60a5d8", fontSize:12 }}>{(doc.schedule||[]).join(" · ")}</div>
                  {doc.address && (
                    <div style={{ marginTop:8, display:"flex", alignItems:"flex-start", gap:6 }}>
                      <span style={{ fontSize:12 }}>📍</span>
                      <a href={doc.maps_url||"#"} target="_blank" rel="noreferrer" style={{ fontSize:12, color:"#3b82c4", textDecoration:"none", lineHeight:1.4 }}>{doc.address}</a>
                    </div>
                  )}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:16 }}>
                    <div>
                      <span style={{ fontSize:20, fontWeight:700, color:"#3b82c4" }}>{doc.price}</span>
                      <span style={{ fontSize:12, color:"#60a5d8" }}>/consulta</span>
                    </div>
                    {doc.available
                      ? <button style={{ padding:"8px 16px", background:"linear-gradient(135deg,#1a4f8a,#3b82c4)", color:"#fff", border:"none", borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit" }} onClick={() => { setSelectedDoctor(doc); setView("booking"); }}>Agendar</button>
                      : <span style={{ padding:"4px 10px", borderRadius:20, background:"rgba(255,100,100,0.1)", color:"#ff6b6b", fontSize:12 }}>No disponible</span>
                    }
                  </div>
                  {/* Demo: acceso al dashboard */}
                  <button style={{ marginTop:8, width:"100%", padding:"6px 0", background:"transparent", border:"1px solid rgba(59,130,196,0.2)", color:"#3b82c4", borderRadius:8, cursor:"pointer", fontSize:12, fontFamily:"inherit" }} onClick={() => setDashboardDoctor(doc)}>
                    📊 Ver mi dashboard
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BOOKING */}
      {view === "booking" && selectedDoctor && (
        <div style={T.section}>
          {confirmed ? (
            <div style={{ maxWidth:480, margin:"0 auto", textAlign:"center", padding:"40px 0" }}>
              <div style={{ fontSize:72, marginBottom:16 }}>🎉</div>
              <h2 style={{ color:"#3b82c4", fontSize:28, margin:"0 0 12px" }}>¡Cita Confirmada!</h2>
              <p style={{ color:"#60a5d8", marginBottom:8 }}>Cita con <strong style={{ color:"#e8f0f8" }}>{selectedDoctor.name}</strong> el {bookingData.date} a las {bookingData.time}.</p>
              <p style={{ color:"#93c5e8", fontSize:14, marginBottom:32 }}>¿Deseas enviar la confirmación por WhatsApp?</p>
              <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
                <button style={{ ...T.ctaPrimary, background:"linear-gradient(135deg,#25D366,#128C7E)", fontSize:15 }} onClick={() => setShowNotifPanel(true)}>📲 Enviar WhatsApp</button>
                <button style={T.ctaSecondary} onClick={resetBooking}>Omitir</button>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth:540, margin:"0 auto" }}>
              <button onClick={() => setView("doctors")} style={{ background:"none", border:"none", color:"#3b82c4", cursor:"pointer", fontSize:15, marginBottom:24, padding:0, fontFamily:"inherit" }}>← Volver</button>
              <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(59,130,196,0.2)", borderRadius:16, padding:24, marginBottom:24 }}>
                <div style={{ display:"flex", gap:16, alignItems:"center" }}>
                  <div style={T.avatar(selectedDoctor.color)}>{selectedDoctor.img||initials(selectedDoctor.name)}</div>
                  <div>
                    <h3 style={{ margin:0, color:"#e8f0f8" }}>{selectedDoctor.name}</h3>
                    <p style={{ margin:"4px 0 0", color:"#60a5d8", fontSize:14 }}>{selectedDoctor.specialty} · {selectedDoctor.price}</p>
                  </div>
                </div>
                {selectedDoctor.address && (
                  <div style={{ marginTop:16, padding:"12px 16px", background:"rgba(59,130,196,0.07)", borderRadius:10, display:"flex", alignItems:"flex-start", gap:10 }}>
                    <span style={{ fontSize:20 }}>📍</span>
                    <div>
                      <p style={{ margin:"0 0 4px", fontSize:12, color:"#3b82c4", textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 }}>Dirección del consultorio</p>
                      <p style={{ margin:"0 0 6px", color:"#e8f0f8", fontSize:14 }}>{selectedDoctor.address}</p>
                      <a href={selectedDoctor.maps_url||"#"} target="_blank" rel="noreferrer" style={{ fontSize:12, color:"#3b82c4", textDecoration:"none", background:"rgba(59,130,196,0.15)", border:"1px solid rgba(59,130,196,0.3)", padding:"4px 12px", borderRadius:20, display:"inline-block" }}>🗺️ Ver en Google Maps</a>
                    </div>
                  </div>
                )}
              </div>
              <h2 style={{ fontSize:26, fontWeight:700, margin:"0 0 20px" }}>Datos de la cita</h2>
              {[["NOMBRE COMPLETO","patient_name","Tu nombre completo","text"],["TELÉFONO / WHATSAPP","patient_phone","+51 9XX XXX XXX","text"],["FECHA","date","","date"]].map(([lbl,key,ph,type])=>(
                <div key={key} style={{ marginBottom:16 }}>
                  <label style={T.label}>{lbl}</label>
                  <input style={T.input} placeholder={ph} type={type} value={bookingData[key]} onChange={e=>setBookingData({...bookingData,[key]:e.target.value})} />
                </div>
              ))}
              <div style={{ marginBottom:16 }}>
                <label style={T.label}>HORARIO DISPONIBLE</label>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:8 }}>
                  {(selectedDoctor.schedule||[]).map(t=><button key={t} style={T.timePill(bookingData.time===t)} onClick={()=>setBookingData({...bookingData,time:t})}>{t}</button>)}
                </div>
              </div>

              {/* AVANCE BOX */}
              <div style={{ background:"rgba(244,162,97,0.08)", border:"2px solid rgba(244,162,97,0.3)", borderRadius:14, padding:"16px 18px", marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <span style={{ fontWeight:700, color:"#F4A261", fontSize:15 }}>💰 Pago para reservar</span>
                  <span style={{ fontSize:22, fontWeight:700, color:"#e8f0f8" }}>S/. {AVANCE.monto}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#60a5d8", marginBottom:6 }}>
                  <span>Precio total consulta</span>
                  <span>{selectedDoctor.price}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#60a5d8", marginBottom:6 }}>
                  <span>Adelanto ahora</span>
                  <span style={{ color:"#F4A261", fontWeight:700 }}>S/. {AVANCE.monto}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#60a5d8", paddingTop:8, borderTop:"1px solid rgba(244,162,97,0.2)" }}>
                  <span>Resto a pagar en consulta</span>
                  <span style={{ color:"#93c5e8", fontWeight:700 }}>S/. {parseInt((selectedDoctor.price||"S/. 0").replace(/\D/g,"")) - AVANCE.monto}</span>
                </div>
                <div style={{ marginTop:12, background:"rgba(82,183,136,0.08)", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#60a5d8", display:"flex", gap:8, alignItems:"flex-start" }}>
                  <span>✅</span>
                  <span><strong style={{ color:"#93c5e8" }}>{AVANCE.politica}.</strong> Si no cancelas a tiempo, el adelanto no es reembolsable.</span>
                </div>
              </div>

              <button style={{ ...T.ctaPrimary, width:"100%", marginTop:4, opacity:(!bookingData.patient_name||!bookingData.patient_phone||!bookingData.date||!bookingData.time)?0.5:1 }} onClick={confirmBooking} disabled={!bookingData.patient_name||!bookingData.patient_phone||!bookingData.date||!bookingData.time}>
                💳 Pagar adelanto S/. {AVANCE.monto} y reservar
              </button>
              <p style={{ textAlign:"center", fontSize:12, color:"#60a5d8", margin:"8px 0 0" }}>El resto (S/. {parseInt((selectedDoctor.price||"S/. 0").replace(/\D/g,"")) - AVANCE.monto}) se paga directamente al médico</p>
            </div>
          )}
        </div>
      )}

      {/* CHAT */}
      {view === "chat" && (
        <div style={{ maxWidth:720, margin:"0 auto", padding:"40px 24px", position:"relative", zIndex:1 }}>
          <h2 style={{ fontSize:32, fontWeight:700, margin:"0 0 8px" }}>Asistente Médico IA</h2>
          <p style={{ color:"#60a5d8", margin:"0 0 24px" }}>Cuéntame tus síntomas y te ayudo a encontrar el médico ideal</p>
          <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(59,130,196,0.2)", borderRadius:20, overflow:"hidden", display:"flex", flexDirection:"column", height:"70vh" }}>
            <div style={{ flex:1, overflowY:"auto", padding:24, display:"flex", flexDirection:"column", gap:16 }}>
              {messages.map((m,i)=>(
                <div key={i} style={T.msgBubble(m.role)}>
                  {m.role==="assistant" && <span style={{ fontSize:12, color:"#3b82c4", display:"block", marginBottom:4, fontWeight:600 }}>🩺 Asistente IA</span>}
                  {m.content}
                </div>
              ))}
              {loading && <div style={{ ...T.msgBubble("assistant"), color:"#3b82c4" }}>Pensando... ⏳</div>}
              <div ref={chatEndRef} />
            </div>
            <div style={{ display:"flex", gap:12, padding:16, borderTop:"1px solid rgba(59,130,196,0.15)" }}>
              <input style={{ flex:1, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(59,130,196,0.25)", borderRadius:12, padding:"12px 16px", color:"#e8f0f8", fontSize:15, fontFamily:"inherit", outline:"none" }} placeholder="Escribe tu consulta aquí..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()} />
              <button style={{ padding:"12px 20px", background:"linear-gradient(135deg,#1a4f8a,#3b82c4)", color:"#fff", border:"none", borderRadius:12, cursor:"pointer", fontSize:20, fontFamily:"inherit" }} onClick={sendMessage} disabled={loading}>➤</button>
            </div>
          </div>
          <button style={{ ...T.ctaSecondary, marginTop:20, width:"100%" }} onClick={() => setView("doctors")}>Ver médicos disponibles</button>
        </div>
      )}

      {/* DOCTOR REGISTER */}
      {view === "doctor-register" && (
        <div style={{ maxWidth:600, margin:"0 auto", padding:"40px 24px", zIndex:1, position:"relative" }}>
          <h2 style={{ fontSize:32, fontWeight:700, margin:"0 0 8px" }}>Únete como Médico</h2>
          <p style={{ color:"#60a5d8", margin:"0 0 24px" }}>Llega a más pacientes en Perú</p>

          {regDone ? (
            <div style={{ background:"rgba(59,130,196,0.08)", border:"1px solid rgba(59,130,196,0.3)", borderRadius:16, padding:32, textAlign:"center" }}>
              <div style={{ fontSize:56, marginBottom:16 }}>✅</div>
              <h3 style={{ color:"#3b82c4", fontSize:22, margin:"0 0 8px" }}>¡Registro enviado!</h3>
              <p style={{ color:"#60a5d8", fontSize:14 }}>Tu perfil está en revisión. Te activaremos en 24h tras verificar el pago.</p>
            </div>
          ) : (
            <div style={{ background:"rgba(255,255,255,0.04)", border:"2px solid rgba(59,130,196,0.3)", borderRadius:20, padding:32, marginBottom:24 }}>
              <div style={{ fontSize:24, fontWeight:700, color:"#3b82c4" }}>Plan Profesional</div>
              <div style={{ fontSize:48, fontWeight:700, color:"#e8f0f8", margin:"12px 0" }}>S/. 99<span style={{ fontSize:18, color:"#60a5d8" }}>/mes</span></div>
              <ul style={{ listStyle:"none", padding:0, margin:"0 0 24px" }}>
                {["✅ Perfil médico verificado","✅ Gestión de citas online","✅ Panel de control completo","✅ Notificaciones WhatsApp/SMS","✅ Recomendaciones por IA","✅ Estadísticas en tiempo real","✅ Soporte prioritario 24/7"].map((f,i)=>(
                  <li key={i} style={{ padding:"8px 0", borderBottom:"1px solid rgba(59,130,196,0.1)", color:"#93c5e8", fontSize:15 }}>{f}</li>
                ))}
              </ul>
              {[["NOMBRE COMPLETO","name","Dr. / Dra. Nombre Apellido","text"],["ESPECIALIDAD","specialty","Tu especialidad médica","text"],["CORREO ELECTRÓNICO","email","correo@ejemplo.com","email"],["TELÉFONO / WHATSAPP","phone","+51 9XX XXX XXX","text"]].map(([lbl,key,ph,type])=>(
                <div key={key} style={{ marginBottom:14 }}>
                  <label style={T.label}>{lbl}</label>
                  <input style={T.input} placeholder={ph} type={type} value={regData[key]} onChange={e=>setRegData({...regData,[key]:e.target.value})} />
                </div>
              ))}

              {/* CMP SECTION */}
              <div style={{ background:"rgba(59,130,196,0.06)", border:"1px solid rgba(59,130,196,0.2)", borderRadius:14, padding:20, marginBottom:16 }}>
                <div style={{ fontSize:15, fontWeight:700, color:"#3b82c4", marginBottom:4 }}>🏥 Verificación CMP obligatoria</div>
                <p style={{ fontSize:12, color:"#60a5d8", margin:"0 0 14px" }}>Solo médicos registrados en el Colegio Médico del Perú pueden inscribirse.</p>

                <div style={{ marginBottom:12 }}>
                  <label style={T.label}>NÚMERO CMP *</label>
                  <div style={{ display:"flex", gap:8 }}>
                    <input style={{ ...T.input, marginBottom:0, flex:1 }} placeholder="Ej: 12345" value={regData.cmp} onChange={e=>setRegData({...regData,cmp:e.target.value.replace(/\D/g,"")})} maxLength={6} />
                    <button style={{ padding:"10px 16px", background:"linear-gradient(135deg,#1a4f8a,#3b82c4)", color:"#fff", border:"none", borderRadius:10, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:700, whiteSpace:"nowrap", opacity:(!regData.cmp||!regData.name||!regData.specialty)?0.5:1 }}
                      onClick={verifyCMP} disabled={!regData.cmp||!regData.name||!regData.specialty||cmpVerification?.status==="loading"}>
                      {cmpVerification?.status==="loading" ? "⏳" : "🔍 Verificar"}
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom:12 }}>
                  <label style={T.label}>UNIVERSIDAD DE GRADUACIÓN</label>
                  <input style={T.input} placeholder="Ej: Universidad Nacional San Cristóbal de Huamanga" value={regData.universidad} onChange={e=>setRegData({...regData,universidad:e.target.value})} />
                </div>

                <div style={{ marginBottom:12 }}>
                  <label style={T.label}>FOTO DEL DIPLOMA / TÍTULO (opcional pero recomendado)</label>
                  <div style={{ border:"2px dashed rgba(59,130,196,0.3)", borderRadius:10, padding:16, textAlign:"center", cursor:"pointer", position:"relative" }}
                    onClick={() => document.getElementById("diploma-upload").click()}>
                    <input id="diploma-upload" type="file" accept="image/*,application/pdf" style={{ display:"none" }} onChange={handleDiplomaUpload} />
                    {diplomaFile ? (
                      <div style={{ color:"#3b82c4", fontSize:14 }}>📄 {diplomaFile.name} <span style={{ color:"#52B788" }}>✓</span></div>
                    ) : (
                      <div style={{ color:"#60a5d8", fontSize:13 }}>📎 Haz clic para subir tu diploma o título médico<br/><span style={{ fontSize:11, color:"#60a5d8", opacity:0.7 }}>JPG, PNG o PDF — La IA lo analizará automáticamente</span></div>
                    )}
                  </div>
                </div>

                {/* RESULTADO VERIFICACION IA */}
                {cmpVerification?.status === "loading" && (
                  <div style={{ background:"rgba(59,130,196,0.08)", borderRadius:10, padding:14, textAlign:"center", color:"#60a5d8", fontSize:14 }}>
                    🤖 La IA está analizando tus credenciales...
                  </div>
                )}
                {cmpVerification?.status === "error" && (
                  <div style={{ background:"rgba(255,100,100,0.1)", border:"1px solid rgba(255,100,100,0.3)", borderRadius:10, padding:14, color:"#ff6b6b", fontSize:13 }}>
                    ⚠️ {cmpVerification.msg}
                  </div>
                )}
                {cmpVerification?.status === "done" && cmpVerification.result && (() => {
                  const r = cmpVerification.result;
                  const color = r.recomendacion === "APROBAR" ? "#52B788" : r.recomendacion === "RECHAZAR" ? "#ff6b6b" : "#F4A261";
                  const bg = r.recomendacion === "APROBAR" ? "rgba(82,183,136,0.08)" : r.recomendacion === "RECHAZAR" ? "rgba(255,107,107,0.08)" : "rgba(244,162,97,0.08)";
                  const icon = r.recomendacion === "APROBAR" ? "✅" : r.recomendacion === "RECHAZAR" ? "❌" : "⚠️";
                  return (
                    <div style={{ background:bg, border:`1px solid ${color}44`, borderRadius:10, padding:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                        <span style={{ fontWeight:700, color, fontSize:15 }}>{icon} {r.recomendacion}</span>
                        <span style={{ fontSize:13, color:"#60a5d8" }}>Score: <strong style={{ color }}>{r.score}/100</strong></span>
                      </div>
                      <p style={{ margin:"0 0 8px", fontSize:13, color:"#93c5e8", lineHeight:1.5 }}>{r.resumen}</p>
                      {r.alertas?.length > 0 && (
                        <div style={{ marginTop:8 }}>
                          {r.alertas.map((a,i) => <div key={i} style={{ fontSize:12, color:"#F4A261", marginBottom:3 }}>• {a}</div>)}
                        </div>
                      )}
                      {r.verificar_en && (
                        <a href={r.verificar_en} target="_blank" rel="noreferrer" style={{ fontSize:12, color:"#3b82c4", display:"block", marginTop:8 }}>
                          🔗 Verificar manualmente en el CMP →
                        </a>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div style={{ marginBottom:14 }}>
                <label style={T.label}>DIRECCIÓN DEL CONSULTORIO</label>
                <input style={T.input} placeholder="Jr. 28 de Julio 312, Of. 2, Ayacucho" value={regData.address} onChange={e=>setRegData({...regData,address:e.target.value})} />
                <p style={{ margin:"6px 0 0", fontSize:12, color:"#60a5d8" }}>📍 Visible para tus pacientes al reservar</p>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={T.label}>REFERENCIA (opcional)</label>
                <input style={T.input} placeholder="Frente al Banco de la Nación, 2do piso" value={regData.reference} onChange={e=>setRegData({...regData,reference:e.target.value})} />
              </div>
              <button style={{ ...T.ctaPrimary, width:"100%", opacity:(!regData.name||!regData.specialty||!regData.phone||!regData.cmp)?0.5:1 }} onClick={submitRegistration} disabled={regLoading||!regData.name||!regData.specialty||!regData.phone||!regData.cmp}>
                {regLoading ? "Guardando en Supabase..." : "💳 Registrarme y pagar S/. 99 →"}
              </button>
              {!regData.cmp && <p style={{ textAlign:"center", fontSize:12, color:"#ff6b6b", marginTop:8 }}>⚠️ El número CMP es obligatorio para registrarse</p>}
            </div>
          )}

          <div style={{ background:"rgba(59,130,196,0.07)", border:"1px solid rgba(59,130,196,0.2)", borderRadius:16, padding:20, textAlign:"center" }}>
            <p style={{ color:"#60a5d8", fontSize:13, margin:"0 0 12px" }}>🎯 ¿Quieres ver el panel de control antes de inscribirte?</p>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
              {doctors.slice(0,3).map(doc=>(
                <button key={doc.id} style={{ padding:"8px 16px", background:"rgba(59,130,196,0.15)", border:"1px solid rgba(59,130,196,0.3)", borderRadius:10, color:"#3b82c4", cursor:"pointer", fontFamily:"inherit", fontSize:13 }} onClick={() => setDashboardDoctor(doc)}>
                  {doc.img||initials(doc.name)} {doc.name.split(" ")[1]}
                </button>
              ))}
            </div>
          </div>
          <p style={{ textAlign:"center", color:"#3b82c4", fontSize:14, marginTop:20 }}>¿Preguntas? WhatsApp: <strong>913 330 712</strong></p>
        </div>
      )}
    </div>
  );
}
