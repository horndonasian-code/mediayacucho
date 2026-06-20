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
  getAppointments: (doctorId) => doctorId ? sb(`appointments?doctor_id=eq.${doctorId}&order=date,time`) : sb(`appointments?order=date,time`),
  createAppointment: (data) => sb("appointments", { method: "POST", body: JSON.stringify(data) }),
  updateAppointment: (id, data) => sb(`appointments?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  createPayment: (data) => sb("payments", { method: "POST", body: JSON.stringify(data) }),
  uploadPhoto: async (file, doctorId) => {
    const ext = file.name.split(".").pop();
    const fileName = `${doctorId}.${ext}`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/doctor-photos/${fileName}`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": file.type,
        "x-upsert": "true",
      },
      body: file,
    });
    if (!res.ok) throw new Error("Error al subir la foto");
    return `${SUPABASE_URL}/storage/v1/object/public/doctor-photos/${fileName}`;
  },
  getReviews: (doctorId) => sb(`reviews?doctor_id=eq.${doctorId}&order=created_at.desc`),
  createReview: (data) => sb("reviews", { method: "POST", body: JSON.stringify(data) }),
  checkReviewExists: (appointmentId) => sb(`reviews?appointment_id=eq.${appointmentId}`),
  getWaitlist: (doctorId) => doctorId ? sb(`waitlist?doctor_id=eq.${doctorId}&status=eq.esperando&order=created_at`) : sb(`waitlist?status=eq.esperando&order=created_at`),
  addToWaitlist: (data) => sb("waitlist", { method: "POST", body: JSON.stringify(data) }),
  updateWaitlistEntry: (id, data) => sb(`waitlist?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data) }),
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
const SPECIALTIES = ["Todos", "Medicina General", "Pediatría", "Cardiología", "Ginecología", "Traumatología", "Dermatología", "Odontología", "Oftalmología", "Psicología", "Nutrición", "Neurología", "Urología", "Endocrinología", "Oncología", "Medicina Interna", "Cirugía General", "Gastroenterología", "Nefrología", "Neumología"];

const SPECIALTY_CONFIG = {
  "Medicina General": { color: "#7dd3fc", bg: "rgba(59,130,196,0.15)",  icon: "🩺" },
  "Pediatría":        { color: "#F4A261", bg: "rgba(244,162,97,0.15)",   icon: "👶" },
  "Cardiología":      { color: "#ff6b6b", bg: "rgba(255,107,107,0.15)",  icon: "❤️" },
  "Ginecología":      { color: "#f472b6", bg: "rgba(244,114,182,0.15)",  icon: "🌸" },
  "Traumatología":    { color: "#bae6fd", bg: "rgba(96,165,216,0.15)",   icon: "🦴" },
  "Dermatología":     { color: "#a78bfa", bg: "rgba(167,139,250,0.15)",  icon: "✨" },
  "Odontología":      { color: "#34d399", bg: "rgba(52,211,153,0.15)",   icon: "🦷" },
  "Oftalmología":     { color: "#22d3ee", bg: "rgba(34,211,238,0.15)",   icon: "👁️" },
  "Psicología":       { color: "#c084fc", bg: "rgba(192,132,252,0.15)",  icon: "🧠" },
  "Nutrición":        { color: "#86efac", bg: "rgba(134,239,172,0.15)",  icon: "🥗" },
  "Neurología":       { color: "#818cf8", bg: "rgba(129,140,248,0.15)",  icon: "🧬" },
  "Urología":         { color: "#38bdf8", bg: "rgba(56,189,248,0.15)",   icon: "💧" },
  "Endocrinología":   { color: "#fb923c", bg: "rgba(251,146,60,0.15)",   icon: "⚡" },
  "Oncología":        { color: "#f87171", bg: "rgba(248,113,113,0.15)",  icon: "🎗️" },
  "Medicina Interna": { color: "#4ade80", bg: "rgba(74,222,128,0.15)",   icon: "🏥" },
  "Cirugía General":  { color: "#e879f9", bg: "rgba(232,121,249,0.15)",  icon: "🔬" },
  "Gastroenterología":{ color: "#fbbf24", bg: "rgba(251,191,36,0.15)",   icon: "🫃" },
  "Nefrología":       { color: "#2dd4bf", bg: "rgba(45,212,191,0.15)",   icon: "🫘" },
  "Neumología":       { color: "#bae6fd", bg: "rgba(147,197,253,0.15)",  icon: "🫁" },
};
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
  const isVirtual = data.modalidad === "virtual";
  const lugarInfo = isVirtual
    ? `📱 Modalidad: *VIRTUAL* (WhatsApp Video)\nEl médico te llamará por WhatsApp a la hora de tu cita.`
    : `📍 Dirección: ${doctor.address || "Por confirmar"}`;
  return `✅ *CONFIRMACIÓN DE CITA - MediAyacucho*\n\nHola ${data.patient_name}, tu cita ha sido reservada:\n\n👨‍⚕️ Médico: ${doctor.name}\n🏥 Especialidad: ${doctor.specialty}\n📅 Fecha: ${data.date}\n🕐 Hora: ${data.time}\n${lugarInfo}\n\n💰 *Pagos:*\n✅ Adelanto pagado: S/. ${AVANCE.monto}\n📋 Resto a pagar en consulta: S/. ${resto}\n\n⚠️ ${AVANCE.politica}.\n\n${isVirtual ? "Ten lista tu cámara y buena conexión." : "Por favor llega 10 minutos antes."}\n\n📍 MediAyacucho - Salud para todos 🌿`;
}
function buildReminderMessage(data, doctor) {
  return `⏰ *RECORDATORIO - MediPerú*\n\nHola ${data.patient_name}, te recordamos tu cita MAÑANA:\n\n👨‍⚕️ ${doctor.name} (${doctor.specialty})\n🕐 ${data.time}\n📍 ${doctor.address || ""}\n\n¡Te esperamos! 💚`;
}
function initials(name) { return name.split(" ").filter(w => w[0] === w[0]?.toUpperCase()).slice(0, 2).map(w => w[0]).join(""); }

const DAY_MAP = { "Dom":0, "Lun":1, "Mar":2, "Mié":3, "Jue":4, "Vie":5, "Sáb":6 };

function formatDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// bookedSlots: Set of "YYYY-MM-DD HH:MM" strings already reserved (status pendiente/confirmada)
function getNextAvailability(schedule, bookedSlots) {
  if (!schedule || schedule.length === 0) return null;
  bookedSlots = bookedSlots || new Set();
  const now = new Date();
  const todayMinutes = now.getHours() * 60 + now.getMinutes();

  // Parse weekly slots into { dow, hh, mm }
  const weeklySlots = [];
  for (const slot of schedule) {
    const match = slot.match(/^(\p{L}{3})\s+(\d{1,2}):(\d{2})/u);
    if (!match) continue;
    const [, dayAbbr, hh, mm] = match;
    const dow = DAY_MAP[dayAbbr];
    if (dow === undefined) continue;
    weeklySlots.push({ dow, hh, mm, slotMinutes: parseInt(hh) * 60 + parseInt(mm) });
  }
  if (weeklySlots.length === 0) return null;

  // Search up to 8 weeks ahead for the first slot that's not booked
  for (let dayOffset = 0; dayOffset <= 56; dayOffset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + dayOffset);
    const candidateDow = candidate.getDay();
    const dateISO = formatDateISO(candidate);

    const slotsToday = weeklySlots.filter(s => s.dow === candidateDow);
    for (const s of slotsToday.sort((a,b) => a.slotMinutes - b.slotMinutes)) {
      if (dayOffset === 0 && s.slotMinutes <= todayMinutes) continue; // already passed today
      const key = `${dateISO} ${s.hh}:${s.mm}`;
      if (bookedSlots.has(key)) continue; // already reserved by another patient

      let label;
      if (dayOffset === 0) label = `Hoy ${s.hh}:${s.mm}`;
      else if (dayOffset === 1) label = `Mañana ${s.hh}:${s.mm}`;
      else {
        const fullDayNames = { "Dom":"Domingo", "Lun":"Lunes", "Mar":"Martes", "Mié":"Miércoles", "Jue":"Jueves", "Vie":"Viernes", "Sáb":"Sábado" };
        const dayAbbrRev = Object.keys(DAY_MAP).find(k => DAY_MAP[k] === candidateDow);
        label = `${fullDayNames[dayAbbrRev] || dayAbbrRev} ${s.hh}:${s.mm}`;
      }
      return { label, daysAhead: dayOffset };
    }
  }
  return null; // fully booked for 8 weeks (unlikely)
}

// Build a Set of "YYYY-MM-DD HH:MM" strings for a doctor's already-booked (non-cancelled) appointments
function getBookedSlotsForDoctor(allAppointments, doctorId) {
  const set = new Set();
  for (const a of allAppointments || []) {
    if (a.doctor_id !== doctorId) continue;
    if (a.status === "cancelada") continue;
    if (!a.date || !a.time) continue;
    set.add(`${a.date} ${a.time}`);
  }
  return set;
}

// Calculate membership status: days until next monthly due date, and whether reminder/overdue
function getMembershipStatus(membershipPaidAt) {
  if (!membershipPaidAt) return { daysLeft: null, status: "sin_pago", dueDate: null };
  const paidDate = new Date(membershipPaidAt);
  const dueDate = new Date(paidDate);
  dueDate.setDate(dueDate.getDate() + 30);
  const now = new Date();
  const msLeft = dueDate.getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

  let status;
  if (daysLeft < 0) status = "vencido";
  else if (daysLeft <= 3) status = "urgente";
  else if (daysLeft <= 7) status = "proximo";
  else status = "ok";

  return { daysLeft, status, dueDate: dueDate.toISOString().slice(0,10) };
}

function formatDateISO2(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// Build calendar days for current month, marking which days the doctor works and have free slots
function buildAvailabilityCalendar(schedule, bookedSlots) {
  bookedSlots = bookedSlots || new Set();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayMinutes = now.getHours() * 60 + now.getMinutes();
  const todayISO = formatDateISO2(now);

  // Detect format: new dated format "2026-06-23 9:00" or old weekly "Lun 9:00"
  const isDateFormat = (schedule || []).some(s => s.match(/^\d{4}-\d{2}-\d{2}/));

  // Build availability set from schedule
  const availableSlots = new Set(schedule || []);

  // Old weekly format: build weeklySlots
  const weeklySlots = [];
  if (!isDateFormat) {
    for (const slot of (schedule || [])) {
      const match = slot.match(/^(\p{L}{3})\s+(\d{1,2}):(\d{2})/u);
      if (!match) continue;
      const dow = DAY_MAP[match[1]];
      if (dow === undefined) continue;
      weeklySlots.push({ dow, time: `${match[2]}:${match[3]}` });
    }
  }

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dateISO = formatDateISO2(date);
    const dow = date.getDay();
    const isPastDay = dateISO < todayISO;

    let slotsForDay = [];
    if (isDateFormat) {
      // New format: look for slots matching this specific date
      for (const slot of (schedule || [])) {
        const m = slot.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/);
        if (m && m[1] === dateISO) slotsForDay.push({ time: m[2] });
      }
    } else {
      // Old weekly format
      slotsForDay = weeklySlots.filter(s => s.dow === dow);
    }

    const times = isPastDay ? [] : slotsForDay.map(s => {
      const [hh, mm] = s.time.split(":").map(Number);
      const slotMinutes = hh * 60 + (mm || 0);
      const isPast = dateISO === todayISO && slotMinutes <= todayMinutes;
      const isBooked = bookedSlots.has(`${dateISO} ${s.time}`);
      return { time: s.time, available: !isPast && !isBooked };
    });

    days.push({ dateISO, dayNum: d, dow, times, isPastDay, hasAvailable: times.some(t => t.available), worksThisDay: slotsForDay.length > 0 });
  }
  return days;
}

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
    sub: { fontSize: 14, color: "#bae6fd", margin: "0 0 28px" },
    label: { display: "block", fontSize: 11, color: "#bae6fd", marginBottom: 5, letterSpacing: 0.8, textTransform: "uppercase" },
    inp: { width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(59,130,196,0.25)", borderRadius: 10, padding: "12px 14px", color: "#e8f0f8", fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 16 },
    btn: { width: "100%", padding: "13px 0", background: "linear-gradient(135deg, #0ea5e9, #7dd3fc)", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 16, fontWeight: 700, fontFamily: "inherit", marginTop: 4, boxShadow: "0 6px 24px rgba(59,130,196,0.3)" },
    link: { background: "none", border: "none", color: "#7dd3fc", cursor: "pointer", fontSize: 13, fontFamily: "inherit", textDecoration: "underline", padding: 0 },
    error: { background: "rgba(255,100,100,0.1)", border: "1px solid rgba(255,100,100,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff6b6b", fontSize: 13, marginBottom: 16 },
    success: { background: "rgba(59,130,196,0.1)", border: "1px solid rgba(59,130,196,0.3)", borderRadius: 8, padding: "10px 14px", color: "#e0f2fe", fontSize: 13, marginBottom: 16 },
    close: { position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#bae6fd", fontSize: 22, cursor: "pointer" },
    tabs: { display: "flex", gap: 8, marginBottom: 24 },
    tab: (a) => ({ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${a ? "#7dd3fc" : "rgba(59,130,196,0.2)"}`, background: a ? "rgba(59,130,196,0.15)" : "transparent", color: a ? "#7dd3fc" : "#bae6fd", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: a ? 700 : 400 }),
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

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#bae6fd" }}>
          {mode === "login" ? (
            <>¿Olvidaste tu contraseña? <button style={s.link} onClick={() => setMode("forgot")}>Recuperar</button></>
          ) : (
            <>¿Ya tienes cuenta? <button style={s.link} onClick={() => setMode("login")}>Inicia sesión</button></>
          )}
        </div>

        {mode === "forgot" && (
          <div style={{ marginTop: 16, padding: 14, background: "rgba(59,130,196,0.08)", borderRadius: 10, fontSize: 13, color: "#bae6fd" }}>
            Escribe tu email arriba y contacta a <strong style={{ color: "#7dd3fc" }}>913 330 712</strong> por WhatsApp para recuperar tu contraseña.
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
  const amount = isMembership ? 99 : AVANCE.monto;

  const METHODS = [
    { id: "yape", label: "Yape", icon: "🟣", sub: "Pago instantáneo — 0% comisión", color: "#6C3FC5" },
    { id: "plin", label: "Plin", icon: "🟢", sub: "BCP, Scotiabank, BBVA, Interbank", color: "#00B14F" },
  ];

  async function processPayment() {
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
    label: { display: "block", fontSize: 11, color: "#bae6fd", marginBottom: 5, letterSpacing: 0.8, textTransform: "uppercase" },
    errTxt: { color: "#ff6b6b", fontSize: 11, marginTop: 3, display: "block" },
    payBtn: { width: "100%", padding: "14px 0", background: "linear-gradient(135deg, #0ea5e9, #7dd3fc)", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 16, fontWeight: 700, fontFamily: "inherit", marginTop: 16, boxShadow: "0 6px 24px rgba(59,130,196,0.3)" },
    backBtn: { background: "none", border: "none", color: "#7dd3fc", cursor: "pointer", fontSize: 13, padding: "0 0 16px", fontFamily: "inherit" },
    bankRow: { display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(59,130,196,0.1)", fontSize: 14 },
    copyBtn: { background: "rgba(59,130,196,0.15)", border: "1px solid rgba(59,130,196,0.3)", color: "#7dd3fc", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
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
      <h3 style={{ color: "#7dd3fc", fontSize: 22, margin: "0 0 8px" }}>Procesando pago...</h3>
      <p style={{ color: "#bae6fd" }}>Por favor no cierres esta ventana</p>
      <div style={{ marginTop: 24, height: 4, background: "rgba(59,130,196,0.15)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", background: "linear-gradient(90deg,#0ea5e9,#7dd3fc)", borderRadius: 2, animation: "prog 2s ease forwards" }} />
      </div>
    </div></div>
  );

  if (step === "done") return (
    <div style={s.overlay}><div style={{ ...s.box, textAlign: "center", padding: "60px 32px" }}>
      <div style={{ fontSize: 72, marginBottom: 16 }}>✅</div>
      <h3 style={{ color: "#7dd3fc", fontSize: 24, margin: "0 0 8px" }}>{isMembership ? "¡Membresía registrada!" : "¡Pago exitoso!"}</h3>
      <p style={{ color: "#bae6fd" }}>S/. {amount} {isMembership ? "— Verificaremos tu pago en breve" : "pagados correctamente"}</p>
    </div></div>
  );

  return (
    <div style={s.overlay}>
      <div style={s.box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e8f0f8" }}>💳 {isMembership ? "Pagar membresía" : "Pagar cita médica"}</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#bae6fd" }}>Transacción segura — MediPerú</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#bae6fd", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ background: "rgba(59,130,196,0.07)", border: "1px solid rgba(59,130,196,0.15)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, color: "#e8f0f8", fontWeight: 700 }}>{isMembership ? "Plan Profesional — MediAyacucho" : doctor?.name}</div>
              <div style={{ fontSize: 12, color: "#bae6fd" }}>{isMembership ? "Membresía mensual" : `${bookingData?.date} · ${bookingData?.time}`}</div>
              {!isMembership && <div style={{ fontSize: 11, color: "#F4A261", marginTop: 4 }}>⚠️ {AVANCE.politica}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#F4A261" }}>S/. {amount}</div>
              {!isMembership && <div style={{ fontSize: 11, color: "#bae6fd" }}>adelanto de {doctor?.price}</div>}
            </div>
          </div>
        </div>

        {step === "choose" && (
          <>
            <p style={{ fontSize: 13, color: "#bae6fd", margin: "0 0 14px" }}>Selecciona tu método de pago:</p>
            {METHODS.map(m => (
              <button key={m.id} style={s.methodBtn(method === m.id, m.color)} onClick={() => setMethod(m.id)}>
                <span style={{ fontSize: 26 }}>{m.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: method === m.id ? "#e8f0f8" : "#e0f2fe", fontSize: 15 }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: "#bae6fd" }}>{m.sub}</div>
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
                  <span style={{ color: "#e0f2fe", fontSize: 14 }}>{txt}</span>
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
                <span style={{ color: "#bae6fd" }}>Monto:</span><strong style={{ color: "#7dd3fc" }}>S/. {amount}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
                <span style={{ color: "#bae6fd" }}>Concepto:</span><strong style={{ color: "#e8f0f8" }}>{concept}</strong>
              </div>
            </div>
            <button style={s.payBtn} onClick={() => { const msg = `🟣 *COMPROBANTE YAPE - MediPerú*\n\n💰 Monto: S/. ${amount}\n📋 Concepto: ${concept}\n\n📎 Adjunto captura de Yape.`; window.open(`https://wa.me/51913330712?text=${encodeURIComponent(msg)}`, "_blank"); processPayment(); }}>
              💬 Enviar comprobante y confirmar pago
            </button>
          </>
        )}

        {step === "form" && method === "plin" && (
          <>
            <button style={s.backBtn} onClick={() => setStep("choose")}>← Cambiar método</button>
            <div style={s.steps}>
              {[["Abre tu app bancaria (BCP, Scotiabank, BBVA o Interbank)","#00B14F"],["Envía S/. "+amount+" por Plin al 913 330 712","#00B14F"],["Concepto: "+concept,"#00B14F"],["Envía la captura por WhatsApp","#00B14F"]].map(([txt,c],i)=>(
                <div key={i} style={s.stepRow(c)}>
                  <div style={s.stepNum(c)}>{i+1}</div>
                  <span style={{ color: "#e0f2fe", fontSize: 14 }}>{txt}</span>
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
                <span style={{ color: "#bae6fd" }}>Monto:</span><strong style={{ color: "#7dd3fc" }}>S/. {amount}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
                <span style={{ color: "#bae6fd" }}>Concepto:</span><strong style={{ color: "#e8f0f8" }}>{concept}</strong>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["BCP","Scotiabank","BBVA","Interbank"].map(b=>(
                  <span key={b} style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(0,177,79,0.15)", color: "#00B14F", fontSize: 11, border: "1px solid rgba(0,177,79,0.3)" }}>{b}</span>
                ))}
              </div>
            </div>
            <button style={s.payBtn} onClick={() => { const msg = `🟢 *COMPROBANTE PLIN - MediPerú*\n\n💰 Monto: S/. ${amount}\n📋 Concepto: ${concept}\n\n📎 Adjunto captura de Plin.`; window.open(`https://wa.me/51913330712?text=${encodeURIComponent(msg)}`, "_blank"); processPayment(); }}>
              💬 Enviar comprobante y confirmar pago
            </button>
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
    tab: (a) => ({ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${a ? "#7dd3fc" : "rgba(59,130,196,0.25)"}`, background: a ? "rgba(59,130,196,0.15)" : "transparent", color: a ? "#7dd3fc" : "#bae6fd", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }),
    nCard: (d) => ({ background: d ? "rgba(59,130,196,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${d ? "rgba(59,130,196,0.4)" : "rgba(59,130,196,0.15)"}`, borderRadius: 14, padding: 16, marginBottom: 12 }),
    preview: { background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: 10, fontSize: 11, color: "#e0f2fe", whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: 90, overflowY: "auto", marginBottom: 10 },
    btnWa: { width: "100%", padding: "10px 0", background: "linear-gradient(135deg, #25D366, #128C7E)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" },
    btnSms: { width: "100%", padding: "10px 0", background: "linear-gradient(135deg, #0ea5e9, #7dd3fc)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" },
  };
  return (
    <div style={s.overlay}>
      <div style={s.box}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: "#7dd3fc", margin: "0 0 4px" }}>📲 Notificaciones</h3>
        <p style={{ color: "#bae6fd", fontSize: 13, margin: "0 0 20px" }}>Envía confirmaciones a {bookingData.patient_name} y al médico</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button style={s.tab(isWa)} onClick={() => setNotifMethod("whatsapp")}>💬 WhatsApp</button>
          <button style={s.tab(!isWa)} onClick={() => setNotifMethod("sms")}>📱 SMS</button>
        </div>
        {notifs.map(n => (
          <div key={n.key} style={s.nCard(sent[n.key])}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#e8f0f8" }}>{n.icon} {n.title}</span>
              {sent[n.key] && <span style={{ background: "rgba(59,130,196,0.2)", color: "#7dd3fc", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>Enviado ✓</span>}
            </div>
            <div style={s.preview}>{n.msg}</div>
            {isWa
              ? <button style={s.btnWa} onClick={() => openLink(buildWhatsAppLink(n.phone, n.msg), n.key)}>💬 Abrir WhatsApp</button>
              : <button style={s.btnSms} onClick={() => openLink(buildSmsLink(n.phone, n.msg), n.key)}>📱 Enviar SMS</button>
            }
          </div>
        ))}
        <button style={{ width: "100%", marginTop: 16, padding: "12px 0", background: "transparent", border: "1.5px solid rgba(59,130,196,0.4)", color: "#7dd3fc", borderRadius: 12, cursor: "pointer", fontSize: 15, fontFamily: "inherit" }} onClick={onClose}>Cerrar</button>
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
  const [profileData, setProfileData] = useState({ name: doctor.name, specialty: doctor.specialty, price: doctor.price, address: doctor.address || "", yape_plin_phone: doctor.yape_plin_phone || doctor.phone || "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(doctor.photo_url || null);
  const [waitlist, setWaitlist] = useState([]);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState("");

  const DAYS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  const HOURS = ["7:00","8:00","9:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00","23:00"];

  // Parse existing schedule into a Set of "YYYY-MM-DD HH:MM"
  const parseSchedule = (schedule) => {
    const set = new Set();
    for (const slot of (schedule || [])) {
      // Support both old format "Lun 9:00" and new "2026-06-23 9:00"
      if (slot.match(/^\d{4}-\d{2}-\d{2}/)) set.add(slot);
    }
    return set;
  };
  const [scheduleGrid, setScheduleGrid] = useState(() => parseSchedule(doctor.schedule));

  function toggleSlot(dateISO, hour) {
    const key = `${dateISO} ${hour}`;
    const next = new Set(scheduleGrid);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setScheduleGrid(next);
  }

  async function saveSchedule() {
    setSavingSchedule(true);
    const sorted = [...scheduleGrid].sort();
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/doctors?id=eq.${doctor.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Prefer": "return=representation",
        },
        body: JSON.stringify({ schedule: sorted }),
      });
      if (res.ok) {
        setScheduleMsg("✅ Horarios guardados correctamente");
      } else {
        const err = await res.text();
        setScheduleMsg("❌ Error: " + err);
      }
    } catch(e) {
      setScheduleMsg("❌ Error: " + e.message);
    }
    setSavingSchedule(false);
    setTimeout(() => setScheduleMsg(""), 4000);
  }

  const [loadingWaitlist, setLoadingWaitlist] = useState(true);

  useEffect(() => {
    db.getWaitlist(doctor.id).then(data => { setWaitlist(data || []); setLoadingWaitlist(false); }).catch(() => setLoadingWaitlist(false));
  }, [doctor.id]);

  async function notifyWaitlistManually(entry) {
    const waitMsg = `🎉 *¡Hay un cupo disponible! - MediAyacucho*\n\nHola ${entry.patient_name}, te escribimos porque pediste el horario del ${entry.desired_date} a las ${entry.desired_time} con ${doctor.name}.\n\n👉 Reserva ahora: ${window.location.origin}\n\n📍 MediAyacucho 🌿`;
    window.open(`https://wa.me/${entry.patient_phone.replace(/\D/g,"")}?text=${encodeURIComponent(waitMsg)}`, "_blank");
    await db.updateWaitlistEntry(entry.id, { status: "notificado", notified_at: new Date().toISOString() });
    setWaitlist(prev => prev.filter(w => w.id !== entry.id));
  }

  async function removeFromWaitlist(entry) {
    await db.updateWaitlistEntry(entry.id, { status: "cancelado" });
    setWaitlist(prev => prev.filter(w => w.id !== entry.id));
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const url = await db.uploadPhoto(file, doctor.id);
      setPhotoUrl(url);
      await db.updateDoctor(doctor.id, { photo_url: url });
    } catch (err) { alert("Error al subir la foto: " + err.message); }
    setUploadingPhoto(false);
  }
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTip, setAiTip] = useState("");
  const [showAddressChange, setShowAddressChange] = useState(false);
  const [addressChangeAppt, setAddressChangeAppt] = useState(null);
  const [newAddress, setNewAddress] = useState("");
  const [sendingAddress, setSendingAddress] = useState(false);

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
  const statusColor = { confirmada: "#0369a1", pendiente: "#c2410c", completada: "#15803d", cancelada: "#dc2626" };
  const statusBg = { confirmada: "#e0f2fe", pendiente: "#fff7ed", completada: "#f0fdf4", cancelada: "#fef2f2" };
  const filtered = filterStatus === "todas" ? appointments : appointments.filter(a => a.status === filterStatus);
  const maxCitas = Math.max(...MONTHLY_DATA.map(d => d.citas));

  async function updateStatus(id, newStatus, canceledByDoctor = false) {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
    await db.updateAppointment(id, { status: newStatus });

    // Si la cita se completa → enviar WhatsApp de solicitud de reseña
    if (newStatus === "completada") {
      const appt = appointments.find(a => a.id === id);
      if (appt) {
        const reviewUrl = `${window.location.origin}?review=${appt.id}&doctor=${doctor.id}`;
        const reviewMsg = `⭐ *¿Cómo fue tu consulta? - MediAyacucho*

Hola ${appt.patient_name}, gracias por confiar en ${doctor.name}.

¿Podrías dejarnos tu opinión? Solo toma 30 segundos:

👉 ${reviewUrl}

¡Tu opinión ayuda a otros pacientes! 🙏

📍 MediAyacucho 🌿`;
        setTimeout(() => {
          window.open(`https://wa.me/${appt.patient_phone.replace(/\D/g,"")}?text=${encodeURIComponent(reviewMsg)}`, "_blank");
        }, 800);
      }
    }

    // Si una cita se cancela (por médico o admin) → liberar el horario y avisar al primero en lista de espera
    if (newStatus === "cancelada") {
      const appt = appointments.find(a => a.id === id);
      if (appt) {
        try {
          const waitlistEntries = await db.getWaitlist(doctor.id);
          const timeOnly = (appt.time || "").match(/(\d{1,2}:\d{2})/)?.[1] || appt.time;
          const match = (waitlistEntries || []).find(w => w.desired_date === appt.date && (w.desired_time || "").includes(timeOnly));
          if (match) {
            const waitMsg = `🎉 *¡Se liberó un horario! - MediAyacucho*\n\nHola ${match.patient_name}, el horario que esperabas con ${doctor.name} (${match.desired_date} · ${match.desired_time}) acaba de quedar disponible.\n\n👉 Reserva ahora antes que otro paciente lo tome: ${window.location.origin}\n\n📍 MediAyacucho 🌿`;
            setTimeout(() => {
              window.open(`https://wa.me/${match.patient_phone.replace(/\D/g,"")}?text=${encodeURIComponent(waitMsg)}`, "_blank");
            }, 2200);
            await db.updateWaitlistEntry(match.id, { status: "notificado", notified_at: new Date().toISOString() });
          }
        } catch (e) { console.error("Error checking waitlist:", e); }
      }
    }

    // Si le médecin annule → déclencher remboursement automatique
    if (newStatus === "cancelada" && canceledByDoctor) {
      const appt = appointments.find(a => a.id === id);
      if (!appt) return;

      // Message WhatsApp au patient
      const msgPatient = `😔 *CITA CANCELADA - MediAyacucho*\n\nHola ${appt.patient_name}, lamentamos informarte que tu cita con ${doctor.name} del ${appt.date} a las ${appt.time} ha sido cancelada por el médico.\n\n💰 *TU ADELANTO SERÁ REEMBOLSADO*\nS/. ${AVANCE.monto} serán devueltos a tu Yape/Plin en las próximas 24h.\n\nDisculpa los inconvenientes. Puedes reservar con otro médico en mediayacucho.vercel.app\n\n📍 MediAyacucho 🌿`;

      // Message WhatsApp à l'admin pour rembourser
      const msgAdmin = `⚠️ *REEMBOLSO REQUERIDO - MediAyacucho*\n\nEl Dr./Dra. ${doctor.name} canceló una cita.\n\n👤 Paciente: ${appt.patient_name}\n📞 Yape/Plin del paciente: ${appt.patient_phone}\n💰 Monto a reembolsar: S/. ${AVANCE.monto}\n📅 Cita cancelada: ${appt.date} · ${appt.time}\n\n✅ Por favor yapea/plina S/. ${AVANCE.monto} al ${appt.patient_phone} a la brevedad.`;

      // Abrir WhatsApp con el paciente
      setTimeout(() => {
        window.open(`https://wa.me/${appt.patient_phone.replace(/\D/g,"")}?text=${encodeURIComponent(msgPatient)}`, "_blank");
      }, 500);

      // Abrir WhatsApp con el admin
      setTimeout(() => {
        window.open(`https://wa.me/51913330712?text=${encodeURIComponent(msgAdmin)}`, "_blank");
      }, 1500);
    }
  }

  // Cancelación por parte del médico con confirmación
  function cancelByDoctor(appt) {
    if (!window.confirm(`¿Cancelar la cita de ${appt.patient_name} del ${appt.date}?\nSe enviará un WhatsApp de reembolso automáticamente.`)) return;
    updateStatus(appt.id, "cancelada", true);
  }

  async function sendAddressChange() {
    if (!newAddress.trim() || !addressChangeAppt) return;
    setSendingAddress(true);
    const msg = `📍 *CAMBIO DE DIRECCIÓN - MediAyacucho*\n\nHola ${addressChangeAppt.patient_name}, te informamos que hubo un cambio de última hora en la dirección de tu cita:\n\n👨‍⚕️ ${doctor.name}\n📅 ${addressChangeAppt.date} · 🕐 ${addressChangeAppt.time}\n\n📍 *Nueva dirección:*\n${newAddress}\n\nDisculpa los inconvenientes. ¡Te esperamos! 🌿`;
    window.open(`https://wa.me/${addressChangeAppt.patient_phone.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`, "_blank");
    // Update appointment notes in Supabase
    await db.updateAppointment(addressChangeAppt.id, { notes: `Dirección cambiada: ${newAddress}` });
    setSendingAddress(false);
    setShowAddressChange(false);
    setNewAddress("");
    setAddressChangeAppt(null);
  }

  async function getAiTip() {
    setAiLoading(true); setAiTip("");
    try {
      const summary = `Médico: ${doctor.name}, especialidad: ${doctor.specialty}. Citas hoy: ${todayAppts.length}. Completadas: ${completedCount}. Canceladas: ${cancelledCount}. Rating: ${doctor.rating}. Ingresos: S/. ${totalIncome}.`;
      const resp = await fetch("/api/claude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ max_tokens: 300, system: "Eres un consultor médico de negocios experto en Perú. Da un consejo práctico, específico y breve en español.", messages: [{ role: "user", content: `Dame UN consejo para mejorar mi práctica esta semana: ${summary}` }] }) });
      const data = await resp.json();
      setAiTip(data.content?.map(b => b.text || "").join("") || "No se pudo obtener el consejo.");
    } catch { setAiTip("Error de conexión."); }
    setAiLoading(false);
  }

  const s = {
    wrap: { minHeight: "100vh", background: "#ffffff", fontFamily: "'Inter', sans-serif", color: "#082f49" },
    topbar: { background: "rgba(255,255,255,0.95)", borderBottom: "1px solid #e0f2fe", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, position: "sticky", top: 0, zIndex: 50 },
    avatar: { width: 40, height: 40, borderRadius: 10, background: doctor.color || "#0ea5e9", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#fff" },
    sidebar: { width: 220, minHeight: "calc(100vh - 64px)", background: "#f8fafc", borderRight: "1px solid #e0f2fe", padding: "24px 0", position: "fixed", top: 64 },
    sideBtn: (a) => ({ display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", cursor: "pointer", background: a ? "#e0f2fe" : "transparent", borderLeft: a ? "3px solid #0ea5e9" : "3px solid transparent", color: a ? "#0369a1" : "#64748b", fontSize: 14, border: "none", width: "100%", textAlign: "left", fontFamily: "inherit" }),
    main: { marginLeft: 220, padding: "32px" },
    kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16, marginBottom: 28 },
    kpiCard: (accent) => ({ background: "#ffffff", border: `1px solid ${accent}33`, borderRadius: 16, padding: "20px 24px", boxShadow:"0 8px 24px rgba(15,23,42,0.05)" }),
    kpiNum: (accent) => ({ fontSize: 34, fontWeight: 700, color: accent, display: "block", margin: "4px 0" }),
    kpiLabel: { fontSize: 12, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase" },
    card: { background: "#ffffff", border: "1px solid #e0f2fe", borderRadius: 16, padding: 24, marginBottom: 20, boxShadow:"0 8px 24px rgba(15,23,42,0.05)" },
    cardTitle: { fontSize: 16, fontWeight: 700, color: "#082f49", margin: "0 0 16px" },
    apptRow: (st) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10, background: statusBg[st] || "#f8fafc", marginBottom: 8, flexWrap: "wrap", gap: 8 }),
    statusPill: (st) => ({ padding: "3px 10px", borderRadius: 12, background: statusBg[st], color: statusColor[st], fontSize: 11, fontWeight: 700, textTransform: "uppercase" }),
    selectBtn: { background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "4px 10px", color: "#0369a1", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
    filterPill: (a) => ({ padding: "6px 14px", borderRadius: 20, border: `1px solid ${a ? "#0ea5e9" : "#cbd5e1"}`, background: a ? "#e0f2fe" : "#ffffff", color: a ? "#0369a1" : "#64748b", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }),
    toggleBtn: (on) => ({ padding: "8px 20px", borderRadius: 10, border: "none", background: on ? "linear-gradient(135deg, #0ea5e9, #7dd3fc)" : "#fee2e2", color: on ? "#fff" : "#dc2626", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }),
    inp: { width: "100%", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "8px 12px", color: "#082f49", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 10 },
    saveBtn: { padding: "10px 24px", background: "linear-gradient(135deg, #0ea5e9, #7dd3fc)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 },
    lbl: { display: "block", fontSize: 12, color: "#0369a1", marginBottom: 4, fontWeight: 600 },
  };

  const navItems = [
    { id: "overview", icon: "📊", label: "Resumen" },
    { id: "appointments", icon: "📅", label: "Citas" },
    { id: "calendario", icon: "🗓️", label: "Mis horarios" },
    { id: "waitlist", icon: "⏰", label: "Lista de espera" },
    { id: "analytics", icon: "📈", label: "Estadísticas" },
    { id: "profile", icon: "👤", label: "Mi Perfil" },
    { id: "ai", icon: "🤖", label: "Consejo IA" },
  ];

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={s.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {photoUrl
            ? <img src={photoUrl} alt={doctor.name} style={{ width:40, height:40, borderRadius:10, objectFit:"cover", border:"1px solid #7dd3fc" }} />
            : <div style={s.avatar}>{doctor.img || initials(doctor.name)}</div>
          }
          <div>
            <div style={{ fontWeight: 700, color: "#082f49", fontSize: 15 }}>{doctor.name}</div>
            <div style={{ fontSize: 11, color: "#0369a1" }}>{doctor.specialty} · Panel Médico</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={s.toggleBtn(isAvailable)} onClick={toggleAvailable}>{isAvailable ? "🟢 Disponible" : "🔴 No disponible"}</button>
          <button onClick={onExit} style={{ padding: "8px 16px", background: "transparent", border: "1px solid #bae6fd", color: "#475569", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>← Salir</button>
        </div>
      </div>

      <div style={s.sidebar}>
        {navItems.map(n => <button key={n.id} style={s.sideBtn(tab === n.id)} onClick={() => setTab(n.id)}><span>{n.icon}</span> {n.label}</button>)}
        <div style={{ padding: "24px 24px 0", borderTop: "1px solid #e0f2fe", marginTop: 24 }}>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>MEMBRESÍA ACTIVA</div>
          <div style={{ fontSize: 13, color: "#0369a1", fontWeight: 700 }}>Plan Profesional</div>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>S/. 99/mes</div>
          {(() => {
            const ms = getMembershipStatus(doctor.membership_paid_at);
            const msColors = { vencido: "#dc2626", urgente: "#c2410c", proximo: "#ca8a04", ok: "#15803d", sin_pago: "#64748b" };
            const msLabels = {
              vencido: `🔴 Vencida hace ${Math.abs(ms.daysLeft)} día(s)`,
              urgente: `🟠 Vence en ${ms.daysLeft} día(s)`,
              proximo: `🟡 Vence en ${ms.daysLeft} día(s)`,
              ok: `🟢 Vigente (${ms.daysLeft}d restantes)`,
              sin_pago: "⚪ Sin registro de pago",
            };
            return <div style={{ fontSize: 11, fontWeight: 700, color: msColors[ms.status] }}>{msLabels[ms.status]}</div>;
          })()}
        </div>
      </div>

      <div style={s.main}>

        {tab === "overview" && (
          <>
            <h2 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 700 }}>Buenos días 👋</h2>
            <div style={s.kpiGrid}>
              <div style={s.kpiCard("#0369a1")}><span style={s.kpiLabel}>Citas hoy</span><span style={s.kpiNum("#0369a1")}>{todayAppts.length}</span></div>
              <div style={s.kpiCard("#F4A261")}><span style={s.kpiLabel}>Pendientes</span><span style={s.kpiNum("#F4A261")}>{appointments.filter(a=>a.status==="pendiente").length}</span></div>
              <div style={s.kpiCard("#475569")}><span style={s.kpiLabel}>Completadas</span><span style={s.kpiNum("#475569")}>{completedCount}</span></div>
              <div style={s.kpiCard("#0369a1")}><span style={s.kpiLabel}>Ingresos</span><span style={s.kpiNum("#0369a1")}>S/. {totalIncome}</span></div>
              <div style={s.kpiCard("#F4A261")}><span style={s.kpiLabel}>Calificación</span><span style={s.kpiNum("#F4A261")}>⭐ {doctor.rating}</span></div>
            </div>
            <div style={s.card}>
              <p style={s.cardTitle}>📅 Agenda de hoy</p>
              {loadingAppts ? <p style={{ color: "#475569" }}>Cargando...</p> : todayAppts.length === 0
                ? <p style={{ color: "#475569", fontSize: 14 }}>No hay citas para hoy.</p>
                : todayAppts.map(a => (
                  <div key={a.id} style={s.apptRow(a.status)}>
                    <div>
                      <span style={{ fontWeight: 700, color: "#082f49" }}>{a.time} · {a.patient_name}</span>
                      <span style={{ display: "block", fontSize: 12, color: "#475569" }}>📞 {a.patient_phone}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={s.statusPill(a.status)}>{a.status}</span>
                      {a.status === "pendiente" && <button style={{ ...s.selectBtn, color: "#0369a1", borderColor: "#0369a1" }} onClick={() => updateStatus(a.id, "confirmada")}>Confirmar</button>}
                      {a.status === "confirmada" && <button style={{ ...s.selectBtn, color: "#475569" }} onClick={() => updateStatus(a.id, "completada")}>Completar</button>}
                      {(a.status === "pendiente" || a.status === "confirmada") && <button style={{ ...s.selectBtn, color: "#ff6b6b", borderColor: "#ff6b6b" }} onClick={() => cancelByDoctor(a)}>✗ Cancelar</button>}
                      {(a.status === "pendiente" || a.status === "confirmada") && (
                        <button style={{ ...s.selectBtn, color: "#F4A261", borderColor: "#F4A261" }} onClick={() => { setAddressChangeAppt(a); setShowAddressChange(true); }}>📍 Dir.</button>
                      )}
                    </div>
                  </div>
                ))
              }
            </div>
          </>
        )}

        {tab === "appointments" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>📅 Todas las citas</h2>
              <div style={{ background: "rgba(255,100,100,0.08)", border: "1px solid rgba(255,100,100,0.25)", borderRadius: 12, padding: "10px 16px", fontSize: 13, color: "#ff6b6b", display: "flex", alignItems: "center", gap: 8 }}>
                <span>🚨</span>
                <span>¿Cambio de dirección de última hora?</span>
              </div>
            </div>

            {/* ADDRESS CHANGE MODAL */}
            {showAddressChange && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(10px)" }}>
                <div style={{ background: "#ffffff", border: "2px solid rgba(255,100,100,0.4)", borderRadius: 20, padding: 32, maxWidth: 480, width: "100%" }}>
                  <h3 style={{ margin: "0 0 8px", color: "#ff6b6b", fontSize: 20 }}>🚨 Cambio de dirección urgente</h3>
                  <p style={{ margin: "0 0 20px", color: "#475569", fontSize: 13 }}>Se enviará un WhatsApp inmediato al paciente con la nueva dirección.</p>
                  {addressChangeAppt && (
                    <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13 }}>
                      <div style={{ fontWeight: 700, color: "#082f49" }}>{addressChangeAppt.patient_name}</div>
                      <div style={{ color: "#475569" }}>📅 {addressChangeAppt.date} · 🕐 {addressChangeAppt.time} · 📞 {addressChangeAppt.patient_phone}</div>
                    </div>
                  )}
                  <label style={{ display: "block", fontSize: 11, color: "#475569", marginBottom: 6, letterSpacing: 0.8, textTransform: "uppercase" }}>NUEVA DIRECCIÓN</label>
                  <input
                    style={{ width: "100%", background: "#f0f9ff", border: "2px solid rgba(255,100,100,0.4)", borderRadius: 10, padding: "12px 14px", color: "#082f49", fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 16 }}
                    placeholder="Ej: Jr. Lima 210, Of. 3, 2do piso — Referencia: frente al BCP"
                    value={newAddress}
                    onChange={e => setNewAddress(e.target.value)}
                    autoFocus
                  />
                  <div style={{ background: "rgba(244,162,97,0.08)", border: "1px solid rgba(244,162,97,0.2)", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12, color: "#c2410c" }}>
                    💡 El paciente recibirá este mensaje por WhatsApp inmediatamente.
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      style={{ flex: 1, padding: "12px 0", background: "linear-gradient(135deg,#25D366,#128C7E)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 15, fontWeight: 700, fontFamily: "inherit", opacity: !newAddress.trim() ? 0.5 : 1 }}
                      onClick={sendAddressChange}
                      disabled={!newAddress.trim() || sendingAddress}
                    >
                      {sendingAddress ? "Enviando..." : "💬 Enviar WhatsApp ahora"}
                    </button>
                    <button style={{ padding: "12px 20px", background: "transparent", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }} onClick={() => { setShowAddressChange(false); setNewAddress(""); setAddressChangeAppt(null); }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {["todas","pendiente","confirmada","completada","cancelada"].map(st => (
                <button key={st} style={s.filterPill(filterStatus === st)} onClick={() => setFilterStatus(st)}>{st.charAt(0).toUpperCase()+st.slice(1)}</button>
              ))}
            </div>
            <div style={s.card}>
              {loadingAppts ? <p style={{ color: "#475569" }}>Cargando desde Supabase...</p> : filtered.length === 0
                ? <p style={{ color: "#475569", fontSize: 14 }}>No hay citas con este filtro.</p>
                : filtered.map(a => (
                  <div key={a.id} style={s.apptRow(a.status)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontWeight: 700, color: "#082f49" }}>{a.patient_name}</span>
                        {a.modalidad === "virtual" && <span style={{ padding:"2px 8px", borderRadius:10, background:"rgba(37,211,102,0.15)", color:"#25D366", fontSize:11, fontWeight:700 }}>📱 VIRTUAL</span>}
                      </div>
                      <span style={{ display: "block", fontSize: 12, color: "#475569" }}>📅 {a.date} · 🕐 {a.time} · 📞 {a.patient_phone}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={s.statusPill(a.status)}>{a.status}</span>
                      {a.status === "pendiente" && <>
                        <button style={{ ...s.selectBtn, color:"#0369a1", borderColor:"#0369a1" }} onClick={() => updateStatus(a.id,"confirmada")}>✓ Confirmar</button>
                        <button style={{ ...s.selectBtn, color:"#ff6b6b", borderColor:"#ff6b6b" }} onClick={() => cancelByDoctor(a)}>✗ Cancelar</button>
                      </>}
                      {a.status === "confirmada" && <>
                        <button style={{ ...s.selectBtn, color:"#475569" }} onClick={() => updateStatus(a.id,"completada")}>✓ Completar</button>
                        <button style={{ ...s.selectBtn, color:"#ff6b6b", borderColor:"#ff6b6b" }} onClick={() => cancelByDoctor(a)}>✗ Cancelar</button>
                      </>}
                      {(a.status === "pendiente" || a.status === "confirmada") && a.modalidad !== "virtual" && (
                        <button style={{ ...s.selectBtn, color:"#F4A261", borderColor:"#F4A261" }} onClick={() => { setAddressChangeAppt(a); setShowAddressChange(true); }}>
                          📍 Cambiar dir.
                        </button>
                      )}
                      {a.modalidad === "virtual" && (a.status === "confirmada" || a.status === "pendiente") && (
                        <button style={{ ...s.selectBtn, color:"#25D366", borderColor:"#25D366", fontWeight:700 }} onClick={() => window.open(`https://wa.me/${a.patient_phone.replace(/\D/g,"")}`, "_blank")}>
                          📹 Llamar WA
                        </button>
                      )}
                      <button style={{ ...s.selectBtn, color:"#25D366", borderColor:"#25D366" }} onClick={() => window.open(buildWhatsAppLink(a.patient_phone,`Hola ${a.patient_name}, le contacta ${doctor.name}. ¿En qué le puedo ayudar?`),"_blank")}>💬 WA</button>
                    </div>
                  </div>
                ))
              }
            </div>
          </>
        )}

        {tab === "calendario" && (() => {
          const now = new Date();
          const year = now.getFullYear();
          const month = now.getMonth();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const todayISO = formatDateISO2(now);
          const monthName = now.toLocaleDateString("es-PE", { month:"long", year:"numeric" });
          const dayLettersFull = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

          // Build all days of current month
          const monthDays = [];
          for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            monthDays.push({ dateISO: formatDateISO2(date), dayNum: d, dayName: dayLettersFull[date.getDay()], isPast: formatDateISO2(date) < todayISO });
          }

          return (
            <>
              <h2 style={{ margin:"0 0 8px", fontSize:26, fontWeight:700 }}>🗓️ Mis horarios de atención</h2>
              <p style={{ color:"#475569", margin:"0 0 8px", fontSize:14 }}>Marca los días y horas en que atiendes pacientes este mes. El calendario de reservas se actualizará para los pacientes.</p>
              <p style={{ color:"#0369a1", fontWeight:700, fontSize:14, margin:"0 0 16px", textTransform:"capitalize" }}>📅 {monthName}</p>

              <div style={{ background:"#ffffff", border:"1px solid #e0f2fe", borderRadius:16, padding:16, boxShadow:"0 4px 16px rgba(15,23,42,0.05)", overflowX:"auto" }}>
                {/* Grid header - dates */}
                <div style={{ display:"grid", gridTemplateColumns:`56px repeat(${monthDays.length}, minmax(36px,1fr))`, gap:3, marginBottom:6 }}>
                  <div />
                  {monthDays.map(d => (
                    <div key={d.dateISO} style={{ textAlign:"center", padding:"4px 0" }}>
                      <div style={{ fontSize:10, fontWeight:700, color: d.isPast ? "#cbd5e1" : "#0369a1" }}>{d.dayName}</div>
                      <div style={{ fontSize:12, fontWeight:800, color: d.isPast ? "#cbd5e1" : "#082f49" }}>{d.dayNum}</div>
                    </div>
                  ))}
                </div>

                {/* Grid rows - hours */}
                {HOURS.map(hour => (
                  <div key={hour} style={{ display:"grid", gridTemplateColumns:`56px repeat(${monthDays.length}, minmax(36px,1fr))`, gap:3, marginBottom:3 }}>
                    <div style={{ fontSize:11, color:"#64748b", display:"flex", alignItems:"center", fontWeight:600 }}>{hour}</div>
                    {monthDays.map(day => {
                      const key = `${day.dateISO} ${hour}`;
                      const active = scheduleGrid.has(key);
                      return (
                        <button
                          key={key}
                          disabled={day.isPast}
                          onClick={() => toggleSlot(day.dateISO, hour)}
                          style={{
                            height:28, borderRadius:6,
                            border:`2px solid ${active ? "#0ea5e9" : day.isPast ? "#f1f5f9" : "#e2e8f0"}`,
                            background: active ? "linear-gradient(135deg,#0ea5e9,#7dd3fc)" : day.isPast ? "#fafafa" : "#f8fafc",
                            cursor: day.isPast ? "default" : "pointer", transition:"all 0.15s",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            boxShadow: active ? "0 2px 6px rgba(14,165,233,0.25)" : "none",
                          }}>
                          {active && <span style={{ color:"#fff", fontSize:11, fontWeight:700 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Summary + save */}
              <div style={{ marginTop:16, background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:12, padding:16 }}>
                <p style={{ margin:"0 0 10px", fontSize:14, fontWeight:700, color:"#0369a1" }}>
                  {scheduleGrid.size === 0 ? "No has seleccionado ningún horario aún." : `${scheduleGrid.size} horario(s) seleccionado(s) este mes`}
                </p>
                {scheduleGrid.size > 0 && (
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14, maxHeight:80, overflowY:"auto" }}>
                    {[...scheduleGrid].sort().map(slot => (
                      <span key={slot} style={{ padding:"3px 8px", background:"#e0f2fe", border:"1px solid #7dd3fc", borderRadius:20, fontSize:11, color:"#0369a1", fontWeight:600, whiteSpace:"nowrap" }}>{slot}</span>
                    ))}
                  </div>
                )}
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <button style={s.saveBtn} onClick={saveSchedule} disabled={savingSchedule}>
                    {savingSchedule ? "Guardando..." : "💾 Guardar horarios"}
                  </button>
                  {scheduleMsg && <span style={{ color:"#15803d", fontWeight:700, fontSize:14 }}>{scheduleMsg}</span>}
                </div>
              </div>
            </>
          );
        })()}

        {tab === "waitlist" && (
          <>
            <h2 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 700 }}>⏰ Lista de espera</h2>
            <p style={{ color:"#475569", margin:"0 0 24px", fontSize:14 }}>Pacientes esperando un horario que ya está reservado. Si cancelas una cita, el primero de la lista es notificado automáticamente por WhatsApp.</p>
            {loadingWaitlist ? (
              <div style={{ textAlign:"center", padding:40, color:"#0369a1" }}>Cargando...</div>
            ) : waitlist.length === 0 ? (
              <div style={{ ...s.card, textAlign:"center", color:"#64748b" }}>
                <div style={{ fontSize:36, marginBottom:8 }}>📭</div>
                No hay pacientes en lista de espera actualmente.
              </div>
            ) : waitlist.map(w => (
              <div key={w.id} style={s.card}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                  <div>
                    <div style={{ fontWeight:700, color:"#082f49" }}>{w.patient_name}</div>
                    <div style={{ fontSize:13, color:"#475569" }}>📅 Quiere: {w.desired_date} · 🕐 {w.desired_time} · 📞 {w.patient_phone}</div>
                    <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>Anotado el {new Date(w.created_at).toLocaleDateString("es-PE")}</div>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button style={{ padding:"7px 14px", background:"#f0fdf4", border:"1px solid #bbf7d0", color:"#15803d", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }} onClick={() => notifyWaitlistManually(w)}>🔔 Avisar cupo libre</button>
                    <button style={{ padding:"7px 14px", background:"#fef2f2", border:"1px solid #fecaca", color:"#dc2626", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }} onClick={() => removeFromWaitlist(w)}>✕ Quitar</button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "analytics" && (
          <>
            <h2 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 700 }}>📈 Estadísticas</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              {[["📊 Citas por mes", MONTHLY_DATA, "citas", "#0369a1", maxCitas], ["💰 Ingresos (S/.)", MONTHLY_DATA, "ingresos", "#F4A261", 2100]].map(([title, data, key, color, max]) => (
                <div key={title} style={s.card}>
                  <p style={s.cardTitle}>{title}</p>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140, paddingTop: 16 }}>
                    {data.map(d => (
                      <div key={d.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color, fontWeight: 700 }}>{d[key]}</span>
                        <div style={{ width: "100%", background: `linear-gradient(180deg,${color},${color}88)`, borderRadius: "4px 4px 0 0", height: `${(d[key]/max)*100}px` }} />
                        <span style={{ fontSize: 10, color: "#475569" }}>{d.mes}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              {[
                { label: "Total citas", value: appointments.length, color: "#0369a1" },
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
                <div style={{ position: "relative" }}>
                  {photoUrl
                    ? <img src={photoUrl} alt={doctor.name} style={{ width: 72, height: 72, borderRadius: 18, objectFit: "cover", border: "2px solid #7dd3fc" }} />
                    : <div style={{ width: 72, height: 72, borderRadius: 18, background: doctor.color || "#0ea5e9", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 24, color: "#fff" }}>{doctor.img || initials(doctor.name)}</div>
                  }
                  <label style={{ position: "absolute", bottom: -6, right: -6, width: 26, height: 26, borderRadius: "50%", background: "#0369a1", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "2px solid #ffffff", fontSize: 13 }}>
                    {uploadingPhoto ? "⏳" : "📷"}
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} />
                  </label>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 20 }}>{profileData.name}</h3>
                  <p style={{ margin: "4px 0 0", color: "#475569" }}>{profileData.specialty} · {profileData.price}/consulta</p>
                  {profileData.address && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#0369a1" }}>📍 {profileData.address}</p>}
                  <div style={{ marginTop: 6 }}>⭐ {doctor.rating} · {isAvailable ? <span style={{ color: "#0369a1" }}>🟢 Disponible</span> : <span style={{ color: "#ff6b6b" }}>🔴 No disponible</span>}</div>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#475569" }}>📷 Haz clic en la cámara para cambiar tu foto</p>
                </div>
              </div>
              {editProfile ? (
                <>
                  {[["NOMBRE COMPLETO","name"],["ESPECIALIDAD","specialty"],["PRECIO CONSULTA","price"]].map(([lbl,key])=>(
                    <div key={key}><label style={s.lbl}>{lbl}</label><input style={s.inp} value={profileData[key]} onChange={e=>setProfileData({...profileData,[key]:e.target.value})} /></div>
                  ))}
                  <label style={s.lbl}>DIRECCIÓN DEL CONSULTORIO</label>
                  <input style={s.inp} placeholder="Jr. Lima 210, Of. 3, Ayacucho" value={profileData.address} onChange={e=>setProfileData({...profileData,address:e.target.value})} />
                  <p style={{ margin:"-6px 0 12px", fontSize: 11, color: "#475569" }}>📍 Visible para los pacientes al reservar</p>
                  <label style={s.lbl}>NÚMERO YAPE/PLIN (para recibir tus pagos)</label>
                  <input style={s.inp} placeholder="+51 9XX XXX XXX" value={profileData.yape_plin_phone} onChange={e=>setProfileData({...profileData,yape_plin_phone:e.target.value})} />
                  <p style={{ margin:"-6px 0 12px", fontSize: 11, color: "#475569" }}>💰 MediAyacucho te transferirá aquí el adelanto de cada cita confirmada</p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={s.saveBtn} onClick={saveProfile} disabled={savingProfile}>{savingProfile ? "Guardando..." : "Guardar en Supabase ✓"}</button>
                    <button style={{ ...s.saveBtn, background:"transparent", border:"1px solid #bae6fd", color:"#475569" }} onClick={() => setEditProfile(false)}>Cancelar</button>
                  </div>
                </>
              ) : (
                <button style={s.saveBtn} onClick={() => setEditProfile(true)}>✏️ Editar perfil</button>
              )}
            </div>
            <div style={s.card}>
              <p style={s.cardTitle}>📋 Horarios disponibles</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(doctor.schedule || []).map(h => <span key={h} style={{ padding: "8px 16px", borderRadius: 20, background: "#e0f2fe", border: "1px solid #bae6fd", color: "#0369a1", fontSize: 14 }}>{h}</span>)}
              </div>
            </div>
          </>
        )}

        {tab === "ai" && (
          <>
            <h2 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 700 }}>🤖 Consejo IA</h2>
            <p style={{ color: "#475569", margin: "0 0 24px" }}>La IA analiza tus datos reales y te da recomendaciones personalizadas</p>
            <div style={s.card}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 20 }}>
                {[["Citas hoy",todayAppts.length],["Pendientes",appointments.filter(a=>a.status==="pendiente").length],["Completadas",completedCount],["Canceladas",cancelledCount],["Rating",`⭐${doctor.rating}`]].map(([l,v],i)=>(
                  <div key={i} style={{ background:"#f0f9ff", borderRadius:10, padding:"10px 14px" }}>
                    <div style={{ fontSize:11, color:"#475569" }}>{l}</div>
                    <div style={{ fontSize:20, fontWeight:700, color:"#0369a1" }}>{v}</div>
                  </div>
                ))}
              </div>
              <button style={{ padding:"12px 28px", background:"linear-gradient(135deg,#0ea5e9,#0369a1)", color:"#fff", border:"none", borderRadius:12, cursor:"pointer", fontSize:15, fontWeight:700, fontFamily:"inherit", opacity:aiLoading?0.7:1 }} onClick={getAiTip} disabled={aiLoading}>
                {aiLoading ? "Analizando... ⏳" : "🤖 Obtener consejo personalizado"}
              </button>
              {aiTip && <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:12, padding:16, marginTop:16, fontSize:14, color:"#082f49", lineHeight:1.7, whiteSpace:"pre-wrap" }}>
                <div style={{ fontSize:12, color:"#0369a1", fontWeight:700, marginBottom:8 }}>💡 CONSEJO IA</div>{aiTip}
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
    await sb(`doctors?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ active: true, membership_paid_at: new Date().toISOString() }) });
    setActionMsg(`✅ ${name} activado`);
    loadAll();
    setTimeout(() => setActionMsg(""), 3000);
  }

  async function registerMembershipPayment(id, name) {
    await sb(`doctors?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ membership_paid_at: new Date().toISOString() }) });
    setActionMsg(`💰 Pago de membresía registrado para ${name}`);
    loadAll();
    setTimeout(() => setActionMsg(""), 3000);
  }

  async function markAdvanceSettled(apptId) {
    await sb(`appointments?id=eq.${apptId}`, { method: "PATCH", body: JSON.stringify({ advance_settled: true }) });
    setActionMsg(`✅ Adelanto marcado como reversado`);
    loadAll();
    setTimeout(() => setActionMsg(""), 3000);
  }

  async function markAllSettledForDoctor(doctorId, apptIds, doctorName) {
    if (!window.confirm(`¿Confirmas que ya reversaste S/. ${apptIds.length * AVANCE.monto} a ${doctorName}?`)) return;
    await Promise.all(apptIds.map(id => sb(`appointments?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ advance_settled: true }) })));
    setActionMsg(`✅ Reversado completo para ${doctorName}`);
    loadAll();
    setTimeout(() => setActionMsg(""), 3000);
  }

  async function deactivateDoctor(id, name) {
    await sb(`doctors?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ active: false }) });
    setActionMsg(`🔴 ${name} desactivado`);
    loadAll();
    setTimeout(() => setActionMsg(""), 3000);
  }

  function sendMembershipReminder(doctor) {
    const ms = getMembershipStatus(doctor.membership_paid_at);
    let msg;
    if (ms.status === "vencido") {
      msg = `🔴 *MediAyacucho - Membresía vencida*\n\nHola Dr(a). ${doctor.name},\n\nTu membresía mensual (S/. 99) venció hace ${Math.abs(ms.daysLeft)} día(s).\n\nPara seguir recibiendo citas de pacientes, realiza tu pago por Yape o Plin al 913 330 712 y envíanos el comprobante.\n\n¡Gracias por confiar en MediAyacucho! 🌿`;
    } else {
      msg = `💳 *MediAyacucho - Recordatorio de pago*\n\nHola Dr(a). ${doctor.name},\n\nTu membresía mensual (S/. 99) vence en ${ms.daysLeft} día(s) (${ms.dueDate}).\n\nPara evitar interrupciones, realiza tu pago por Yape o Plin al 913 330 712 y envíanos el comprobante.\n\n¡Gracias por confiar en MediAyacucho! 🌿`;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
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
    wrap: { minHeight: "100vh", background: "#ffffff", fontFamily: "'Inter', sans-serif", color: "#082f49" },
    topbar: { background: "rgba(255,255,255,0.97)", borderBottom: "1px solid #fecaca", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, position: "sticky", top: 0, zIndex: 50 },
    main: { maxWidth: 1100, margin: "0 auto", padding: "32px 24px" },
    kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 32 },
    kpiCard: (c) => ({ background: "#ffffff", border: `1px solid ${c}33`, borderRadius: 16, padding: "20px 24px", boxShadow:"0 8px 24px rgba(15,23,42,0.05)" }),
    kpiNum: (c) => ({ fontSize: 36, fontWeight: 700, color: c, display: "block", margin: "4px 0" }),
    kpiLabel: { fontSize: 11, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase" },
    tabs: { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" },
    tab: (a) => ({ padding: "10px 20px", borderRadius: 10, border: `1px solid ${a ? "#dc2626" : "#fecaca"}`, background: a ? "#fef2f2" : "transparent", color: a ? "#dc2626" : "#64748b", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: a ? 700 : 400 }),
    card: { background: "#ffffff", border: "1px solid #fee2e2", borderRadius: 14, padding: 20, marginBottom: 12, boxShadow:"0 8px 24px rgba(15,23,42,0.05)" },
    badge: (c) => ({ padding: "3px 10px", borderRadius: 20, background: `${c}1a`, color: c, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }),
    btn: (c) => ({ padding: "7px 14px", background: `${c}15`, border: `1px solid ${c}44`, color: c, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }),
    actionMsg: { position: "fixed", bottom: 24, right: 24, background: "#0ea5e9", border: "1px solid #7dd3fc", borderRadius: 12, padding: "12px 20px", color: "#fff", fontSize: 14, fontWeight: 700, zIndex: 200 },
  };

  // Citas de mañana para recordatorios
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const tomorrowAppts = appointments.filter(a => a.date === tomorrowStr && a.status !== "cancelada");

  const navTabs = [
    { id: "pending", label: `⏳ En espera (${pendingDoctors.length})` },
    { id: "active", label: `✅ Activos (${activeDoctors.length})` },
    { id: "appointments", label: `📅 Citas (${appointments.length})` },
    { id: "payments", label: `💰 Pagos (${payments.length})` },
    { id: "settlements", label: `💸 Reversar a médicos` },
    { id: "recordatorios", label: `⏰ Recordatorios (${tomorrowAppts.length})` },
  ];

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      {actionMsg && <div style={s.actionMsg}>{actionMsg}</div>}

      <div style={s.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#fee2e2", border: "1px solid #fca5a5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🛡️</div>
          <div>
            <div style={{ fontWeight: 700, color: "#082f49", fontSize: 15 }}>Panel Admin — MediAyacucho</div>
            <div style={{ fontSize: 11, color: "#ff6b6b" }}>Acceso restringido · Solo administrador</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={loadAll} style={{ padding: "8px 16px", background: "transparent", border: "1px solid #bae6fd", color: "#0369a1", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>🔄 Actualizar</button>
          <button onClick={onExit} style={{ padding: "8px 16px", background: "transparent", border: "1px solid #fecaca", color: "#ff6b6b", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>← Salir</button>
        </div>
      </div>

      <div style={s.main}>
        {/* KPIs */}
        <div style={s.kpiGrid}>
          <div style={s.kpiCard("#ff6b6b")}><span style={s.kpiLabel}>En espera</span><span style={s.kpiNum("#ff6b6b")}>{pendingDoctors.length}</span><span style={{ fontSize: 12, color: "#475569" }}>Médicos por verificar</span></div>
          <div style={s.kpiCard("#52B788")}><span style={s.kpiLabel}>Médicos activos</span><span style={s.kpiNum("#52B788")}>{activeDoctors.length}</span><span style={{ fontSize: 12, color: "#475569" }}>En la plataforma</span></div>
          <div style={s.kpiCard("#0369a1")}><span style={s.kpiLabel}>Total citas</span><span style={s.kpiNum("#0369a1")}>{appointments.length}</span><span style={{ fontSize: 12, color: "#475569" }}>Registradas</span></div>
          <div style={s.kpiCard("#F4A261")}><span style={s.kpiLabel}>Ingresos verificados</span><span style={s.kpiNum("#F4A261")}>S/. {totalIngresos}</span><span style={{ fontSize: 12, color: "#475569" }}>Membresías cobradas</span></div>
          <div style={s.kpiCard("#a78bfa")}><span style={s.kpiLabel}>Pagos pendientes</span><span style={s.kpiNum("#a78bfa")}>{payments.filter(p => p.status === "pendiente").length}</span><span style={{ fontSize: 12, color: "#475569" }}>Por verificar</span></div>
          <div style={s.kpiCard("#dc2626")}><span style={s.kpiLabel}>Membresías por vencer</span><span style={s.kpiNum("#dc2626")}>{activeDoctors.filter(d => ["vencido","urgente","proximo"].includes(getMembershipStatus(d.membership_paid_at).status)).length}</span><span style={{ fontSize: 12, color: "#475569" }}>Necesitan recordatorio</span></div>
          <div style={s.kpiCard("#c2410c")}><span style={s.kpiLabel}>Por reversar a médicos</span><span style={s.kpiNum("#c2410c")}>S/. {appointments.filter(a => (a.status === "confirmada" || a.status === "completada") && a.payment_status === "pagado" && !a.advance_settled).length * AVANCE.monto}</span><span style={{ fontSize: 12, color: "#475569" }}>Adelantos pendientes</span></div>
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          {navTabs.map(t => <button key={t.id} style={s.tab(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>

        {loading && <div style={{ textAlign: "center", padding: 40, color: "#475569" }}>⏳ Cargando datos...</div>}

        {/* MÉDICOS EN ESPERA */}
        {!loading && tab === "pending" && (
          <>
            <h3 style={{ margin: "0 0 16px", color: "#ff6b6b" }}>⏳ Médicos pendientes de verificación</h3>
            {pendingDoctors.length === 0
              ? <div style={{ ...s.card, textAlign: "center", color: "#475569" }}>✅ No hay médicos en espera</div>
              : pendingDoctors.map(doc => (
                <div key={doc.id} style={s.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: doc.color || "#0ea5e9", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff" }}>{doc.img || "?"}</div>
                        <div>
                          <div style={{ fontWeight: 700, color: "#082f49", fontSize: 16 }}>{doc.name}</div>
                          <div style={{ fontSize: 13, color: "#475569" }}>{doc.specialty} · 📞 {doc.phone}</div>
                        </div>
                      </div>
                      {doc.address && <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>📍 {doc.address}</div>}
                      <div style={{ fontSize: 11, color: "#475569" }}>Registrado: {new Date(doc.created_at).toLocaleDateString("es-PE")}</div>
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
            {activeDoctors.map(doc => {
              const ms = getMembershipStatus(doc.membership_paid_at);
              const msColors = { vencido: "#dc2626", urgente: "#c2410c", proximo: "#ca8a04", ok: "#15803d", sin_pago: "#64748b" };
              const msLabels = {
                vencido: `🔴 Vencido hace ${Math.abs(ms.daysLeft)}d`,
                urgente: `🟠 Vence en ${ms.daysLeft}d`,
                proximo: `🟡 Vence en ${ms.daysLeft}d`,
                ok: `🟢 Al día (${ms.daysLeft}d)`,
                sin_pago: "⚪ Sin registro de pago",
              };
              return (
                <div key={doc.id} style={s.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: doc.color || "#0ea5e9", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff" }}>{doc.img || "?"}</div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#082f49" }}>{doc.name}</div>
                        <div style={{ fontSize: 13, color: "#475569" }}>{doc.specialty} · {doc.price} · ⭐ {doc.rating}</div>
                        {doc.address && <div style={{ fontSize: 12, color: "#475569" }}>📍 {doc.address}</div>}
                        <div style={{ marginTop: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: msColors[ms.status] }}>{msLabels[ms.status]} · Plan Profesional S/. 99</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={s.badge(doc.available ? "#52B788" : "#ff6b6b")}>{doc.available ? "Disponible" : "No disponible"}</span>
                      {(ms.status === "urgente" || ms.status === "vencido" || ms.status === "proximo") && (
                        <button style={s.btn("#F4A261")} onClick={() => sendMembershipReminder(doc)}>🔔 Recordar pago</button>
                      )}
                      <button style={s.btn("#0ea5e9")} onClick={() => registerMembershipPayment(doc.id, doc.name)}>💰 Registrar pago</button>
                      <button style={s.btn("#25D366")} onClick={() => window.open(`https://wa.me/${doc.phone}`, "_blank")}>💬 WA</button>
                      <button style={s.btn("#ff6b6b")} onClick={() => deactivateDoctor(doc.id, doc.name)}>🔴 Suspender</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* CITAS */}
        {!loading && tab === "appointments" && (
          <>
            <h3 style={{ margin: "0 0 16px", color: "#0369a1" }}>📅 Últimas citas registradas</h3>
            {appointments.length === 0
              ? <div style={{ ...s.card, textAlign: "center", color: "#475569" }}>No hay citas registradas</div>
              : appointments.map(a => (
                <div key={a.id} style={s.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#082f49" }}>{a.patient_name}</div>
                      <div style={{ fontSize: 13, color: "#475569" }}>📅 {a.date} · 🕐 {a.time} · 📞 {a.patient_phone}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>Pago: {a.payment_method || "No especificado"} · {a.payment_status}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={s.badge(a.status === "confirmada" ? "#52B788" : a.status === "cancelada" ? "#ff6b6b" : a.status === "completada" ? "#0369a1" : "#F4A261")}>{a.status}</span>
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
              ? <div style={{ ...s.card, textAlign: "center", color: "#475569" }}>No hay pagos registrados</div>
              : payments.map(p => (
                <div key={p.id} style={s.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#082f49" }}>S/. {p.amount} · {p.method?.toUpperCase()}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>{new Date(p.created_at).toLocaleDateString("es-PE")} · {new Date(p.created_at).toLocaleTimeString("es-PE")}</div>
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

        {/* REVERSAR A MÉDICOS */}
        {!loading && tab === "settlements" && (() => {
          const owedAppts = appointments.filter(a =>
            (a.status === "confirmada" || a.status === "completada") &&
            a.payment_status === "pagado" &&
            !a.advance_settled
          );
          const byDoctor = {};
          for (const a of owedAppts) {
            if (!byDoctor[a.doctor_id]) byDoctor[a.doctor_id] = [];
            byDoctor[a.doctor_id].push(a);
          }
          const doctorIds = Object.keys(byDoctor);

          return (
            <>
              <h3 style={{ margin: "0 0 8px", color: "#0369a1" }}>💸 Adelantos por reversar a médicos</h3>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "#475569" }}>Cuando una cita se confirma o completa (sin cancelación), el adelanto de S/. {AVANCE.monto} que pagó el paciente debe ser transferido al médico por Yape/Plin. Marca cada uno como reversado una vez hecho el envío.</p>
              {doctorIds.length === 0 ? (
                <div style={{ ...s.card, textAlign: "center", color: "#475569" }}>✅ No hay adelantos pendientes de reversar</div>
              ) : doctorIds.map(docId => {
                const doc = activeDoctors.find(d => d.id === docId) || pendingDoctors.find(d => d.id === docId);
                const appts = byDoctor[docId];
                const total = appts.length * AVANCE.monto;
                return (
                  <div key={docId} style={s.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: doc?.color || "#0ea5e9", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff" }}>{doc?.img || "?"}</div>
                        <div>
                          <div style={{ fontWeight: 700, color: "#082f49" }}>{doc?.name || "Médico desconocido"}</div>
                          <div style={{ fontSize: 13, color: "#475569" }}>📱 Yape/Plin: {doc?.yape_plin_phone || doc?.phone || "No registrado"}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: "#c2410c" }}>S/. {total}</span>
                        <button style={s.btn("#0ea5e9")} onClick={() => window.open(`https://wa.me/${(doc?.phone||"").replace(/\D/g,"")}`, "_blank")}>💬 WA</button>
                        <button style={s.btn("#15803d")} onClick={() => markAllSettledForDoctor(docId, appts.map(a=>a.id), doc?.name || "el médico")}>✅ Marcar todo reversado</button>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {appts.map(a => (
                        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: 8, fontSize: 13 }}>
                          <span style={{ color: "#334155" }}>👤 {a.patient_name} · 📅 {a.date} · 🕐 {a.time}</span>
                          <button style={{ padding: "4px 10px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit" }} onClick={() => markAdvanceSettled(a.id)}>✓ Reversado</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* RECORDATORIOS */}
        {!loading && tab === "recordatorios" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h3 style={{ margin: "0 0 4px", color: "#F4A261" }}>⏰ Recordatorios del día siguiente</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>Citas programadas para mañana <strong style={{ color: "#082f49" }}>{tomorrowStr}</strong> — {tomorrowAppts.length} paciente(s)</p>
              </div>
              {tomorrowAppts.length > 0 && (
                <button style={{ padding: "10px 20px", background: "linear-gradient(135deg,#25D366,#128C7E)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}
                  onClick={() => {
                    tomorrowAppts.forEach((a, i) => {
                      const doctorName = activeDoctors.find(d => d.id === a.doctor_id)?.name || "el médico";
                      const doctorAddress = activeDoctors.find(d => d.id === a.doctor_id)?.address || "";
                      const msg = `⏰ *RECORDATORIO DE CITA - MediAyacucho*\n\nHola ${a.patient_name}, te recordamos tu cita MAÑANA:\n\n👨‍⚕️ ${doctorName}\n🕐 ${a.time}\n📍 ${doctorAddress || "Consultorio del médico"}\n\n💡 Recuerda llegar 10 minutos antes.\n\nPara cancelar escribe al 913 330 712 con +48h de anticipación.\n\n📍 MediAyacucho 🌿`;
                      setTimeout(() => {
                        window.open(`https://wa.me/${a.patient_phone.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`, "_blank");
                      }, i * 1500);
                    });
                    setActionMsg(`📲 Enviando ${tomorrowAppts.length} recordatorio(s)...`);
                    setTimeout(() => setActionMsg(""), 5000);
                  }}>
                  📲 Enviar todos los recordatorios ({tomorrowAppts.length})
                </button>
              )}
            </div>

            {tomorrowAppts.length === 0 ? (
              <div style={{ ...s.card, textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <div style={{ color: "#475569", fontSize: 16 }}>No hay citas programadas para mañana</div>
                <div style={{ color: "#475569", fontSize: 13, marginTop: 8 }}>Vuelve a revisar más tarde</div>
              </div>
            ) : (
              <>
                <div style={{ background: "rgba(244,162,97,0.08)", border: "1px solid rgba(244,162,97,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#F4A261" }}>
                  💡 Haz clic en <strong>"Enviar todos"</strong> para abrir WhatsApp con cada paciente automáticamente, o usa el botón individual por cada cita.
                </div>
                {tomorrowAppts.map((a, i) => {
                  const doc = activeDoctors.find(d => d.id === a.doctor_id);
                  const msg = `⏰ *RECORDATORIO DE CITA - MediAyacucho*\n\nHola ${a.patient_name}, te recordamos tu cita MAÑANA:\n\n👨‍⚕️ ${doc?.name || "el médico"}\n🕐 ${a.time}\n📍 ${doc?.address || "Consultorio del médico"}\n\n💡 Recuerda llegar 10 minutos antes.\n\nPara cancelar escribe al 913 330 712 con +48h de anticipación.\n\n📍 MediAyacucho 🌿`;
                  return (
                    <div key={a.id} style={s.card}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: "#082f49", fontSize: 15 }}>{a.patient_name}</div>
                          <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>🕐 {a.time} · 📞 {a.patient_phone}</div>
                          {doc && <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>👨‍⚕️ {doc.name} · 📍 {doc.address || "Sin dirección"}</div>}
                          <div style={{ fontSize: 11, color: a.status === "confirmada" ? "#52B788" : "#F4A261", marginTop: 4, fontWeight: 700 }}>
                            {a.status === "confirmada" ? "✅ Confirmada" : "⏳ Pendiente de confirmar"}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button style={s.btn("#25D366")} onClick={() => window.open(`https://wa.me/${a.patient_phone.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`, "_blank")}>
                            💬 Recordatorio
                          </button>
                          <button style={s.btn("#0369a1")} onClick={() => window.open(`https://wa.me/${a.patient_phone.replace(/\D/g,"")}`, "_blank")}>
                            📞 WA
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}


// ─── Doctor Public Profile ─────────────────────────────────────────────────
function DoctorProfile({ doctor, onBook, onBack, allAppointments }) {
  const [tab, setTab] = useState("info");
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const profileUrl = `${window.location.origin}?medico=${doctor.id}`;

  useEffect(() => {
    db.getReviews(doctor.id).then(data => { setReviews(data || []); setLoadingReviews(false); }).catch(() => setLoadingReviews(false));
  }, [doctor.id]);

  const s = {
    wrap: { maxWidth: 720, margin: "0 auto", padding: "32px 24px", position: "relative", zIndex: 1 },
    hero: { background: `linear-gradient(135deg, ${doctor.color || "#0ea5e9"}10, #ffffff)`, border: `1px solid ${doctor.color || "#0ea5e9"}33`, borderRadius: 20, padding: 32, marginBottom: 24, position: "relative", overflow: "hidden", boxShadow:"0 8px 28px rgba(15,23,42,0.06)" },
    avatar: { width: 80, height: 80, borderRadius: 20, background: doctor.color || "#0ea5e9", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 28, color: "#fff", marginBottom: 16 },
    badge: (c) => ({ padding: "4px 12px", borderRadius: 20, background: `${c}15`, color: c, fontSize: 12, fontWeight: 700, border: `1px solid ${c}44` }),
    tab: (a) => ({ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${a ? "#0ea5e9" : "#e2e8f0"}`, background: a ? "#e0f2fe" : "transparent", color: a ? "#0369a1" : "#64748b", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }),
    card: { background: "#ffffff", border: "1px solid #e0f2fe", borderRadius: 14, padding: 20, marginBottom: 16, boxShadow:"0 8px 28px rgba(15,23,42,0.05)" },
    shareBtn: { padding: "10px 20px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 },
  };

  return (
    <div style={s.wrap}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#0369a1", cursor: "pointer", fontSize: 15, marginBottom: 20, padding: 0, fontFamily: "inherit" }}>← Volver</button>

      {/* HERO */}
      <div style={s.hero}>
        <div style={{ position: "absolute", top: 0, right: 0, width: 200, height: 200, borderRadius: "50%", background: `${doctor.color || "#0ea5e9"}15`, transform: "translate(50px,-50px)" }} />
        {doctor.photo_url
          ? <img src={doctor.photo_url} alt={doctor.name} style={{ width:80, height:80, borderRadius:20, objectFit:"cover", marginBottom:16, border:"3px solid #7dd3fc" }} />
          : <div style={s.avatar}>{doctor.img || initials(doctor.name)}</div>
        }
        <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 700, color: "#082f49" }}>{doctor.name}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={s.badge("#0369a1")}>{doctor.specialty}</span>
          <span style={s.badge("#25D366")}>✅ Verificado CMP</span>
          {doctor.available ? <span style={s.badge("#52B788")}>🟢 Disponible</span> : <span style={s.badge("#ff6b6b")}>🔴 No disponible</span>}
        </div>
        <div style={{ color: "#F4A261", fontSize: 16, marginBottom: 12 }}>{"★".repeat(Math.floor(doctor.rating || 5))} <span style={{ color: "#082f49", fontWeight: 700 }}>{doctor.rating}</span> <span style={{ color: "#475569", fontSize: 13 }}>calificación</span></div>
        {(() => {
          const booked = getBookedSlotsForDoctor(allAppointments, doctor.id);
          const next = getNextAvailability(doctor.schedule, booked);
          if (!next) return null;
          const isSoon = next.daysAhead <= 1;
          return (
            <div style={{ display:"inline-flex", alignItems:"center", gap:6, marginBottom:12, padding:"6px 14px", borderRadius:10, background: isSoon ? "rgba(37,211,102,0.12)" : "#e0f2fe", border:`1px solid ${isSoon ? "rgba(37,211,102,0.3)" : "#e0f2fe"}` }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background: isSoon ? "#25D366" : "#0369a1" }} />
              <span style={{ fontSize:13, fontWeight:700, color: isSoon ? "#25D366" : "#0369a1" }}>Próxima cita disponible: {next.label}</span>
            </div>
          );
        })()}
        {doctor.address && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
            <span>📍</span>
            <a href={doctor.maps_url || "#"} target="_blank" rel="noreferrer" style={{ color: "#0369a1", fontSize: 14, textDecoration: "none" }}>{doctor.address}</a>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {doctor.available && (
            <>
              <button style={{ padding: "12px 24px", background: "linear-gradient(135deg,#0ea5e9,#0369a1)", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 700, fontFamily: "inherit" }}
                onClick={() => onBook(doctor, "presencial")}>🏥 Reservar presencial</button>
              <button style={{ padding: "12px 24px", background: "linear-gradient(135deg,#25D366,#128C7E)", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 700, fontFamily: "inherit" }}
                onClick={() => onBook(doctor, "virtual")}>📱 Reservar virtual</button>
            </>
          )}
          <button style={s.shareBtn} onClick={() => {
            navigator.clipboard?.writeText(profileUrl);
            const msg = `👨‍⚕️ Te recomiendo al *${doctor.name}* en MediAyacucho!\n\n🏥 ${doctor.specialty}\n⭐ ${doctor.rating} calificación\n\nReserva tu cita aquí: ${profileUrl}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
          }}>💬 Compartir en WhatsApp</button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <button style={s.tab(tab === "info")} onClick={() => setTab("info")}>ℹ️ Información</button>
        <button style={s.tab(tab === "horarios")} onClick={() => setTab("horarios")}>📅 Horarios</button>
        <button style={s.tab(tab === "precios")} onClick={() => setTab("precios")}>💰 Precios</button>
        <button style={s.tab(tab === "resenas")} onClick={() => setTab("resenas")}>⭐ Reseñas</button>
      </div>

      {tab === "info" && (
        <div style={s.card}>
          <h3 style={{ margin: "0 0 16px", color: "#0369a1", fontSize: 17 }}>👨‍⚕️ Sobre el médico</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "Especialidad", value: doctor.specialty, icon: "🏥" },
              { label: "Calificación", value: `⭐ ${doctor.rating}/5.0`, icon: "⭐" },
              { label: "Estado", value: doctor.available ? "Disponible" : "No disponible", icon: "🟢" },
              { label: "Verificación", value: "CMP Verificado", icon: "✅" },
            ].map((item, i) => (
              <div key={i} style={{ background: "#f0f9ff", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{item.icon} {item.label}</div>
                <div style={{ fontWeight: 700, color: "#082f49", fontSize: 15 }}>{item.value}</div>
              </div>
            ))}
          </div>
          {doctor.address && (
            <div style={{ marginTop: 16, padding: "12px 16px", background: "#f0f9ff", borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>📍 DIRECCIÓN DEL CONSULTORIO</div>
              <div style={{ color: "#082f49", fontSize: 14 }}>{doctor.address}</div>
              <a href={doctor.maps_url || "#"} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#0369a1", display: "inline-block", marginTop: 8, textDecoration: "none", background: "#e0f2fe", border: "1px solid #bae6fd", padding: "4px 12px", borderRadius: 20 }}>🗺️ Ver en Google Maps</a>
            </div>
          )}
        </div>
      )}

      {tab === "horarios" && (
        <div style={s.card}>
          <h3 style={{ margin: "0 0 16px", color: "#0369a1", fontSize: 17 }}>📅 Horarios de atención</h3>
          {(doctor.schedule || []).length === 0
            ? <p style={{ color: "#475569" }}>Horarios por confirmar</p>
            : (doctor.schedule || []).map((h, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < doctor.schedule.length - 1 ? "1px solid #e0f2fe" : "none" }}>
                <span style={{ color: "#082f49", fontSize: 14 }}>🕐 {h}</span>
                <span style={{ padding: "3px 10px", borderRadius: 20, background: "#e0f2fe", color: "#0369a1", fontSize: 12 }}>Disponible</span>
              </div>
            ))
          }
          <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(37,211,102,0.08)", borderRadius: 10, fontSize: 13, color: "#25D366" }}>
            📱 También disponible para consultas virtuales por WhatsApp Video
          </div>
        </div>
      )}

      {tab === "precios" && (
        <div style={s.card}>
          <h3 style={{ margin: "0 0 16px", color: "#0369a1", fontSize: 17 }}>💰 Precios</h3>
          {[
            { tipo: "🏥 Consulta presencial", precio: doctor.price, desc: "En consultorio" },
            { tipo: "📱 Consulta virtual", precio: doctor.price, desc: "Por WhatsApp Video" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: i === 0 ? "1px solid #e0f2fe" : "none" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#082f49", fontSize: 15 }}>{item.tipo}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>{item.desc}</div>
              </div>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#0369a1" }}>{item.precio}</span>
            </div>
          ))}
          <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(244,162,97,0.08)", border: "1px solid rgba(244,162,97,0.2)", borderRadius: 10, fontSize: 12, color: "#F4A261" }}>
            💡 Se requiere un adelanto de <strong>S/. {AVANCE.monto}</strong> para reservar. {AVANCE.politica}.
          </div>
        </div>
      )}

      {tab === "resenas" && (
        <div style={s.card}>
          <h3 style={{ margin: "0 0 16px", color: "#0369a1", fontSize: 17 }}>⭐ Reseñas de pacientes</h3>

          {/* Resumen de calificación */}
          <div style={{ display: "flex", gap: 24, alignItems: "center", marginBottom: 20, padding: "16px 20px", background: "#f0f9ff", borderRadius: 12 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, fontWeight: 700, color: "#F4A261" }}>{doctor.rating}</div>
              <div style={{ color: "#F4A261", fontSize: 20 }}>{"★".repeat(Math.floor(doctor.rating || 5))}</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{reviews.length > 0 ? `${reviews.length} reseña(s)` : "Calificación promedio"}</div>
            </div>
            <div style={{ flex: 1 }}>
              {[5,4,3,2,1].map(n => {
                const countForStar = reviews.filter(r => r.stars === n).length;
                const pct = reviews.length > 0 ? (countForStar / reviews.length) * 100 : (n === Math.floor(doctor.rating || 5) ? 70 : n === Math.ceil(doctor.rating || 5) ? 40 : 10);
                return (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "#475569", width: 8 }}>{n}</span>
                    <span style={{ color: "#F4A261", fontSize: 12 }}>★</span>
                    <div style={{ flex: 1, height: 6, background: "#f0f9ff", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "#F4A261", borderRadius: 3, width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {loadingReviews ? (
            <p style={{ textAlign:"center", color:"#64748b", fontSize:14, padding:"20px 0" }}>Cargando reseñas...</p>
          ) : reviews.length === 0 ? (
            <div style={{ textAlign:"center", padding:"24px 0", color:"#64748b" }}>
              <div style={{ fontSize:36, marginBottom:8 }}>💬</div>
              <p style={{ margin:0, fontSize:14 }}>Aún no hay reseñas para este médico.</p>
              <p style={{ margin:"4px 0 0", fontSize:13 }}>¡Sé el primero en dejar tu opinión después de tu cita!</p>
            </div>
          ) : reviews.map((r, i) => (
            <div key={r.id || i} style={{ padding: "14px 0", borderBottom: i < reviews.length - 1 ? "1px solid #e0f2fe" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#0369a1", fontSize: 13 }}>{(r.patient_name||"P")[0]}</div>
                  <span style={{ fontWeight: 700, color: "#082f49", fontSize: 14 }}>{r.patient_name || "Paciente"}</span>
                </div>
                <span style={{ fontSize: 12, color: "#475569" }}>{r.created_at ? new Date(r.created_at).toLocaleDateString("es-PE") : ""}</span>
              </div>
              <div style={{ color: "#F4A261", fontSize: 14, marginBottom: 6 }}>{"★".repeat(r.stars)}</div>
              {r.comment && <p style={{ margin: 0, color: "#334155", fontSize: 14, lineHeight: 1.5 }}>{r.comment}</p>}
            </div>
          ))}

          <div style={{ marginTop: 16, background: "#f0f9ff", borderRadius: 10, padding: 14, fontSize: 13, color: "#475569", textAlign: "center" }}>
            💡 Las reseñas son enviadas por los pacientes después de cada consulta completada.
          </div>
        </div>
      )}

      {/* SHARE SECTION */}
      <div style={{ background: "#f0f9ff", border: "1px solid #e0f2fe", borderRadius: 14, padding: 20, textAlign: "center" }}>
        <p style={{ margin: "0 0 12px", color: "#475569", fontSize: 14 }}>¿Conoces a alguien que necesite este médico?</p>
        <button style={{ padding: "10px 24px", background: "linear-gradient(135deg,#25D366,#128C7E)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}
          onClick={() => {
            const msg = `👨‍⚕️ Te recomiendo al *${doctor.name}* en MediAyacucho!\n\n🏥 ${doctor.specialty}\n⭐ ${doctor.rating} calificación\n📍 ${doctor.address || "Ayacucho"}\n\nReserva tu cita aquí: ${profileUrl}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
          }}>
          💬 Compartir perfil por WhatsApp
        </button>
      </div>
    </div>
  );
}

// ─── Review Submission Page ────────────────────────────────────────────────
function ReviewSubmit({ appointmentId, doctorId, onDone }) {
  const [doctor, setDoctor] = useState(null);
  const [stars, setStars] = useState(0);
  const [hoverStar, setHoverStar] = useState(0);
  const [comment, setComment] = useState("");
  const [patientName, setPatientName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [docs, existing, appts] = await Promise.all([
          sb(`doctors?id=eq.${doctorId}`),
          db.checkReviewExists(appointmentId),
          sb(`appointments?id=eq.${appointmentId}`),
        ]);
        setDoctor(docs?.[0] || null);
        if (existing && existing.length > 0) setAlreadyReviewed(true);
        if (appts && appts.length > 0) setPatientName(appts[0].patient_name || "");
      } catch (e) { setError("No pudimos cargar la información."); }
      setLoading(false);
    }
    load();
  }, [appointmentId, doctorId]);

  async function submitReview() {
    if (stars === 0) return;
    setSubmitting(true);
    try {
      await db.createReview({
        doctor_id: doctorId,
        appointment_id: appointmentId,
        patient_name: patientName || "Paciente",
        stars,
        comment: comment.trim(),
      });
      // Recalculate doctor's average rating
      const allReviews = await db.getReviews(doctorId);
      const avg = allReviews.reduce((sum, r) => sum + r.stars, 0) / allReviews.length;
      await db.updateDoctor(doctorId, { rating: Math.round(avg * 10) / 10 });
      setSubmitted(true);
    } catch (e) { setError("Error al enviar tu opinión: " + e.message); }
    setSubmitting(false);
  }

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#ffffff", fontFamily:"'Inter', sans-serif" }}>
      <div style={{ color:"#0369a1", fontSize:18 }}>⏳ Cargando...</div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#ffffff", fontFamily:"'Inter', sans-serif", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ maxWidth:460, width:"100%" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28, justifyContent:"center" }}>
          <svg width="36" height="36" viewBox="0 0 72 72" fill="none">
            <circle cx="36" cy="36" r="36" fill="#0ea5e9"/>
            <rect x="28" y="14" width="16" height="44" rx="4" fill="white"/>
            <rect x="14" y="28" width="44" height="16" rx="4" fill="white"/>
          </svg>
          <span style={{ fontSize:20, fontWeight:700 }}><span style={{ color:"#0ea5e9" }}>Medi</span><span style={{ color:"#0c4a6e", fontWeight:300 }}>Ayacucho</span></span>
        </div>

        {error && <div style={{ background:"#fef2f2", border:"1px solid #fecaca", color:"#dc2626", borderRadius:12, padding:16, textAlign:"center", marginBottom:16 }}>{error}</div>}

        {!error && alreadyReviewed ? (
          <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:16, padding:32, textAlign:"center" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
            <h2 style={{ color:"#15803d", fontSize:20, margin:"0 0 8px" }}>¡Ya enviaste tu opinión!</h2>
            <p style={{ color:"#475569", fontSize:14, margin:0 }}>Gracias por ayudar a otros pacientes.</p>
          </div>
        ) : !error && submitted ? (
          <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:16, padding:32, textAlign:"center" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
            <h2 style={{ color:"#15803d", fontSize:20, margin:"0 0 8px" }}>¡Gracias por tu opinión!</h2>
            <p style={{ color:"#475569", fontSize:14, margin:0 }}>Tu reseña ayuda a otros pacientes a elegir el médico ideal.</p>
          </div>
        ) : !error && (
          <div style={{ background:"#ffffff", border:"1px solid #e0f2fe", borderRadius:16, padding:28, boxShadow:"0 8px 28px rgba(15,23,42,0.06)" }}>
            {doctor && (
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
                {doctor.photo_url
                  ? <img src={doctor.photo_url} alt={doctor.name} style={{ width:48, height:48, borderRadius:12, objectFit:"cover" }} />
                  : <div style={{ width:48, height:48, borderRadius:12, background:doctor.color||"#0ea5e9", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, color:"#fff" }}>{doctor.img||initials(doctor.name)}</div>
                }
                <div>
                  <div style={{ fontWeight:700, color:"#082f49", fontSize:16 }}>{doctor.name}</div>
                  <div style={{ fontSize:13, color:"#64748b" }}>{doctor.specialty}</div>
                </div>
              </div>
            )}

            <p style={{ textAlign:"center", color:"#475569", fontSize:15, margin:"0 0 16px" }}>¿Cómo calificarías tu consulta?</p>

            <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:24 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n}
                  onClick={() => setStars(n)}
                  onMouseEnter={() => setHoverStar(n)}
                  onMouseLeave={() => setHoverStar(0)}
                  style={{ background:"none", border:"none", cursor:"pointer", fontSize:36, padding:2, lineHeight:1, color: n <= (hoverStar||stars) ? "#F4A261" : "#e2e8f0", transition:"color 0.15s" }}>
                  ★
                </button>
              ))}
            </div>

            <label style={{ display:"block", fontSize:12, color:"#0369a1", marginBottom:6, fontWeight:600, textTransform:"uppercase", letterSpacing:0.5 }}>Cuéntanos tu experiencia (opcional)</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="¿Qué te gustó? ¿Algo que podríamos mejorar?"
              rows={4}
              style={{ width:"100%", background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:10, padding:"12px 14px", color:"#082f49", fontSize:14, fontFamily:"inherit", outline:"none", resize:"vertical", boxSizing:"border-box", marginBottom:20 }}
            />

            <button
              onClick={submitReview}
              disabled={stars === 0 || submitting}
              style={{ width:"100%", padding:"14px 0", background: stars === 0 ? "#cbd5e1" : "linear-gradient(135deg,#0ea5e9,#7dd3fc)", color:"#fff", border:"none", borderRadius:12, fontSize:16, fontWeight:700, cursor: stars === 0 ? "default" : "pointer", fontFamily:"inherit" }}>
              {submitting ? "Enviando..." : "✅ Enviar opinión"}
            </button>
          </div>
        )}

        <p style={{ textAlign:"center", color:"#94a3b8", fontSize:12, marginTop:20 }}>MediAyacucho · Salud para todos</p>
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
  const [specialtySearch, setSpecialtySearch] = useState("");
  const [doctorsViewMode, setDoctorsViewMode] = useState("list");
  const [messages, setMessages] = useState([{ role: "assistant", content: "¡Hola! Soy tu asistente médico IA de MediPerú. 🩺\n\nPuedo ayudarte a:\n• Encontrar el médico ideal para ti\n• Agendar una cita\n• Resolver dudas sobre síntomas\n\n¿En qué te puedo ayudar hoy?" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [bookingData, setBookingData] = useState({ patient_name: "", patient_phone: "", date: "", time: "", modalidad: "presencial" });
  const [confirmed, setConfirmed] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [lastBooking, setLastBooking] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [isMembershipPayment, setIsMembershipPayment] = useState(false);
  const [dashboardDoctor, setDashboardDoctor] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [session, setSession] = useState(() => auth.getSession());
  const [showAdmin, setShowAdmin] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [regData, setRegData] = useState({ name: "", specialty: "", email: "", phone: "", yape_plin_phone: "", address: "", reference: "", cmp: "", universidad: "" });
  const [cmpVerification, setCmpVerification] = useState(null); // null | loading | result
  const [diplomaFile, setDiplomaFile] = useState(null);
  const [diplomaBase64, setDiplomaBase64] = useState(null);
  const [regLoading, setRegLoading] = useState(false);
  const [regDone, setRegDone] = useState(false);
  const [pendingDoctorId, setPendingDoctorId] = useState(null);
  const [allAppointments, setAllAppointments] = useState([]);
  const [reviewParams, setReviewParams] = useState(null);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [selectedCalDay, setSelectedCalDay] = useState(null);
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reviewAppt = params.get("review");
    const reviewDoctor = params.get("doctor");
    if (reviewAppt && reviewDoctor) {
      setReviewParams({ appointmentId: reviewAppt, doctorId: reviewDoctor });
    }
  }, []);

  useEffect(() => {
    db.getDoctors()
      .then(data => { setDoctors(data); setLoadingDoctors(false); })
      .catch(e => { setDbError(e.message); setLoadingDoctors(false); });
    db.getAppointments().then(data => setAllAppointments(data || [])).catch(() => {});
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const filtered = !specialtySearch.trim() ? doctors : doctors.filter(d =>
    d.specialty?.toLowerCase().includes(specialtySearch.toLowerCase()) ||
    d.name?.toLowerCase().includes(specialtySearch.toLowerCase())
  );

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim(); setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const doctorList = doctors.map(d => `${d.name} (${d.specialty}, ${d.price}, ${d.available?"disponible":"no disponible"}, ${d.address||""})`).join("; ");
      const response = await fetch("/api/claude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ max_tokens: 1000, system: `Eres un asistente médico IA amable para Ayacucho, Perú. Médicos disponibles: ${doctorList}. Especialidades disponibles: Medicina General, Pediatría, Cardiología, Ginecología, Traumatología, Dermatología, Odontología, Oftalmología, Psicología, Nutrición, Neurología, Urología, Endocrinología, Oncología, Medicina Interna, Cirugía General, Gastroenterología, Nefrología, Neumología. Responde en español, cálido. Si el usuario describe síntomas, sugiere la especialidad más adecuada. Nunca diagnostiques. Máximo 3 párrafos.`, messages: [...messages, { role: "user", content: userMsg }].map(m => ({ role: m.role, content: m.content })) }) });
      const data = await response.json();
      const errMsg = data.error?.message || data.error?.error?.message || JSON.stringify(data).slice(0,200);
      setMessages(prev => [...prev, { role: "assistant", content: data.content?.map(b => b.text||"").join("") || `Error: ${errMsg}` }]);
    } catch (e) { setMessages(prev => [...prev, { role: "assistant", content: "Error de conexión: " + e.message }]); }
    setLoading(false);
  }

  async function confirmBooking() {
    if (!bookingData.patient_name || !bookingData.patient_phone || !bookingData.date || !bookingData.time) return;
    try {
      const appt = await db.createAppointment({ doctor_id: selectedDoctor.id, ...bookingData, amount: selectedDoctor.price, status: "pendiente", payment_status: "pendiente", modalidad: bookingData.modalidad || "presencial" });
      const apptId = Array.isArray(appt) ? appt[0]?.id : appt?.id;
      setLastBooking({ data: { ...bookingData, appointmentId: apptId }, doctor: selectedDoctor });
      setShowPayment(true);
      db.getAppointments().then(data => setAllAppointments(data || [])).catch(() => {});
    } catch (e) { alert("Error al guardar la cita: " + e.message); }
  }
  async function joinWaitlist() {
    if (!bookingData.patient_name || !bookingData.patient_phone || !bookingData.date || !bookingData.time) return;
    setWaitlistSubmitting(true);
    try {
      await db.addToWaitlist({
        doctor_id: selectedDoctor.id,
        patient_name: bookingData.patient_name,
        patient_phone: bookingData.patient_phone,
        desired_date: bookingData.date,
        desired_time: bookingData.time,
        status: "esperando",
      });
      setWaitlistDone(true);
    } catch (e) { alert("Error al anotarte en la lista de espera: " + e.message); }
    setWaitlistSubmitting(false);
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
    setSelectedCalDay(null);
  }

  async function verifyCMP() {
    if (!regData.cmp || !regData.name || !regData.specialty) return;
    setCmpVerification({ status: "loading" });
    try {
      const messages = [{ role: "user", content: diplomaBase64 ? [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: diplomaBase64 } },
        { type: "text", text: `Analiza esta imagen de diploma/título médico. El médico dice llamarse "${regData.name}", especialidad "${regData.specialty}", número CMP "${regData.cmp}", universidad "${regData.universidad}". Verifica: 1) ¿La imagen parece un diploma médico legítimo del Perú? 2) ¿El nombre en el diploma coincide? 3) ¿Hay signos de falsificación? 4) ¿El formato es oficial? Responde SOLO en JSON: {"score": 0-100, "valido": true/false, "nombre_coincide": true/false, "es_diploma": true/false, "alertas": ["alerta1"], "recomendacion": "APROBAR|REVISAR|RECHAZAR", "resumen": "explicación breve"}` }
      ] : [{ type: "text", text: `Soy el administrador de MediAyacucho, plataforma médica en Perú. Un médico quiere registrarse con estos datos: Nombre: "${regData.name}", Especialidad: "${regData.specialty}", Número CMP: "${regData.cmp}", Universidad: "${regData.universidad}". Basándote en tu conocimiento del sistema médico peruano: 1) ¿El formato del CMP es válido? (normalmente 5-6 dígitos) 2) ¿La especialidad existe en Perú? 3) ¿Hay inconsistencias sospechosas? 4) ¿Qué verificaciones manuales recomiendas? Responde SOLO en JSON sin markdown: {"score": 0-100, "valido": true/false, "formato_cmp_ok": true/false, "alertas": ["alerta1"], "recomendacion": "APROBAR|REVISAR|RECHAZAR", "verificar_en": "https://www.cmp.org.pe", "resumen": "explicación breve"}` }] }];

      const resp = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_tokens: 500, system: "Eres un sistema de verificación de credenciales médicas para Perú. Responde SIEMPRE en JSON válido sin markdown ni backticks.", messages })
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
      const colors = ["#0ea5e9","#0284c7","#38bdf8","#7dd3fc","#bae6fd","#1A56DB"];
      const color = colors[Math.floor(Math.random()*colors.length)];
      const cmpScore = cmpVerification?.result?.score || 0;
      const cmpStatus = cmpVerification?.result?.recomendacion || "SIN_VERIFICAR";
      const result = await db.registerDoctor({ name: regData.name, specialty: regData.specialty, phone: regData.phone, yape_plin_phone: regData.yape_plin_phone || regData.phone, address: regData.address, img, color, available: true, active: false, price: "S/. 60", rating: 5.0, email: regData.email });
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
  if (reviewParams) return (
    <ReviewSubmit
      appointmentId={reviewParams.appointmentId}
      doctorId={reviewParams.doctorId}
      onDone={() => setReviewParams(null)}
    />
  );

  if (selectedProfile && view === "profile") return (
    <div style={{ fontFamily: "'Inter', sans-serif", minHeight: "100vh", background: "#ffffff", color: "#082f49" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <header style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid #e0f2fe", padding: "0 24px", display: "flex", alignItems: "center", height: 64 }}>
        <div style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }} onClick={() => { setView("home"); setSelectedProfile(null); }}>
          <svg width="32" height="32" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="36" cy="36" r="36" fill="url(#lg2)"/>
            <rect x="28" y="14" width="16" height="44" rx="4" fill="white"/>
            <rect x="14" y="28" width="44" height="16" rx="4" fill="white"/>
            <circle cx="36" cy="36" r="5" fill="url(#lg2)"/>
            <defs>
              <linearGradient id="lg2" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#0ea5e9"/>
                <stop offset="100%" stopColor="#7dd3fc"/>
              </linearGradient>
            </defs>
          </svg>
          <span style={{ fontSize: 20, fontWeight: 700 }}><span style={{ color: "#0ea5e9" }}>Medi</span><span style={{ color: "#0c4a6e", fontWeight: 300 }}>Ayacucho</span></span>
        </div>
      </header>
      <DoctorProfile
        doctor={selectedProfile}
        onBack={() => { setView("doctors"); setSelectedProfile(null); }}
        onBook={(doc, modalidad) => { setSelectedDoctor(doc); setBookingData(p => ({...p, modalidad})); setSelectedProfile(null); setSelectedCalDay(null); setView("booking"); }}
        allAppointments={allAppointments}
      />
    </div>
  );

  const T = {
    app: { fontFamily: "'Inter', sans-serif", minHeight: "100vh", background: "linear-gradient(135deg, #030d1a 0%, #051628 50%, #030d1a 100%)", color: "#e8f0f8", position: "relative" },
    header: { position: "sticky", top: 0, zIndex: 100, background: "rgba(10,22,40,0.92)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(59,130,196,0.2)", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 },
    logo: { fontSize: 22, fontWeight: 700, color: "#7dd3fc" },
    logoSub: { fontSize: 11, color: "#bae6fd", letterSpacing: 3, textTransform: "uppercase", display: "block", marginTop: -4 },
    navBtn: (a, light) => ({ padding: "6px 12px", borderRadius: 8, border: a?"1px solid #0ea5e9":"1px solid transparent", background: a?"rgba(14,165,233,0.12)":"transparent", color: light ? (a?"#0284c7":"#0c4a6e") : (a?"#7dd3fc":"#e0f2fe"), cursor: "pointer", fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap" }),
    section: { maxWidth: 1100, margin: "0 auto", padding: "24px 16px", position: "relative", zIndex: 1 },
    ctaPrimary: { padding: "14px 32px", background: "linear-gradient(135deg, #0ea5e9, #7dd3fc)", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, cursor: "pointer", fontWeight: 600, fontFamily: "inherit", boxShadow: "0 8px 32px rgba(59,130,196,0.3)" },
    ctaSecondary: { padding: "14px 32px", background: "transparent", color: "#7dd3fc", border: "1.5px solid #7dd3fc", borderRadius: 12, fontSize: 16, cursor: "pointer", fontFamily: "inherit" },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 },
    card: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(59,130,196,0.15)", borderRadius: 16, padding: 24, transition: "all 0.3s" },
    avatar: (c) => ({ width: 56, height: 56, borderRadius: 14, background: c||"#0ea5e9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16 }),
    filterBtn: (a) => ({ padding: "8px 18px", borderRadius: 20, border: "1px solid", borderColor: a?"#7dd3fc":"rgba(59,130,196,0.3)", background: a?"rgba(59,130,196,0.2)":"transparent", color: a?"#7dd3fc":"#bae6fd", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }),
    input: { width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(59,130,196,0.25)", borderRadius: 10, padding: "10px 14px", color: "#e8f0f8", fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
    inputLight: { width: "100%", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "10px 14px", color: "#082f49", fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
    timePill: (sel) => ({ padding: "6px 14px", borderRadius: 20, border: `1px solid ${sel?"#7dd3fc":"rgba(59,130,196,0.3)"}`, background: sel?"rgba(59,130,196,0.2)":"transparent", color: sel?"#7dd3fc":"#bae6fd", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }),
    timePillLight: (sel) => ({ padding: "6px 14px", borderRadius: 20, border: `1px solid ${sel?"#0ea5e9":"#cbd5e1"}`, background: sel?"#e0f2fe":"#ffffff", color: sel?"#0369a1":"#64748b", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }),
    label: { display: "block", fontSize: 13, color: "#bae6fd", marginBottom: 6 },
    labelLight: { display: "block", fontSize: 13, color: "#0369a1", marginBottom: 6, fontWeight: 600 },
    msgBubble: (r) => ({ maxWidth: "80%", padding: "12px 16px", borderRadius: r==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px", background: r==="user"?"linear-gradient(135deg, #0ea5e9, #38bdf8)":"#f0f9ff", alignSelf: r==="user"?"flex-end":"flex-start", fontSize: 15, lineHeight: 1.6, color: r==="user"?"#fff":"#082f49", whiteSpace: "pre-wrap", border: r==="user"?"none":"1px solid #bae6fd" }),
    planFeature: { padding: "8px 0", borderBottom: "1px solid rgba(59,130,196,0.1)", color: "#e0f2fe", fontSize: 15, listStyle: "none" },
  };

  return (
    <div style={{ ...T.app, background: (view==="home"||view==="doctors"||view==="chat"||view==="booking") ? "#ffffff" : T.app.background }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        @media (max-width: 640px) {
          .mobile-hide { display: none !important; }
          body { overflow-x: hidden; }
        }
        nav::-webkit-scrollbar { display: none; }
      `}</style>

      {showLogin && <LoginModal onLogin={handleLogin} onClose={() => setShowLogin(false)} />}
      {showNotifPanel && lastBooking && <NotificationPanel bookingData={lastBooking.data} doctor={lastBooking.doctor} onClose={resetBooking} />}
      {showPayment && selectedDoctor && (
        <PaymentModal doctor={selectedDoctor} bookingData={lastBooking?.data || bookingData} isMembership={isMembershipPayment}
          onSuccess={() => { setShowPayment(false); setIsMembershipPayment(false); if (!isMembershipPayment) setConfirmed(true); }}
          onClose={() => { setShowPayment(false); setIsMembershipPayment(false); }} />
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-nav { display: flex !important; }
          .hero-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .hero-stats-card { display: none !important; }
          .trust-grid { grid-template-columns: 1fr !important; }
          .steps-grid { grid-template-columns: 1fr !important; }
          .testimonials-grid { grid-template-columns: 1fr !important; }
          .footer-grid { grid-template-columns: 1fr 1fr !important; gap: 24px !important; }
          .doctor-grid { grid-template-columns: 1fr !important; }
          .booking-form { padding: 16px !important; }
        }
        @media (max-width: 480px) {
          .footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <header style={{ ...T.header, background: (view==="home"||view==="doctors"||view==="chat"||view==="booking") ? "rgba(255,255,255,0.95)" : T.header.background, borderBottom: (view==="home"||view==="doctors"||view==="chat"||view==="booking") ? "1px solid rgba(14,165,233,0.2)" : T.header.borderBottom }}>
        <div style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }} onClick={() => setView("home")}>
          <svg width="32" height="32" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="36" cy="36" r="36" fill="url(#lg1)"/>
            <rect x="28" y="14" width="16" height="44" rx="4" fill="white"/>
            <rect x="14" y="28" width="44" height="16" rx="4" fill="white"/>
            <circle cx="36" cy="36" r="5" fill="url(#lg1)"/>
            <defs>
              <linearGradient id="lg1" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#0ea5e9"/>
                <stop offset="100%" stopColor="#7dd3fc"/>
              </linearGradient>
            </defs>
          </svg>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>
              <span style={{ color: "#0ea5e9" }}>Medi</span><span style={{ color: (view==="home"||view==="doctors"||view==="chat"||view==="booking") ? "#0c4a6e" : "#e0f2fe", fontWeight: 300 }}>Ayacucho</span>
            </div>
            <span style={{ fontSize: 8, color: (view==="home"||view==="doctors"||view==="chat"||view==="booking") ? "#0284c7" : "#bae6fd", letterSpacing: 2, textTransform: "uppercase", display: "block", marginTop: 1 }}>Salud para todos</span>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="desktop-nav" style={{ display: "flex", gap: 8 }}>
          <button style={T.navBtn(view==="home", view==="home"||view==="doctors"||view==="chat"||view==="booking")} onClick={() => setView("home")}>Inicio</button>
          <button style={T.navBtn(view==="doctors", view==="home"||view==="doctors"||view==="chat"||view==="booking")} onClick={() => setView("doctors")}>Médicos</button>
          <button style={T.navBtn(view==="chat", view==="home"||view==="doctors"||view==="chat"||view==="booking")} onClick={() => setView("chat")}>🤖 IA</button>
          {session ? (
            <div style={{ display: "flex", gap: 8 }}>
              {session.email === ADMIN_EMAIL && (
                <button style={{ ...T.navBtn(false), background: "rgba(255,100,100,0.15)", border: "1px solid rgba(255,100,100,0.4)", color: "#ff6b6b" }} onClick={() => setShowAdmin(true)}>🛡️</button>
              )}
              <button style={{ ...T.navBtn(true), background: "rgba(59,130,196,0.15)" }} onClick={async () => {
                const myDoc = doctors.find(d => d.email === session?.email);
                if (myDoc) { setDashboardDoctor(myDoc); return; }
                try {
                  const all = await sb(`doctors?email=eq.${encodeURIComponent(session?.email)}`);
                  if (all && all.length > 0) setDashboardDoctor(all[0]);
                  else setView("doctor-register");
                } catch { setView("doctor-register"); }
              }}>📊 Panel</button>
              <button style={{ ...T.navBtn(false), color: "#ff6b6b" }} onClick={handleLogout}>Salir</button>
            </div>
          ) : (
            <button style={{ ...T.navBtn(false), background: "rgba(59,130,196,0.15)", border: "1px solid rgba(59,130,196,0.4)", color: "#7dd3fc" }} onClick={() => setShowLogin(true)}>🔐 Médico</button>
          )}
        </nav>

        {/* Mobile nav — icônes seulement */}
        <nav className="mobile-nav" style={{ display: "none", gap: 6, alignItems: "center" }}>
          <button style={{ padding:"8px 10px", borderRadius:8, border:"none", background: view==="doctors" ? "rgba(59,130,196,0.2)" : "transparent", color: view==="doctors" ? "#7dd3fc" : "#e0f2fe", cursor:"pointer", fontSize:18, fontFamily:"inherit" }} onClick={() => setView("doctors")}>🏥</button>
          <button style={{ padding:"8px 10px", borderRadius:8, border:"none", background: view==="chat" ? "rgba(59,130,196,0.2)" : "transparent", color: view==="chat" ? "#7dd3fc" : "#e0f2fe", cursor:"pointer", fontSize:18, fontFamily:"inherit" }} onClick={() => setView("chat")}>🤖</button>
          {session ? (
            <>
              {session.email === ADMIN_EMAIL && <button style={{ padding:"8px 10px", borderRadius:8, border:"none", background:"rgba(255,100,100,0.15)", color:"#ff6b6b", cursor:"pointer", fontSize:18, fontFamily:"inherit" }} onClick={() => setShowAdmin(true)}>🛡️</button>}
              <button style={{ padding:"8px 10px", borderRadius:8, border:"none", background:"rgba(59,130,196,0.15)", color:"#7dd3fc", cursor:"pointer", fontSize:18, fontFamily:"inherit" }} onClick={async () => {
                const myDoc = doctors.find(d => d.email === session?.email);
                if (myDoc) { setDashboardDoctor(myDoc); return; }
                try { const all = await sb(`doctors?email=eq.${encodeURIComponent(session?.email)}`); if (all?.length > 0) setDashboardDoctor(all[0]); else setView("doctor-register"); } catch { setView("doctor-register"); }
              }}>📊</button>
              <button style={{ padding:"8px 10px", borderRadius:8, border:"none", background:"transparent", color:"#ff6b6b", cursor:"pointer", fontSize:14, fontFamily:"inherit" }} onClick={handleLogout}>✕</button>
            </>
          ) : (
            <button style={{ padding:"8px 14px", borderRadius:8, border:"1px solid rgba(59,130,196,0.4)", background:"rgba(59,130,196,0.15)", color:"#7dd3fc", cursor:"pointer", fontSize:13, fontFamily:"inherit", fontWeight:700 }} onClick={() => setShowLogin(true)}>🔐</button>
          )}
        </nav>
      </header>

      {/* HOME */}
      {view === "home" && (
        <>
          <style>{`
            @keyframes fadeUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
            @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
            @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-10px); } }
            @keyframes countUp { from { opacity:0; } to { opacity:1; } }
            .hero-card:hover { transform: translateY(-6px) !important; box-shadow: 0 20px 60px rgba(59,130,196,0.2) !important; }
            .spec-card:hover { transform: scale(1.05); border-color: rgba(59,130,196,0.5) !important; }
            @media (max-width: 768px) {
              .hero-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
              .hero-stats { display: none !important; }
              .hero-section { padding: 40px 16px 32px !important; min-height: auto !important; }
              .how-grid { grid-template-columns: 1fr !important; }
              .photos-grid { grid-template-columns: 1fr !important; }
              .testimonials-grid { grid-template-columns: 1fr !important; }
              .footer-grid { grid-template-columns: 1fr 1fr !important; gap: 24px !important; }
              .doctors-grid { grid-template-columns: 1fr !important; }
            }
            @media (max-width: 480px) {
              .footer-grid { grid-template-columns: 1fr !important; }
            }
          `}</style>

          {/* HERO */}
          <div style={{ position:"relative", overflow:"hidden", minHeight:"90vh", display:"flex", alignItems:"center" }}>
            {/* Gradient overlay */}
            <div style={{ position:"absolute", inset:0, background:"linear-gradient(135deg, #ffffff 0%, #f0f9ff 60%, #e0f2fe 100%)" }} />
            {/* Animated circles */}
            <div style={{ position:"absolute", top:"10%", right:"5%", width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 70%)", animation:"float 6s ease-in-out infinite" }} />
            <div style={{ position:"absolute", bottom:"10%", left:"5%", width:300, height:300, borderRadius:"50%", background:"radial-gradient(circle, rgba(37,211,102,0.05) 0%, transparent 70%)", animation:"float 8s ease-in-out infinite reverse" }} />

            <div className="hero-section" style={{ maxWidth:1100, margin:"0 auto", padding:"80px 24px", width:"100%", position:"relative", zIndex:1 }}>
              <div className="hero-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:60, alignItems:"center" }}>

                {/* LEFT — Text */}
                <div style={{ animation:"fadeUp 0.8s ease forwards" }}>
                  {/* Badge */}
                  <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#f0f9ff", border:"1px solid #64748b", borderRadius:20, padding:"8px 16px", marginBottom:24 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:"#25D366", animation:"pulse 2s infinite" }} />
                    <span style={{ fontSize:13, color:"#0369a1", letterSpacing:0.5, fontWeight:600 }}>🏥 Plataforma médica certificada — Ayacucho</span>
                  </div>

                  <h1 style={{ fontSize:"clamp(32px,6vw,68px)", fontWeight:700, lineHeight:1.1, margin:"0 0 20px", letterSpacing:"-0.5px", color:"#082f49" }}>
                    Tu salud,<br/>
                    <span style={{ background:"linear-gradient(135deg,#0ea5e9,#0369a1)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>nuestra</span>
                    <span style={{ color:"#082f49" }}> prioridad</span>
                  </h1>

                  <p style={{ fontSize:18, color:"#475569", lineHeight:1.7, margin:"0 0 36px", maxWidth:480 }}>
                    Conectamos a la población de Ayacucho con <strong style={{ color:"#082f49" }}>médicos calificados y verificados</strong>. Agenda tu cita en minutos con IA.
                  </p>

                  <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:40 }}>
                    <button style={{ padding:"15px 32px", background:"linear-gradient(135deg,#0ea5e9,#7dd3fc)", color:"#fff", border:"none", borderRadius:14, fontSize:16, cursor:"pointer", fontWeight:700, fontFamily:"inherit", boxShadow:"0 12px 32px rgba(14,165,233,0.35)", transition:"all 0.2s" }}
                      onMouseEnter={e=>e.target.style.transform="translateY(-2px)"}
                      onMouseLeave={e=>e.target.style.transform=""}
                      onClick={() => setView("doctors")}>
                      🏥 Buscar Médico
                    </button>
                    <button style={{ padding:"15px 32px", background:"#fff", color:"#0369a1", border:"2px solid #7dd3fc", borderRadius:14, fontSize:16, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s", boxShadow:"0 4px 16px rgba(15,23,42,0.06)" }}
                      onMouseEnter={e=>{e.target.style.background="#f0f9ff";e.target.style.transform="translateY(-2px)"}}
                      onMouseLeave={e=>{e.target.style.background="transparent";e.target.style.transform=""}}
                      onClick={() => setView("chat")}>
                      🤖 Hablar con IA
                    </button>
                  </div>

                  {/* Trust badges */}
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    {[["🔒","Pago seguro","Yape & Plin"],["✅","CMP Verificado","Médicos certificados"],["24/7","Disponible","Asistente IA"]].map(([icon,title,sub],i)=>(
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", background:"#ffffff", border:"1px solid #f1f5f9", borderRadius:10, boxShadow:"0 4px 16px rgba(15,23,42,0.06)" }}>
                        <span style={{ fontSize:18 }}>{icon}</span>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:"#082f49" }}>{title}</div>
                          <div style={{ fontSize:11, color:"#64748b" }}>{sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* RIGHT — Stats card */}
                <div className="hero-stats-card" style={{ animation:"fadeUp 0.8s ease 0.2s both" }}>
                  {/* Photo with floating badges */}
                  <div style={{ position:"relative", marginBottom:24, display:"flex", justifyContent:"center" }}>
                    <div style={{ width:200, height:200, borderRadius:"50%", background:"linear-gradient(135deg, #e0f2fe, #64748b)", overflow:"hidden", position:"relative" }}>
                      <img src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=400&q=80" alt="Médico" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>{e.target.style.display="none"}} />
                    </div>
                    <div style={{ position:"absolute", top:10, left:-10, background:"#fff", border:"1px solid #e0f2fe", borderRadius:16, padding:"8px 14px", boxShadow:"0 10px 30px rgba(15,23,42,0.12)", fontSize:13, fontWeight:700, color:"#0369a1" }}>
                      ✅ CMP Verificado
                    </div>
                    <div style={{ position:"absolute", bottom:10, right:-10, background:"#fff", border:"1px solid #e0f2fe", borderRadius:16, padding:"8px 14px", boxShadow:"0 10px 30px rgba(15,23,42,0.12)", fontSize:13, fontWeight:700, color:"#0369a1" }}>
                      ⭐ 4.8 Rating
                    </div>
                  </div>

                  <div style={{ background:"#ffffff", border:"1px solid #e0f2fe", borderRadius:24, padding:32, boxShadow:"0 20px 60px rgba(14,165,233,0.12)" }}>
                    <h3 style={{ margin:"0 0 24px", fontSize:18, color:"#082f49", fontWeight:700 }}>📊 MediAyacucho en números</h3>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:12, marginBottom:20 }}>
                      {[[doctors.length||6,"Médicos","verificados","#7dd3fc"],["500+","Citas","agendadas","#25D366"],["4.8★","Rating","promedio","#F4A261"],["24/7","Soporte","disponible","#a78bfa"]].map(([n,l,s,c],i)=>(
                        <div key={i} style={{ background:`${c}10`, border:`1px solid ${c}25`, borderRadius:14, padding:"16px", textAlign:"center" }}>
                          <div style={{ fontSize:30, fontWeight:700, color:c }}>{n}</div>
                          <div style={{ fontSize:13, fontWeight:700, color:"#082f49" }}>{l}</div>
                          <div style={{ fontSize:11, color:"#64748b" }}>{s}</div>
                        </div>
                      ))}
                    </div>

                    {/* Specialties quick access */}
                    <p style={{ margin:"0 0 12px", fontSize:13, color:"#64748b" }}>Especialidades disponibles:</p>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {["Medicina General","Pediatría","Cardiología","Ginecología","Traumatología","Dermatología"].map((sp,i)=>(
                        <button key={i} className="spec-card" style={{ padding:"5px 12px", borderRadius:20, background:"#f0f9ff", border:"1px solid #bae6fd", color:"#0369a1", fontSize:12, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s", boxShadow:"0 2px 8px rgba(14,165,233,0.08)" }}
                          onClick={()=>{ setSpecialtySearch(sp); setView("doctors"); }}>
                          {sp}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* HOW IT WORKS */}
          <div style={{ background:"#f0f9ff", borderTop:"1px solid #e0f2fe", borderBottom:"1px solid #e0f2fe", padding:"60px 24px" }}>
            <div style={{ maxWidth:1100, margin:"0 auto" }}>
              <div style={{ textAlign:"center", marginBottom:48 }}>
                <span style={{ display:"inline-block", padding:"6px 16px", borderRadius:20, background:"#e0f2fe", color:"#0369a1", fontSize:13, fontWeight:700, letterSpacing:0.5, marginBottom:14 }}>PROCESO SIMPLE</span>
                <h2 style={{ fontSize:40, fontWeight:800, margin:"0 0 12px", color:"#082f49", letterSpacing:"-0.5px" }}>¿Cómo funciona?</h2>
                <p style={{ color:"#475569", fontSize:17 }}>Agenda tu cita en 3 simples pasos</p>
              </div>
              <div className="steps-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:24, position:"relative" }}>
                {[
                  { n:"01", icon:"🤖", title:"Consulta la IA", desc:"Cuéntanos tus síntomas y nuestra IA te recomienda al médico ideal para ti.", color:"#7dd3fc" },
                  { n:"02", icon:"📅", title:"Elige tu cita", desc:"Selecciona el médico, fecha, horario y modalidad (presencial o virtual).", color:"#a78bfa" },
                  { n:"03", icon:"📲", title:"Confirmación WhatsApp", desc:"Recibe confirmación instantánea con dirección, precio y política de cancelación.", color:"#25D366" },
                ].map((step,i)=>(
                  <div key={i} className="hero-card" style={{ background:"#ffffff", border:`1px solid ${step.color}22`, borderRadius:20, padding:28, position:"relative", transition:"all 0.3s", cursor:"default", boxShadow:"0 8px 28px rgba(15,23,42,0.07)" }}>
                    <div style={{ position:"absolute", top:20, right:20, fontSize:48, fontWeight:900, color:`${step.color}15`, lineHeight:1 }}>{step.n}</div>
                    <div style={{ width:56, height:56, borderRadius:16, background:`${step.color}18`, border:`1px solid ${step.color}33`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, marginBottom:16, boxShadow:`0 6px 16px ${step.color}20` }}>{step.icon}</div>
                    <h3 style={{ margin:"0 0 10px", fontSize:19, fontWeight:700, color:"#082f49" }}>{step.title}</h3>
                    <p style={{ margin:0, color:"#64748b", fontSize:14, lineHeight:1.6 }}>{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* TRUST PHOTOS */}
          <div style={{ maxWidth:1100, margin:"0 auto", padding:"60px 24px" }}>
            <div style={{ textAlign:"center", marginBottom:40 }}>
              <span style={{ display:"inline-block", padding:"6px 16px", borderRadius:20, background:"#f0fdf4", color:"#15803d", fontSize:13, fontWeight:700, letterSpacing:0.5, marginBottom:14 }}>CALIDAD GARANTIZADA</span>
              <h2 style={{ fontSize:36, fontWeight:800, margin:"0 0 12px", color:"#082f49", letterSpacing:"-0.5px" }}>Atención médica de calidad</h2>
              <p style={{ color:"#475569", fontSize:16 }}>Médicos verificados, consultorios equipados, resultados confiables</p>
            </div>
            <div className="trust-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20, marginBottom:60 }}>
              {[
                { url:"https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&q=80", label:"Médicos certificados CMP", desc:"Todos verificados por el Colegio Médico del Perú" },
                { url:"https://images.unsplash.com/photo-1666214280557-f1b5022eb634?w=600&q=80", label:"Atención personalizada", desc:"Consultas presenciales y virtuales disponibles" },
                { url:"https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=600&q=80", label:"Reserva en minutos", desc:"Paga con Yape o Plin, sin complicaciones" },
              ].map((item,i)=>(
                <div key={i} style={{ borderRadius:20, overflow:"hidden", border:"1px solid #f1f5f9", transition:"all 0.3s", boxShadow:"0 8px 28px rgba(15,23,42,0.08)" }}
                  className="hero-card">
                  <img src={item.url} alt={item.label} style={{ width:"100%", height:200, objectFit:"cover", display:"block" }} onError={e=>{e.target.style.display="none"}} />
                  <div style={{ padding:"18px 20px", background:"rgba(5,22,40,0.98)" }}>
                    <div style={{ fontWeight:700, color:"#082f49", fontSize:15, marginBottom:4 }}>{item.label}</div>
                    <div style={{ fontSize:13, color:"#64748b", lineHeight:1.5 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* TESTIMONIALS */}
            <div style={{ textAlign:"center", marginBottom:32 }}>
              <span style={{ display:"inline-block", padding:"6px 16px", borderRadius:20, background:"#fff7ed", color:"#c2410c", fontSize:13, fontWeight:700, letterSpacing:0.5, marginBottom:14 }}>TESTIMONIOS REALES</span>
              <h2 style={{ fontSize:32, fontWeight:800, margin:"0 0 10px", color:"#082f49", letterSpacing:"-0.5px" }}>Lo que dicen nuestros pacientes</h2>
              <div style={{ color:"#F4A261", fontSize:22, marginBottom:8 }}>★★★★★</div>
              <p style={{ color:"#475569", fontSize:15 }}>+500 pacientes satisfechos en Ayacucho</p>
            </div>
            <div className="testimonials-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
              {[
                { name:"María Condori", city:"Huamanga", text:"Encontré al médico perfecto en 5 minutos y pagué por Yape. ¡Increíble!", stars:5, sp:"Medicina General" },
                { name:"Jorge Quispe", city:"Ayacucho", text:"La consulta virtual fue excelente. El doctor muy atento y puntual.", stars:5, sp:"Cardiología" },
                { name:"Rosa Palomino", city:"Ayacucho", text:"Me enviaron la confirmación con la dirección exacta. Muy profesional.", stars:5, sp:"Pediatría" },
              ].map((t,i)=>(
                <div key={i} className="hero-card" style={{ background:"#ffffff", border:"1px solid #f1f5f9", borderRadius:16, padding:22, transition:"all 0.3s", boxShadow:"0 8px 28px rgba(15,23,42,0.07)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <div style={{ width:40, height:40, borderRadius:"50%", background:"linear-gradient(135deg,#0ea5e9,#7dd3fc)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, color:"#fff", fontSize:16 }}>{t.name[0]}</div>
                      <div>
                        <div style={{ fontWeight:700, color:"#082f49", fontSize:14 }}>{t.name}</div>
                        <div style={{ fontSize:11, color:"#64748b" }}>📍 {t.city}</div>
                      </div>
                    </div>
                    <span style={{ padding:"3px 10px", borderRadius:20, background:"#f0f9ff", color:"#0369a1", fontSize:11, fontWeight:600 }}>{t.sp}</span>
                  </div>
                  <div style={{ color:"#F4A261", fontSize:14, marginBottom:8 }}>{"★".repeat(t.stars)}</div>
                  <p style={{ margin:0, color:"#334155", fontSize:14, lineHeight:1.6, fontStyle:"italic" }}>"{t.text}"</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA BOTTOM */}
          <div style={{ background:"linear-gradient(135deg, #0ea5e9, #38bdf8)", padding:"60px 24px", textAlign:"center" }}>
            <h2 style={{ fontSize:32, fontWeight:700, margin:"0 0 12px", color:"#fff" }}>¿Listo para cuidar tu salud?</h2>
            <p style={{ color:"rgba(255,255,255,0.9)", fontSize:16, margin:"0 0 32px" }}>Únete a los cientos de pacientes que ya confían en MediAyacucho</p>
            <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
              <button style={{ padding:"16px 40px", background:"#fff", color:"#0369a1", border:"none", borderRadius:14, fontSize:17, cursor:"pointer", fontWeight:700, fontFamily:"inherit", boxShadow:"0 12px 36px rgba(2,8,23,0.2)" }} onClick={()=>setView("doctors")}>
                🏥 Buscar mi médico ahora
              </button>
              <button style={{ padding:"16px 40px", background:"linear-gradient(135deg,#25D366,#128C7E)", color:"#fff", border:"none", borderRadius:14, fontSize:17, cursor:"pointer", fontWeight:700, fontFamily:"inherit" }} onClick={()=>setView("chat")}>
                🤖 Consultar con IA gratis
              </button>
            </div>
          </div>
        </>
      )}

            {/* DOCTORS */}
      {view === "doctors" && (
        <div style={T.section}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, marginBottom:8 }}>
            <div>
              <h2 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 8px", color:"#082f49" }}>Médicos en tu ciudad</h2>
              <p style={{ color: "#475569", margin: 0 }}>
                {loadingDoctors ? "Cargando desde Supabase..." : dbError ? `⚠️ Error: ${dbError}` : `${doctors.length} médico(s) certificado(s) y verificado(s)`}
              </p>
            </div>
            <div style={{ display:"flex", gap:6, background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:12, padding:4 }}>
              <button onClick={() => setDoctorsViewMode("list")} style={{ padding:"8px 16px", borderRadius:9, border:"none", background: doctorsViewMode==="list" ? "#ffffff" : "transparent", color: doctorsViewMode==="list" ? "#0369a1" : "#64748b", fontWeight: doctorsViewMode==="list" ? 700 : 400, cursor:"pointer", fontFamily:"inherit", fontSize:13, boxShadow: doctorsViewMode==="list" ? "0 2px 8px rgba(15,23,42,0.08)" : "none" }}>📋 Lista</button>
              <button onClick={() => setDoctorsViewMode("map")} style={{ padding:"8px 16px", borderRadius:9, border:"none", background: doctorsViewMode==="map" ? "#ffffff" : "transparent", color: doctorsViewMode==="map" ? "#0369a1" : "#64748b", fontWeight: doctorsViewMode==="map" ? 700 : 400, cursor:"pointer", fontFamily:"inherit", fontSize:13, boxShadow: doctorsViewMode==="map" ? "0 2px 8px rgba(15,23,42,0.08)" : "none" }}>🗺️ Mapa</button>
            </div>
          </div>
          <div style={{ marginBottom:24 }} />
          {/* Search bar */}
          <div style={{ position:"relative", marginBottom:28 }}>
            <span style={{ position:"absolute", left:18, top:"50%", transform:"translateY(-50%)", fontSize:18, color:"#94a3b8" }}>🔍</span>
            <input
              type="text"
              value={specialtySearch}
              onChange={e => setSpecialtySearch(e.target.value)}
              placeholder="Buscar por especialidad o nombre del médico..."
              style={{ width:"100%", padding:"16px 18px 16px 48px", borderRadius:14, border:"1px solid #bae6fd", background:"#ffffff", color:"#082f49", fontSize:15, fontFamily:"inherit", outline:"none", boxShadow:"0 4px 16px rgba(15,23,42,0.06)", boxSizing:"border-box" }}
            />
            {specialtySearch && (
              <button onClick={() => setSpecialtySearch("")} style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#94a3b8" }}>✕</button>
            )}
          </div>
          {/* Quick specialty suggestions */}
          <div style={{ margin: "0 -24px", padding: "0 24px 4px", overflowX: "scroll", marginBottom: 28, WebkitOverflowScrolling: "touch", cursor: "grab", msOverflowStyle:"none", scrollbarWidth:"none" }}>
            <div style={{ display: "flex", gap: 8, paddingBottom: 4, width: "max-content" }}>
            {SPECIALTIES.filter(s => s !== "Todos").map(s => {
              const cfg = SPECIALTY_CONFIG[s];
              const isActive = specialtySearch === s;
              return (
                <button key={s} style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${isActive ? (cfg?.color || "#0369a1") : "#e2e8f0"}`, background: isActive ? (cfg?.bg || "#e0f2fe") : "#f8fafc", color: isActive ? (cfg?.color || "#0369a1") : "#64748b", cursor:"pointer", fontSize:12, fontFamily:"inherit", fontWeight: isActive ? 700 : 400, transition:"all 0.2s", whiteSpace:"nowrap", flexShrink:0 }} onClick={() => setSpecialtySearch(isActive ? "" : s)}>
                  {cfg?.icon || ""} {s}
                </button>
              );
            })}
            </div>
          </div>
          {loadingDoctors ? (
            <div style={{ textAlign:"center", padding:60, color:"#0369a1", fontSize:18 }}>⏳ Conectando a Supabase...</div>
          ) : doctorsViewMode === "map" ? (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))", gap:20 }}>
              {filtered.filter(doc => doc.address).map(doc => (
                <div key={doc.id} style={{ background:"#ffffff", border:"1px solid #e0f2fe", borderRadius:16, overflow:"hidden", boxShadow:"0 8px 28px rgba(15,23,42,0.06)" }}>
                  <iframe
                    title={`Mapa ${doc.name}`}
                    width="100%"
                    height="220"
                    style={{ border:0, display:"block" }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(doc.address + ", Ayacucho, Perú")}&output=embed`}
                  />
                  <div style={{ padding:"14px 16px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                      {doc.photo_url
                        ? <img src={doc.photo_url} alt={doc.name} style={{ width:36, height:36, borderRadius:10, objectFit:"cover" }} />
                        : <div style={{ width:36, height:36, borderRadius:10, background:doc.color||"#0ea5e9", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff" }}>{doc.img||initials(doc.name)}</div>
                      }
                      <div>
                        <div style={{ fontWeight:700, color:"#082f49", fontSize:14 }}>{doc.name}</div>
                        <div style={{ fontSize:12, color:"#64748b" }}>{doc.specialty}</div>
                      </div>
                    </div>
                    <p style={{ margin:"0 0 10px", fontSize:13, color:"#475569" }}>📍 {doc.address}</p>
                    <div style={{ display:"flex", gap:8 }}>
                      <button style={{ flex:1, padding:"7px 0", background:"#f0f9ff", border:"1px solid #bae6fd", color:"#0369a1", borderRadius:8, cursor:"pointer", fontSize:12, fontFamily:"inherit", fontWeight:600 }} onClick={() => { setSelectedProfile(doc); setView("profile"); }}>👤 Ver perfil</button>
                      <a href={doc.maps_url || `https://maps.google.com/maps?q=${encodeURIComponent(doc.address + ", Ayacucho, Perú")}`} target="_blank" rel="noreferrer" style={{ flex:1, padding:"7px 0", background:"#e0f2fe", border:"1px solid #bae6fd", color:"#0369a1", borderRadius:8, cursor:"pointer", fontSize:12, fontFamily:"inherit", fontWeight:600, textAlign:"center", textDecoration:"none" }}>🗺️ Ir a Maps</a>
                    </div>
                  </div>
                </div>
              ))}
              {filtered.filter(doc => doc.address).length === 0 && (
                <div style={{ gridColumn:"1/-1", textAlign:"center", padding:40, color:"#64748b" }}>No hay médicos con dirección registrada que coincidan con tu búsqueda.</div>
              )}
            </div>
          ) : (
            <div className="doctor-grid" style={T.grid}>
              {filtered.map(doc => (
                <div key={doc.id} style={{ ...T.card, background:"#ffffff", border:"1px solid #e0f2fe", boxShadow:"0 8px 28px rgba(15,23,42,0.06)", position:"relative", overflow:"hidden" }}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-6px)";e.currentTarget.style.borderColor="#7dd3fc";e.currentTarget.style.boxShadow="0 16px 48px rgba(14,165,233,0.15)";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.borderColor="#e0f2fe";e.currentTarget.style.boxShadow="";}}>
                  {doc.photo_url
                    ? <img src={doc.photo_url} alt={doc.name} style={{ width:56, height:56, borderRadius:14, objectFit:"cover", marginBottom:16, border:`2px solid ${SPECIALTY_CONFIG[doc.specialty]?.color || "#7dd3fc"}66` }} />
                    : <div style={{ ...T.avatar(SPECIALTY_CONFIG[doc.specialty]?.color || doc.color), background:`linear-gradient(135deg, ${doc.color}, ${SPECIALTY_CONFIG[doc.specialty]?.color || doc.color})` }}>{doc.img || initials(doc.name)}</div>
                  }
                  <h3 style={{ fontSize:18, fontWeight:700, margin:"0 0 8px", color:"#082f49" }}>{doc.name}</h3>
                  <div style={{ marginBottom:10 }}>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 12px", borderRadius:20, background: SPECIALTY_CONFIG[doc.specialty]?.bg || "rgba(59,130,196,0.15)", border:`1px solid ${SPECIALTY_CONFIG[doc.specialty]?.color || "#7dd3fc"}44`, color: SPECIALTY_CONFIG[doc.specialty]?.color || "#7dd3fc", fontSize:12, fontWeight:700 }}>
                      {SPECIALTY_CONFIG[doc.specialty]?.icon || "🏥"} {doc.specialty}
                    </span>
                  </div>
                  <div style={{ color:"#F4A261", fontSize:13 }}>{"★".repeat(Math.floor(doc.rating||5))} {doc.rating}</div>
                  {(() => {
                    const booked = getBookedSlotsForDoctor(allAppointments, doc.id);
                    const next = getNextAvailability(doc.schedule, booked);
                    if (!next) return null;
                    const isSoon = next.daysAhead <= 1;
                    return (
                      <div style={{ display:"inline-flex", alignItems:"center", gap:5, marginTop:8, padding:"4px 10px", borderRadius:8, background: isSoon ? "rgba(37,211,102,0.12)" : "rgba(59,130,196,0.1)", border:`1px solid ${isSoon ? "rgba(37,211,102,0.3)" : "rgba(59,130,196,0.2)"}` }}>
                        <span style={{ width:6, height:6, borderRadius:"50%", background: isSoon ? "#25D366" : "#7dd3fc" }} />
                        <span style={{ fontSize:11, fontWeight:700, color: isSoon ? "#25D366" : "#7dd3fc" }}>Próxima cita: {next.label}</span>
                      </div>
                    );
                  })()}
                  <div style={{ marginTop:6, color:"#64748b", fontSize:12 }}>{(doc.schedule||[]).join(" · ")}</div>
                  {doc.address && (
                    <div style={{ marginTop:8, display:"flex", alignItems:"flex-start", gap:6 }}>
                      <span style={{ fontSize:12 }}>📍</span>
                      <a href={doc.maps_url||"#"} target="_blank" rel="noreferrer" style={{ fontSize:12, color:"#7dd3fc", textDecoration:"none", lineHeight:1.4 }}>{doc.address}</a>
                    </div>
                  )}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:16 }}>
                    <div>
                      <span style={{ fontSize:22, fontWeight:800, color: "#7dd3fc", letterSpacing:"-0.5px" }}>{doc.price}</span>
                      <span style={{ fontSize:11, color:"#60a5d8" }}>/consulta</span>
                    </div>
                    {doc.available
                      ? <div style={{ display: "flex", gap: 6, flexDirection: "column" }}>
                          <button style={{ padding:"8px 16px", background:"linear-gradient(135deg,#0ea5e9,#7dd3fc)", color:"#fff", border:"none", borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit" }} onClick={() => { setSelectedDoctor(doc); setBookingData(p => ({...p, modalidad:"presencial"})); setSelectedCalDay(null); setView("booking"); }}>🏥 Presencial</button>
                          <button style={{ padding:"8px 16px", background:"linear-gradient(135deg,#25D366,#128C7E)", color:"#fff", border:"none", borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit" }} onClick={() => { setSelectedDoctor(doc); setBookingData(p => ({...p, modalidad:"virtual"})); setSelectedCalDay(null); setView("booking"); }}>📱 Virtual</button>
                        </div>
                      : <span style={{ padding:"4px 10px", borderRadius:20, background:"rgba(255,100,100,0.1)", color:"#ff6b6b", fontSize:12 }}>No disponible</span>
                    }
                  </div>
                  {/* Demo: acceso al dashboard */}
                  <div style={{ display:"flex", gap:6, marginTop:10 }}>
                    <button style={{ flex:1, padding:"7px 0", background:"#f0f9ff", border:"1px solid #bae6fd", color:"#0369a1", borderRadius:8, cursor:"pointer", fontSize:11, fontFamily:"inherit", fontWeight:600 }} onClick={() => setDashboardDoctor(doc)}>
                      📊 Dashboard
                    </button>
                    <button style={{ flex:1, padding:"7px 0", background:"#f0f9ff", border:"1px solid #bae6fd", color:"#0369a1", borderRadius:8, cursor:"pointer", fontSize:11, fontFamily:"inherit", fontWeight:600 }} onClick={() => { setSelectedProfile(doc); setView("profile"); }}>
                      👤 Ver perfil
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BOOKING */}
      {view === "booking" && selectedDoctor && (
        <div style={T.section}>

          {/* BARRA DE PROGRESO */}
          {!confirmed && (
            <div style={{ maxWidth:540, margin:"0 auto 32px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                {[
                  { n:1, label:"Médico", done:true },
                  { n:2, label:"Tus datos", done: !!(bookingData.patient_name && bookingData.patient_phone && bookingData.date && bookingData.time) },
                  { n:3, label:"Pago", done:false },
                  { n:4, label:"Confirmación", done:false },
                ].map((step, i, arr) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", flex: i < arr.length-1 ? 1 : "none" }}>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                      <div style={{ width:32, height:32, borderRadius:"50%", background: step.done ? "linear-gradient(135deg,#0ea5e9,#7dd3fc)" : "#f0f9ff", border:`2px solid ${step.done ? "#7dd3fc" : "#bae6fd"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color: step.done ? "#fff" : "#64748b", transition:"all 0.3s" }}>
                        {step.done ? "✓" : step.n}
                      </div>
                      <span style={{ fontSize:11, color: step.done ? "#0369a1" : "#64748b", whiteSpace:"nowrap" }}>{step.label}</span>
                    </div>
                    {i < arr.length-1 && (
                      <div style={{ flex:1, height:2, background: step.done ? "linear-gradient(90deg,#7dd3fc,#bae6fd)" : "#e2e8f0", margin:"0 8px", marginBottom:18, transition:"all 0.3s" }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {confirmed ? (
            <div style={{ maxWidth:520, margin:"0 auto", padding:"40px 0" }}>
              {/* CONFETTIS */}
              <style>{`
                @keyframes confetti-fall {
                  0% { transform: translateY(-100px) rotate(0deg); opacity: 1; }
                  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
                }
                @keyframes bounce-in {
                  0% { transform: scale(0); opacity: 0; }
                  60% { transform: scale(1.2); }
                  100% { transform: scale(1); opacity: 1; }
                }
                .confetti-piece {
                  position: fixed;
                  width: 10px;
                  height: 10px;
                  top: -20px;
                  animation: confetti-fall linear forwards;
                  z-index: 9999;
                  border-radius: 2px;
                }
                .bounce-icon { animation: bounce-in 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
              `}</style>

              {/* Confetti pieces */}
              {[...Array(40)].map((_, i) => (
                <div key={i} className="confetti-piece" style={{
                  left: `${Math.random() * 100}%`,
                  background: ["#7dd3fc","#25D366","#F4A261","#a78bfa","#ff6b6b","#60a5d8","#fff"][i % 7],
                  width: `${6 + Math.random() * 8}px`,
                  height: `${6 + Math.random() * 8}px`,
                  animationDuration: `${2 + Math.random() * 3}s`,
                  animationDelay: `${Math.random() * 1.5}s`,
                  borderRadius: i % 3 === 0 ? "50%" : "2px",
                }} />
              ))}

              <div style={{ textAlign:"center", marginBottom:32 }}>
                <div className="bounce-icon" style={{ fontSize:80, marginBottom:16, display:"block" }}>🎉</div>
                <h2 style={{ color:"#0369a1", fontSize:32, margin:"0 0 8px", fontWeight:700 }}>¡Cita Confirmada!</h2>
                <p style={{ color:"#475569", marginBottom:4, fontSize:16 }}>Cita con <strong style={{ color:"#082f49" }}>{selectedDoctor.name}</strong></p>
                <p style={{ color:"#334155", fontSize:14, marginBottom:4 }}>📅 {bookingData.date} · 🕐 {bookingData.time}</p>
                <p style={{ color:"#334155", fontSize:14, marginBottom:24 }}>{bookingData.modalidad === "virtual" ? "📱 Consulta virtual por WhatsApp Video" : `📍 ${selectedDoctor.address || "Consultorio del médico"}`}</p>

                {/* Resumen pago */}
                <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:14, padding:"14px 20px", marginBottom:24, display:"inline-block", minWidth:280 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, marginBottom:6 }}>
                    <span style={{ color:"#475569" }}>✅ Adelanto pagado</span>
                    <span style={{ color:"#15803d", fontWeight:700 }}>S/. {AVANCE.monto}</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:14 }}>
                    <span style={{ color:"#475569" }}>📋 Resto en consulta</span>
                    <span style={{ color:"#082f49", fontWeight:700 }}>S/. {parseInt((selectedDoctor.price||"S/. 0").replace(/\D/g,"")) - AVANCE.monto}</span>
                  </div>
                </div>

                <p style={{ color:"#334155", fontSize:14, marginBottom:24 }}>¿Deseas enviar la confirmación por WhatsApp?</p>
                <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
                  <button style={{ ...T.ctaPrimary, background:"linear-gradient(135deg,#25D366,#128C7E)", fontSize:15 }} onClick={() => setShowNotifPanel(true)}>📲 Enviar WhatsApp</button>
                  <button style={{ padding:"14px 32px", background:"transparent", color:"#0369a1", border:"1.5px solid #7dd3fc", borderRadius:12, fontSize:16, cursor:"pointer", fontFamily:"inherit" }} onClick={resetBooking}>Omitir</button>
                </div>
              </div>

              {/* POLÍTICA DE CANCELACIÓN */}
              <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:14, padding:20 }}>
                <h3 style={{ margin:"0 0 12px", color:"#c2410c", fontSize:16 }}>📋 Política de cancelación</h3>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {[
                    { icon:"✅", label:"Cancelas con +48h de anticipación", result:"Reembolso completo de S/. 20", color:"#15803d" },
                    { icon:"❌", label:"Cancelas con menos de 48h", result:"Sin reembolso (S/. 20 retenidos)", color:"#dc2626" },
                    { icon:"✅", label:"El médico cancela o no se presenta", result:"Reembolso automático de S/. 20", color:"#15803d" },
                  ].map((item, i) => (
                    <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", padding:"10px 14px", background:"#ffffff", borderRadius:10 }}>
                      <span style={{ fontSize:18 }}>{item.icon}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, color:"#082f49", marginBottom:2 }}>{item.label}</div>
                        <div style={{ fontSize:12, color:item.color, fontWeight:700 }}>{item.result}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ margin:"14px 0 0", fontSize:12, color:"#78716c" }}>
                  Para cancelar tu cita, escríbenos por WhatsApp al <strong style={{ color:"#c2410c" }}>913 330 712</strong> indicando tu nombre y fecha de cita.
                </p>
                <button style={{ marginTop:12, width:"100%", padding:"10px 0", background:"linear-gradient(135deg,#25D366,#128C7E)", color:"#fff", border:"none", borderRadius:10, cursor:"pointer", fontSize:14, fontWeight:700, fontFamily:"inherit" }}
                  onClick={() => {
                    const msg = `Hola MediAyacucho, quiero cancelar mi cita:\n\n👤 ${bookingData.patient_name}\n📅 ${bookingData.date} · ${bookingData.time}\n👨‍⚕️ ${selectedDoctor.name}\n\nSolicito el reembolso del adelanto de S/. ${AVANCE.monto}.`;
                    window.open(`https://wa.me/51913330712?text=${encodeURIComponent(msg)}`, "_blank");
                  }}>
                  💬 Solicitar cancelación por WhatsApp
                </button>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth:540, margin:"0 auto" }}>
              <button onClick={() => setView("doctors")} style={{ background:"none", border:"none", color:"#0369a1", cursor:"pointer", fontSize:15, marginBottom:24, padding:0, fontFamily:"inherit" }}>← Volver</button>
              <div style={{ background:"#ffffff", border:"1px solid #bae6fd", borderRadius:16, padding:24, marginBottom:24, boxShadow:"0 8px 28px rgba(15,23,42,0.06)" }}>
                <div style={{ display:"flex", gap:16, alignItems:"center" }}>
                  <div style={T.avatar(selectedDoctor.color)}>{selectedDoctor.img||initials(selectedDoctor.name)}</div>
                  <div>
                    <h3 style={{ margin:0, color:"#082f49" }}>{selectedDoctor.name}</h3>
                    <p style={{ margin:"4px 0 0", color:"#475569", fontSize:14 }}>{selectedDoctor.specialty} · {selectedDoctor.price}</p>
                  </div>
                </div>

                {/* MODALIDAD SELECTOR */}
                <div style={{ marginTop:16, display:"flex", gap:10 }}>
                  <button style={{ flex:1, padding:"10px 0", borderRadius:10, border:`2px solid ${bookingData.modalidad==="presencial" ? "#0ea5e9" : "#e2e8f0"}`, background:bookingData.modalidad==="presencial" ? "#e0f2fe" : "transparent", color:bookingData.modalidad==="presencial" ? "#0369a1" : "#64748b", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:700 }}
                    onClick={() => setBookingData({...bookingData, modalidad:"presencial"})}>
                    🏥 Presencial
                  </button>
                  <button style={{ flex:1, padding:"10px 0", borderRadius:10, border:`2px solid ${bookingData.modalidad==="virtual" ? "#25D366" : "#e2e8f0"}`, background:bookingData.modalidad==="virtual" ? "#f0fdf4" : "transparent", color:bookingData.modalidad==="virtual" ? "#15803d" : "#64748b", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:700 }}
                    onClick={() => setBookingData({...bookingData, modalidad:"virtual"})}>
                    📱 Virtual (WhatsApp)
                  </button>
                </div>

                {/* INFO SEGÚN MODALIDAD */}
                {bookingData.modalidad === "presencial" && selectedDoctor.address && (
                  <div style={{ marginTop:12, padding:"12px 16px", background:"#f0f9ff", borderRadius:10, display:"flex", alignItems:"flex-start", gap:10 }}>
                    <span style={{ fontSize:18 }}>📍</span>
                    <div>
                      <p style={{ margin:"0 0 4px", fontSize:12, color:"#0369a1", textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 }}>Dirección del consultorio</p>
                      <p style={{ margin:"0 0 6px", color:"#082f49", fontSize:14 }}>{selectedDoctor.address}</p>
                      <a href={selectedDoctor.maps_url||"#"} target="_blank" rel="noreferrer" style={{ fontSize:12, color:"#0369a1", textDecoration:"none", background:"#e0f2fe", border:"1px solid #bae6fd", padding:"4px 12px", borderRadius:20, display:"inline-block" }}>🗺️ Ver en Google Maps</a>
                    </div>
                  </div>
                )}
                {bookingData.modalidad === "virtual" && (
                  <div style={{ marginTop:12, padding:"14px 16px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10 }}>
                    <p style={{ margin:"0 0 8px", fontSize:13, fontWeight:700, color:"#15803d" }}>📱 Consulta por WhatsApp Video</p>
                    <p style={{ margin:"0 0 6px", fontSize:13, color:"#334155" }}>• El médico te llamará por WhatsApp Video a la hora de tu cita</p>
                    <p style={{ margin:"0 0 6px", fontSize:13, color:"#334155" }}>• Asegúrate de tener buena conexión a internet</p>
                    <p style={{ margin:0, fontSize:13, color:"#334155" }}>• Ten lista tu cámara y micrófono</p>
                  </div>
                )}
              </div>
              <h2 style={{ fontSize:26, fontWeight:700, margin:"0 0 20px", color:"#082f49" }}>Datos de la cita</h2>
              {[["NOMBRE COMPLETO","patient_name","Tu nombre completo","text"],["TELÉFONO / WHATSAPP","patient_phone","+51 9XX XXX XXX","text"]].map(([lbl,key,ph,type])=>(
                <div key={key} style={{ marginBottom:16 }}>
                  <label style={T.labelLight}>{lbl}</label>
                  <input style={T.inputLight} placeholder={ph} type={type} value={bookingData[key]} onChange={e=>{setBookingData({...bookingData,[key]:e.target.value}); setWaitlistDone(false);}} />
                </div>
              ))}

              {/* CALENDARIO VISUAL - GRILLA MENSUAL */}
              <div style={{ marginBottom:16 }}>
                <label style={T.labelLight}>ELIGE UNA FECHA Y HORA DISPONIBLE</label>
                {(() => {
                  const booked = getBookedSlotsForDoctor(allAppointments, selectedDoctor.id);
                  const calDays = buildAvailabilityCalendar(selectedDoctor.schedule, booked);
                  const monthName = new Date().toLocaleDateString("es-PE", { month: "long", year: "numeric" });

                  if (calDays.length === 0) {
                    return <p style={{ color:"#64748b", fontSize:13, marginTop:8 }}>Este médico no tiene horarios configurados este mes.</p>;
                  }

                  const firstDow = calDays[0].dow;
                  const leadingBlanks = Array.from({ length: firstDow }, (_, i) => `blank-${i}`);
                  const dayLetters = ["D","L","M","M","J","V","S"];
                  const dayNamesFull = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
                  const activeDay = calDays.find(d => d.dateISO === selectedCalDay);

                  return (
                    <div style={{ marginTop:8, background:"#ffffff", border:"1px solid #bae6fd", borderRadius:16, padding:16, boxShadow:"0 4px 16px rgba(15,23,42,0.05)" }}>
                      <p style={{ margin:"0 0 12px", fontSize:14, color:"#0369a1", fontWeight:800, textTransform:"capitalize" }}>📅 {monthName}</p>

                      {/* Grid header */}
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:5, marginBottom:8 }}>
                        {dayLetters.map((l,i) => (
                          <div key={i} style={{ textAlign:"center", fontSize:12, fontWeight:800, color:"#0369a1" }}>{l}</div>
                        ))}
                      </div>

                      {/* Grid days */}
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:5, marginBottom:16 }}>
                        {leadingBlanks.map(k => <div key={k} />)}
                        {calDays.map(day => {
                          const isClickable = !day.isPastDay && day.hasAvailable;
                          const isSelectedDay = selectedCalDay === day.dateISO;
                          const hasBookingHere = bookingData.date === day.dateISO;
                          let bg = "#f8fafc", color = "#cbd5e1", border = "1px solid #f1f5f9";
                          if (day.isPastDay) { bg = "#ffffff"; color = "#e2e8f0"; border = "1px solid #f8fafc"; }
                          else if (!day.worksThisDay) { bg = "#ffffff"; color = "#e2e8f0"; border = "1px solid #f8fafc"; }
                          else if (!day.hasAvailable) { bg = "#fef2f2"; color = "#fca5a5"; border = "1px solid #fee2e2"; }
                          else { bg = "#e0f2fe"; color = "#0369a1"; border = "2px solid #7dd3fc"; }
                          if (isSelectedDay && day.hasAvailable && !hasBookingHere) { bg = "#bae6fd"; border = "2px solid #0ea5e9"; color = "#0c4a6e"; }
                          if (hasBookingHere) { bg = "#0ea5e9"; color = "#fff"; border = "2px solid #0369a1"; }

                          return (
                            <button
                              key={day.dateISO}
                              disabled={!isClickable}
                              onClick={() => setSelectedCalDay(day.dateISO)}
                              title={dayNamesFull[day.dow]}
                              style={{
                                aspectRatio:"1", borderRadius:10, fontSize:14, fontWeight: 800, fontFamily:"inherit",
                                cursor: isClickable ? "pointer" : "default", background: bg, color, border,
                                display:"flex", alignItems:"center", justifyContent:"center", position:"relative",
                                boxShadow: (day.hasAvailable && !day.isPastDay) ? "0 2px 6px rgba(14,165,233,0.15)" : "none",
                                transition:"all 0.15s",
                              }}>
                              {day.dayNum}
                            </button>
                          );
                        })}
                      </div>

                      {/* Legend */}
                      <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:16, fontSize:11, color:"#64748b" }}>
                        <span style={{ display:"flex", alignItems:"center", gap:5 }}><span style={{ width:12, height:12, borderRadius:4, background:"#e0f2fe", border:"2px solid #7dd3fc", display:"inline-block" }} /> Disponible</span>
                        <span style={{ display:"flex", alignItems:"center", gap:5 }}><span style={{ width:12, height:12, borderRadius:4, background:"#fef2f2", border:"1px solid #fee2e2", display:"inline-block" }} /> Sin cupos</span>
                        <span style={{ display:"flex", alignItems:"center", gap:5 }}><span style={{ width:12, height:12, borderRadius:4, background:"#0ea5e9", border:"2px solid #0369a1", display:"inline-block" }} /> Tu elección</span>
                      </div>

                      {/* Selected day's time slots */}
                      {activeDay ? (
                        activeDay.hasAvailable ? (
                          <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:12, padding:"14px 16px" }}>
                            <p style={{ margin:"0 0 10px", fontSize:14, fontWeight:800, color:"#0369a1" }}>{dayNamesFull[activeDay.dow]} {activeDay.dayNum} — horarios disponibles</p>
                            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                              {activeDay.times.map(t => {
                                const isSelected = bookingData.date === activeDay.dateISO && bookingData.time === t.time;
                                return (
                                  <button
                                    key={t.time}
                                    disabled={!t.available}
                                    onClick={() => { setBookingData({...bookingData, date: activeDay.dateISO, time: t.time}); setWaitlistDone(false); }}
                                    style={{
                                      padding:"8px 16px", borderRadius:20, fontSize:13, fontWeight:700, fontFamily:"inherit", cursor: t.available ? "pointer" : "not-allowed",
                                      border: `2px solid ${isSelected ? "#0369a1" : t.available ? "#0ea5e9" : "#f1f5f9"}`,
                                      background: isSelected ? "#0369a1" : t.available ? "#ffffff" : "#f1f5f9",
                                      color: isSelected ? "#fff" : t.available ? "#0369a1" : "#cbd5e1",
                                      textDecoration: t.available ? "none" : "line-through",
                                      boxShadow: t.available ? "0 2px 6px rgba(14,165,233,0.1)" : "none",
                                    }}>
                                    {t.time}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <p style={{ fontSize:13, color:"#64748b", margin:0 }}>Este día no tiene horarios disponibles.</p>
                        )
                      ) : (
                        <p style={{ fontSize:13, color:"#0369a1", fontWeight:600, margin:0 }}>👆 Toca un día resaltado en azul para ver sus horarios.</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {(() => {
                if (!bookingData.date || !bookingData.time) return null;
                const booked = getBookedSlotsForDoctor(allAppointments, selectedDoctor.id);
                const slotKey = `${bookingData.date} ${bookingData.time}`;
                const isOccupied = booked.has(slotKey);
                if (!isOccupied) return null;
                return (
                  <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:12, padding:16, marginBottom:16 }}>
                    {waitlistDone ? (
                      <div style={{ textAlign:"center" }}>
                        <div style={{ fontSize:28, marginBottom:6 }}>✅</div>
                        <p style={{ margin:0, color:"#15803d", fontWeight:700, fontSize:14 }}>¡Listo! Te avisaremos por WhatsApp si se libera este horario.</p>
                      </div>
                    ) : (
                      <>
                        <p style={{ margin:"0 0 10px", color:"#c2410c", fontSize:14, fontWeight:700 }}>⏰ Ese horario ya está reservado por otro paciente</p>
                        <p style={{ margin:"0 0 12px", color:"#475569", fontSize:13 }}>Elige otro horario disponible arriba, o anótate en la lista de espera. Si se cancela esa cita, te avisaremos por WhatsApp de inmediato.</p>
                        <button
                          style={{ width:"100%", padding:"10px 0", background:"linear-gradient(135deg,#F4A261,#ea9550)", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity: (!bookingData.patient_name||!bookingData.patient_phone)?0.5:1 }}
                          onClick={joinWaitlist}
                          disabled={!bookingData.patient_name||!bookingData.patient_phone||waitlistSubmitting}>
                          {waitlistSubmitting ? "Anotando..." : "⏰ Anotarme en lista de espera"}
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* AVANCE BOX */}
              <div style={{ background:"#fff7ed", border:"2px solid #fed7aa", borderRadius:14, padding:"16px 18px", marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <span style={{ fontWeight:700, color:"#c2410c", fontSize:15 }}>💰 Pago para reservar</span>
                  <span style={{ fontSize:22, fontWeight:700, color:"#082f49" }}>S/. {AVANCE.monto}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#475569", marginBottom:6 }}>
                  <span>Precio total consulta</span>
                  <span>{selectedDoctor.price}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#475569", marginBottom:6 }}>
                  <span>Adelanto ahora</span>
                  <span style={{ color:"#c2410c", fontWeight:700 }}>S/. {AVANCE.monto}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#475569", paddingTop:8, borderTop:"1px solid #fed7aa" }}>
                  <span>Resto a pagar en consulta</span>
                  <span style={{ color:"#334155", fontWeight:700 }}>S/. {parseInt((selectedDoctor.price||"S/. 0").replace(/\D/g,"")) - AVANCE.monto}</span>
                </div>
                <div style={{ marginTop:12, background:"#f0fdf4", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#475569", display:"flex", gap:8, alignItems:"flex-start" }}>
                  <span>✅</span>
                  <span><strong style={{ color:"#15803d" }}>{AVANCE.politica}.</strong> Si no cancelas a tiempo, el adelanto no es reembolsable.</span>
                </div>
              </div>

              {(() => {
                const booked = getBookedSlotsForDoctor(allAppointments, selectedDoctor.id);
                const slotKey = bookingData.date && bookingData.time ? `${bookingData.date} ${bookingData.time}` : "";
                const isOccupied = slotKey && booked.has(slotKey);
                const disabled = !bookingData.patient_name||!bookingData.patient_phone||!bookingData.date||!bookingData.time||isOccupied;
                return (
                  <button style={{ ...T.ctaPrimary, width:"100%", marginTop:4, opacity:disabled?0.5:1 }} onClick={confirmBooking} disabled={disabled}>
                    💳 Pagar adelanto S/. {AVANCE.monto} y reservar
                  </button>
                );
              })()}
              <p style={{ textAlign:"center", fontSize:12, color:"#64748b", margin:"8px 0 0" }}>El resto (S/. {parseInt((selectedDoctor.price||"S/. 0").replace(/\D/g,"")) - AVANCE.monto}) se paga directamente al médico</p>
            </div>
          )}
        </div>
      )}

      {/* CHAT */}
      {view === "chat" && (
        <div style={{ maxWidth:720, margin:"0 auto", padding:"40px 24px", position:"relative", zIndex:1 }}>
          <h2 style={{ fontSize:32, fontWeight:700, margin:"0 0 8px", color:"#082f49" }}>Asistente Médico IA</h2>
          <p style={{ color:"#475569", margin:"0 0 24px" }}>Cuéntame tus síntomas y te ayudo a encontrar el médico ideal</p>
          <div style={{ background:"#ffffff", border:"1px solid #e0f2fe", borderRadius:20, overflow:"hidden", display:"flex", flexDirection:"column", height:"70vh", boxShadow:"0 8px 28px rgba(15,23,42,0.06)" }}>
            <div style={{ flex:1, overflowY:"auto", padding:24, display:"flex", flexDirection:"column", gap:16 }}>
              {messages.map((m,i)=>(
                <div key={i} style={T.msgBubble(m.role)}>
                  {m.role==="assistant" && <span style={{ fontSize:12, color:"#0369a1", display:"block", marginBottom:4, fontWeight:600 }}>🩺 Asistente IA</span>}
                  {m.content}
                </div>
              ))}
              {loading && <div style={{ ...T.msgBubble("assistant"), color:"#0369a1" }}>Pensando... ⏳</div>}
              <div ref={chatEndRef} />
            </div>
            <div style={{ display:"flex", gap:12, padding:16, borderTop:"1px solid #e0f2fe" }}>
              <input style={{ flex:1, background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:12, padding:"12px 16px", color:"#082f49", fontSize:15, fontFamily:"inherit", outline:"none" }} placeholder="Escribe tu consulta aquí..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()} />
              <button style={{ padding:"12px 20px", background:"linear-gradient(135deg,#0ea5e9,#7dd3fc)", color:"#fff", border:"none", borderRadius:12, cursor:"pointer", fontSize:20, fontFamily:"inherit" }} onClick={sendMessage} disabled={loading}>➤</button>
            </div>
          </div>
          <button style={{ padding:"14px 32px", background:"transparent", color:"#0369a1", border:"1.5px solid #7dd3fc", borderRadius:12, fontSize:16, cursor:"pointer", fontFamily:"inherit", marginTop:20, width:"100%" }} onClick={() => setView("doctors")}>Ver médicos disponibles</button>
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
              <h3 style={{ color:"#7dd3fc", fontSize:22, margin:"0 0 8px" }}>¡Registro enviado!</h3>
              <p style={{ color:"#60a5d8", fontSize:14 }}>Tu perfil está en revisión. Te activaremos en 24h tras verificar el pago.</p>
            </div>
          ) : (
            <div style={{ background:"rgba(255,255,255,0.04)", border:"2px solid rgba(59,130,196,0.3)", borderRadius:20, padding:32, marginBottom:24 }}>
              <div style={{ fontSize:24, fontWeight:700, color:"#7dd3fc" }}>Plan Profesional</div>
              <div style={{ fontSize:48, fontWeight:700, color:"#e8f0f8", margin:"12px 0" }}>S/. 99<span style={{ fontSize:18, color:"#60a5d8" }}>/mes</span></div>
              <ul style={{ listStyle:"none", padding:0, margin:"0 0 24px" }}>
                {["✅ Perfil médico verificado","✅ Gestión de citas online","✅ Panel de control completo","✅ Notificaciones WhatsApp/SMS","✅ Recomendaciones por IA","✅ Estadísticas en tiempo real","✅ Soporte prioritario 24/7"].map((f,i)=>(
                  <li key={i} style={{ padding:"8px 0", borderBottom:"1px solid rgba(14,165,233,0.2)", color:"#e0f2fe", fontSize:15 }}>{f}</li>
                ))}
              </ul>
              {[["NOMBRE COMPLETO","name","Dr. / Dra. Nombre Apellido","text"],["ESPECIALIDAD","specialty","Tu especialidad médica","text"],["CORREO ELECTRÓNICO","email","correo@ejemplo.com","email"],["TELÉFONO / WHATSAPP","phone","+51 9XX XXX XXX","text"]].map(([lbl,key,ph,type])=>(
                <div key={key} style={{ marginBottom:14 }}>
                  <label style={T.label}>{lbl}</label>
                  <input style={T.input} placeholder={ph} type={type} value={regData[key]} onChange={e=>setRegData({...regData,[key]:e.target.value})} />
                </div>
              ))}

              <div style={{ marginBottom:14 }}>
                <label style={T.label}>NÚMERO YAPE/PLIN (para recibir tus pagos) *</label>
                <input style={T.input} placeholder="+51 9XX XXX XXX" value={regData.yape_plin_phone} onChange={e=>setRegData({...regData,yape_plin_phone:e.target.value})} />
                <label style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, fontSize:12, color:"#60a5d8", cursor:"pointer" }}>
                  <input type="checkbox" checked={regData.yape_plin_phone === regData.phone && !!regData.phone} onChange={e=>setRegData({...regData, yape_plin_phone: e.target.checked ? regData.phone : ""})} />
                  Es el mismo número que mi WhatsApp
                </label>
                <p style={{ fontSize:11, color:"#60a5d8", margin:"6px 0 0" }}>Aquí te transferiremos el adelanto de cada cita confirmada (S/. 20).</p>
              </div>

              {/* CMP SECTION */}
              <div style={{ background:"rgba(59,130,196,0.06)", border:"1px solid rgba(14,165,233,0.25)", borderRadius:14, padding:20, marginBottom:16 }}>
                <div style={{ fontSize:15, fontWeight:700, color:"#7dd3fc", marginBottom:4 }}>🏥 Verificación CMP obligatoria</div>
                <p style={{ fontSize:12, color:"#60a5d8", margin:"0 0 14px" }}>Solo médicos registrados en el Colegio Médico del Perú pueden inscribirse.</p>

                <div style={{ marginBottom:12 }}>
                  <label style={T.label}>NÚMERO CMP *</label>
                  <div style={{ display:"flex", gap:8 }}>
                    <input style={{ ...T.input, marginBottom:0, flex:1 }} placeholder="Ej: 12345" value={regData.cmp} onChange={e=>setRegData({...regData,cmp:e.target.value.replace(/\D/g,"")})} maxLength={6} />
                    <button style={{ padding:"10px 16px", background:"linear-gradient(135deg,#0ea5e9,#7dd3fc)", color:"#fff", border:"none", borderRadius:10, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:700, whiteSpace:"nowrap", opacity:(!regData.cmp||!regData.name||!regData.specialty)?0.5:1 }}
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
                      <div style={{ color:"#7dd3fc", fontSize:14 }}>📄 {diplomaFile.name} <span style={{ color:"#52B788" }}>✓</span></div>
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
                      <p style={{ margin:"0 0 8px", fontSize:13, color:"#e0f2fe", lineHeight:1.5 }}>{r.resumen}</p>
                      {r.alertas?.length > 0 && (
                        <div style={{ marginTop:8 }}>
                          {r.alertas.map((a,i) => <div key={i} style={{ fontSize:12, color:"#F4A261", marginBottom:3 }}>• {a}</div>)}
                        </div>
                      )}
                      {r.verificar_en && (
                        <a href={r.verificar_en} target="_blank" rel="noreferrer" style={{ fontSize:12, color:"#7dd3fc", display:"block", marginTop:8 }}>
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

          <div style={{ background:"rgba(59,130,196,0.07)", border:"1px solid rgba(14,165,233,0.25)", borderRadius:16, padding:20, textAlign:"center" }}>
            <p style={{ color:"#60a5d8", fontSize:13, margin:"0 0 12px" }}>🎯 ¿Quieres ver el panel de control antes de inscribirte?</p>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
              {doctors.slice(0,3).map(doc=>(
                <button key={doc.id} style={{ padding:"8px 16px", background:"rgba(59,130,196,0.15)", border:"1px solid rgba(59,130,196,0.3)", borderRadius:10, color:"#7dd3fc", cursor:"pointer", fontFamily:"inherit", fontSize:13 }} onClick={() => setDashboardDoctor(doc)}>
                  {doc.img||initials(doc.name)} {doc.name.split(" ")[1]}
                </button>
              ))}
            </div>
          </div>
          <p style={{ textAlign:"center", color:"#7dd3fc", fontSize:14, marginTop:20 }}>¿Preguntas? WhatsApp: <strong>913 330 712</strong></p>
        </div>
      )}

      {/* FOOTER */}
      {view === "home" && (
        <footer style={{ background:"rgba(0,0,0,0.4)", borderTop:"1px solid rgba(59,130,196,0.15)", padding:"60px 24px 24px" }}>
          <div style={{ maxWidth:1100, margin:"0 auto" }}>
            <div className="footer-grid" style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:40, marginBottom:48 }}>

              {/* Colonne 1 — Logo + desc */}
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                  <svg width="36" height="36" viewBox="0 0 72 72" fill="none">
                    <circle cx="36" cy="36" r="36" fill="url(#lgf)"/>
                    <rect x="28" y="14" width="16" height="44" rx="4" fill="white"/>
                    <rect x="14" y="28" width="44" height="16" rx="4" fill="white"/>
                    <circle cx="36" cy="36" r="5" fill="url(#lgf)"/>
                    <defs>
                      <linearGradient id="lgf" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#0ea5e9"/>
                        <stop offset="100%" stopColor="#7dd3fc"/>
                      </linearGradient>
                    </defs>
                  </svg>
                  <div>
                    <div style={{ fontSize:18, fontWeight:700 }}><span style={{ color:"#7dd3fc" }}>Medi</span><span style={{ color:"#e0f2fe", fontWeight:300 }}>Ayacucho</span></div>
                    <div style={{ fontSize:9, color:"#bae6fd", letterSpacing:2, textTransform:"uppercase" }}>Salud para todos</div>
                  </div>
                </div>
                <p style={{ color:"#bae6fd", fontSize:14, lineHeight:1.7, margin:"0 0 20px", maxWidth:260 }}>
                  Conectamos a la población de Ayacucho con médicos calificados y verificados por el CMP.
                </p>
                {/* Redes sociales */}
                <div style={{ display:"flex", gap:10 }}>
                  {[
                    { icon:"📘", label:"Facebook", url:"https://facebook.com" },
                    { icon:"📸", label:"Instagram", url:"https://instagram.com" },
                    { icon:"💬", label:"WhatsApp", url:"https://wa.me/51913330712" },
                    { icon:"🐦", label:"TikTok", url:"https://tiktok.com" },
                  ].map((s,i)=>(
                    <a key={i} href={s.url} target="_blank" rel="noreferrer" title={s.label}
                      style={{ width:36, height:36, borderRadius:10, background:"rgba(59,130,196,0.12)", border:"1px solid rgba(59,130,196,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, textDecoration:"none", transition:"all 0.2s" }}
                      onMouseEnter={e=>{e.target.style.background="rgba(59,130,196,0.25)";e.target.style.transform="translateY(-2px)"}}
                      onMouseLeave={e=>{e.target.style.background="rgba(59,130,196,0.12)";e.target.style.transform=""}}>
                      {s.icon}
                    </a>
                  ))}
                </div>
              </div>

              {/* Colonne 2 — Navegación */}
              <div>
                <h4 style={{ color:"#e8f0f8", fontSize:14, fontWeight:700, margin:"0 0 16px", textTransform:"uppercase", letterSpacing:1 }}>Navegación</h4>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {[["Inicio","home"],["Médicos","doctors"],["Asistente IA","chat"],["Soy Médico","doctor-register"]].map(([label,v])=>(
                    <button key={v} style={{ background:"none", border:"none", color:"#bae6fd", cursor:"pointer", fontSize:14, textAlign:"left", padding:0, fontFamily:"inherit", transition:"color 0.2s" }}
                      onMouseEnter={e=>e.target.style.color="#7dd3fc"}
                      onMouseLeave={e=>e.target.style.color="#bae6fd"}
                      onClick={()=>setView(v)}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Colonne 3 — Contacto */}
              <div>
                <h4 style={{ color:"#e8f0f8", fontSize:14, fontWeight:700, margin:"0 0 16px", textTransform:"uppercase", letterSpacing:1 }}>Contacto</h4>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {[
                    { icon:"💬", label:"WhatsApp", val:"913 330 712", url:"https://wa.me/51913330712" },
                    { icon:"📧", label:"Email", val:"info@mediayacucho.pe", url:"mailto:info@mediayacucho.pe" },
                    { icon:"📍", label:"Ciudad", val:"Ayacucho, Perú", url:null },
                    { icon:"🕐", label:"Horario", val:"Lun–Sáb 8am–8pm", url:null },
                  ].map((item,i)=>(
                    <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                      <span style={{ fontSize:14 }}>{item.icon}</span>
                      <div>
                        <div style={{ fontSize:11, color:"#bae6fd", marginBottom:1 }}>{item.label}</div>
                        {item.url
                          ? <a href={item.url} style={{ fontSize:13, color:"#7dd3fc", textDecoration:"none" }}>{item.val}</a>
                          : <span style={{ fontSize:13, color:"#e0f2fe" }}>{item.val}</span>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Colonne 4 — Legal */}
              <div>
                <h4 style={{ color:"#e8f0f8", fontSize:14, fontWeight:700, margin:"0 0 16px", textTransform:"uppercase", letterSpacing:1 }}>Legal</h4>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {["Términos y condiciones","Política de privacidad","Política de cancelación","Política de reembolso"].map((item,i)=>(
                    <span key={i} style={{ color:"#bae6fd", fontSize:13, cursor:"pointer", transition:"color 0.2s" }}
                      onMouseEnter={e=>e.target.style.color="#7dd3fc"}
                      onMouseLeave={e=>e.target.style.color="#bae6fd"}>
                      {item}
                    </span>
                  ))}
                </div>
                <div style={{ marginTop:20, padding:"10px 14px", background:"rgba(37,211,102,0.08)", border:"1px solid rgba(37,211,102,0.2)", borderRadius:10 }}>
                  <div style={{ fontSize:11, color:"#25D366", fontWeight:700, marginBottom:2 }}>✅ Plataforma verificada</div>
                  <div style={{ fontSize:11, color:"#bae6fd" }}>Médicos CMP certificados</div>
                </div>
              </div>
            </div>

            {/* Bottom bar */}
            <div style={{ borderTop:"1px solid rgba(59,130,196,0.1)", paddingTop:24, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
              <span style={{ color:"#bae6fd", fontSize:13 }}>© 2026 MediAyacucho · Todos los derechos reservados</span>
              <div style={{ display:"flex", gap:16 }}>
                <span style={{ color:"#bae6fd", fontSize:12 }}>🇵🇪 Hecho en Perú</span>
                <span style={{ color:"#bae6fd", fontSize:12 }}>🔒 Pagos seguros</span>
                <span style={{ color:"#bae6fd", fontSize:12 }}>✅ CMP Verificado</span>
              </div>
            </div>
          </div>
        </footer>
      )}

    </div>
  );
}
