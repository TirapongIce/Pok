import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { thaiLotterySchedule } from "./utils/thaiSchedule";
import PurchaseForm from "./components/PurchaseForm";
import PurchaseSelector from "./components/PurchaseSelector";
import DepositPanel from "./components/DepositPanel";
import WithdrawPanel from "./components/WithdrawPanel";
import HomeHub from "./components/HomeHub";
import CreditInfoPanel from "./components/CreditInfoPanel";
import TicketHistoryPanel from "./components/TicketHistoryPanel";
import AccountSettingsPanel from "./components/AccountSettingsPanel";
import { useI18n } from "./i18n.jsx";
import NewsPanel from "./components/NewsPanel";
import ContactAdminPanel from "./components/ContactAdminPanel";
import BackOfficePanel from "./components/BackOfficePanel";
import { fallbackLotteries, defaultResults } from "./constants/defaults";
import { payoutOptionMap } from "./constants/purchaseOptions";
import { formatDateTime } from "./utils/lotteryHelpers";

const initialPayload = {
  lotteries: [],
  summary: null,
  members: [],
  ledger: [],
  creditBetween: [],
  daily: null,
  income: [],
  announcements: [],
  settings: null,
  results: defaultResults,
  promotions: [],
  transactions: []
};

const userFlowMenu = [
  { id: "home", label: "หน้าหลัก", labelKey: "nav.home", icon: "🏠", view: "home", homeShortcut: false },
  { id: "cash-deposit", label: "ฝาก-เครดิต", labelKey: "nav.deposit", icon: "💰", view: "cash-deposit", homeShortcut: true },
  { id: "cash-withdraw", label: "ถอน-เครดิต", labelKey: "nav.withdraw", icon: "🏧", view: "cash-withdraw", homeShortcut: true },
  { id: "credit-info", label: "ข้อมูลเครดิต", labelKey: "nav.credit", icon: "📑", view: "credit-info", homeShortcut: true },
  { id: "purchase", label: "แทงหวย", labelKey: "nav.purchase", icon: "🎯", view: "purchase", homeShortcut: true, hideForSuperAdmin: true },
  { id: "tickets", label: "รายการโพย", labelKey: "nav.tickets", icon: "🧾", view: "tickets", homeShortcut: true, hideForSuperAdmin: true },
  { id: "account-settings", label: "ตั้งค่าบัญชี", labelKey: "nav.account", icon: "⚙️", view: "account-settings", homeShortcut: true },
  { id: "news", label: "ข่าว-ประชาสัมพันธ์", labelKey: "nav.news", icon: "📰", view: "news", homeShortcut: true },
  { id: "contact", label: "ติดต่อแอดมิน", labelKey: "nav.contact", icon: "📞", view: "contact", homeShortcut: true }
];

const staffNavGroups = [
  {
    id: "overview-group",
    label: "ภาพรวม",
    items: [
      { id: "home", label: "หน้าหลัก", icon: "🏠", view: "home", homeShortcut: false },
      { id: "lotteries", label: "รายการหวย", labelKey: "nav.lotteries", icon: "🎰", view: "lotteries", homeShortcut: true, hideForSuperAdmin: true },
      { id: "purchase", label: "แทงโพย", labelKey: "nav.purchase", icon: "🧾", view: "purchase", homeShortcut: true, hideForSuperAdmin: true },
      { id: "admin-overview", label: "แดชบอร์ดหลังบ้าน", labelKey: "nav.dashboard", icon: "🛠️", view: "backoffice", section: "overview", homeShortcut: true },
      { id: "ticket-verify", label: "ยืนยันโพยถูกรางวัล", icon: "✅", view: "backoffice", section: "ticket-verify", homeShortcut: true, requiresSuperAdmin: true }
    ]
  },
  {
    id: "finance-group",
    label: "ฝากตรง-ถอนตรง",
    items: [
      { id: "credit", label: "ข้อมูลเครดิต", labelKey: "nav.credit", icon: "📑", view: "backoffice", section: "credit", homeShortcut: false },
      { id: "approvals", label: "อนุมัติคำขอ", labelKey: "nav.approvals", icon: "✅", view: "backoffice", section: "approvals", homeShortcut: true },
      { id: "credit-history", label: "ประวัติเครดิต", icon: "🧾", view: "backoffice", section: "credit-history", homeShortcut: false },
      { id: "credit-topup", label: "เติมเครดิต", labelKey: "nav.credit.topup", icon: "💳", view: "backoffice", section: "credit-topup", homeShortcut: false, requiresSuperAdmin: true }
    ]
  },
  {
    id: "member-group",
    label: "สมาชิก & ระบบแนะนำ",
    items: [
      { id: "members", label: "สมาชิก", labelKey: "nav.members", icon: "👥", view: "backoffice", section: "members", homeShortcut: true },
      { id: "member-create", label: "เพิ่มสมาชิกใหม่", labelKey: "nav.member.create", icon: "➕", view: "backoffice", section: "member-create", homeShortcut: false, requiresSuperAdmin: true },
      { id: "history", label: "โพยย้อนหลัง", labelKey: "nav.history", icon: "📜", view: "backoffice", section: "history", homeShortcut: false }
    ]
  },
  {
    id: "settings-group",
    label: "การตั้งค่า & หวย",
    items: [
      { id: "lottery-control", label: "เปิด-ปิดระบบหวย", labelKey: "nav.lottery.control", icon: "🎛️", view: "backoffice", section: "lottery-control", homeShortcut: true },
      { id: "lottery-numbers", label: "เลขอั้น", labelKey: "nav.restrictions", icon: "#️⃣", view: "backoffice", section: "lottery-numbers", homeShortcut: false },
      { id: "round-number-summary", label: "สรุปเลขซื้อรายงวด", icon: "📊", view: "backoffice", section: "round-number-summary", homeShortcut: false, requiresSuperAdmin: true },
      { id: "lottery-results", label: "ประกาศผลรางวัล", labelKey: "nav.lottery.results", icon: "🏆", view: "backoffice", section: "lottery-results", homeShortcut: true },
      { id: "announcements", label: "ข่าว-ประชาสัมพันธ์", labelKey: "nav.announcements", icon: "📰", view: "backoffice", section: "announcements", homeShortcut: true },
      { id: "support-center", label: "ศูนย์ช่วยเหลือ", labelKey: "nav.support", icon: "☎️", view: "backoffice", section: "support", homeShortcut: false }
    ]
  }
];

const lotteryIconMap = {
  "th-lottery": "🇹🇭",
  "gsb-lottery": "🏦",
  "baac-lottery": "🏦",
  "lao-lottery": "🇱🇦",
  "lao-vip": "🇱🇦",
  "lao-star": "🇱🇦",
  "viet-vip": "🇻🇳",
  "viet-special": "🇻🇳",
  "viet-standard": "🇻🇳",
  "set-ger": "🇩🇪",
  "germany-set": "🇩🇪",
  "china-morning": "🇨🇳",
  "china-afternoon": "🇨🇳",
  "england-set": "🏴",
  "downjone-set": "🇺🇸"
};

const lotteryRules = {
  "th-lottery": {
    title: "กฎและกติกา - หวยรัฐบาลไทย",
    schedule: [
      { label: "วันหวยออก", value: "วันที่ 1 และ 16 ของทุกเดือน*" },
      { label: "เปิดรับแทง", value: "เปิด 12.00 น. วันถัดมาหลังวันที่ปิด*" },
      { label: "ปิดรับแทง", value: "เวลา 15:20 น.*" },
      { label: "ออกผล", value: "ประมาณ 15:40 น.**" }
    ],
    baseNotes: [
      "(หวยทุกประเภทอิงตามเวลาประเทศไทย)",
      "(* หากมีการเปลี่ยนแปลงทางเว็บไซต์จะแจ้งให้ทราบล่วงหน้า)",
      "(** กรณีที่วันนั้นไม่มีการออกผลรางวัล ระบบจะย้ายบิลไปวันที่เปิดงวดใหม่)"
    ],
    resultDescription: "การออกผลรางวัลอ้างอิงจากสลากกินแบ่งรัฐบาลไทย",
    payout: [
      { type: "3 ตัวบน", rate: "500 - 1,000" },
      { type: "3 ตัวโต๊ด", rate: "50 - 120" },
      { type: "2 ตัวบน/ล่าง", rate: "50 - 90" },
      { type: "วิ่งบน", rate: "1 - 5" },
      { type: "วิ่งล่าง", rate: "1 - 5" }
    ],
    payoutNote: "(*** หากอัตราจ่ายมาตรฐานมีการเปลี่ยนแปลงทางเว็บจะประกาศแจ้งให้ทราบล่วงหน้า)"
  },
  "lao-lottery": {
    title: "กฎและกติกา - หวยลาว",
    schedule: [
      { label: "วันหวยออก", value: "ทุกวันจันทร์, พุธ, ศุกร์*" },
      { label: "เปิดรับแทง", value: "เปิด 21:00 น. หลังปิดผล*" },
      { label: "ปิดรับแทง", value: "เวลา 20:00 น.*" },
      { label: "ออกผล", value: "ประมาณ 20:30 น.**" }
    ],
    baseNotes: [
      "(หวยทุกประเภทอิงตามเวลาประเทศไทย)",
      "(* หากมีการเปลี่ยนแปลงทางเว็บไซต์จะแจ้งให้ทราบล่วงหน้า)",
      "(** กรณีที่วันนั้นไม่มีการออกผลรางวัล ระบบจะย้ายบิลไปวันที่เปิดงวดใหม่)"
    ],
    resultDescription: "อ้างอิงผลการออกรางวัล หวยลาว 4 หลัก จากเว็บ https://laodl.com",
    resultGuide: [
      "3 ตัวบน ใช้เลขท้าย 3 จาก 4 หลักท้าย",
      "2 ตัวล่าง ใช้เลข หลักพัน และ หลักร้อย",
      "1 ตัววิ่ง ใช้เลขตัวสุดท้ายของผลรางวัล"
    ],
    example: {
      draw: "01[2345]",
      summary: [
        "3 ตัวบน คือ 345",
        "2 ตัวล่าง คือ 23",
        "1 ตัววิ่ง คือ 5"
      ]
    },
    payout: [
      { type: "3 ตัวบน", rate: "500 - 1,000" },
      { type: "3 ตัวโต๊ด", rate: "50 - 120" },
      { type: "2 ตัวบน/ล่าง", rate: "50 - 90" },
      { type: "วิ่งบน", rate: "1 - 5" },
      { type: "วิ่งล่าง", rate: "1 - 5" }
    ],
    payoutNote: "(*** หากอัตราจ่ายมาตรฐานมีการเปลี่ยนแปลงทางเว็บจะประกาศแจ้งให้ทราบล่วงหน้า)"
  }
};

const DEFAULT_PROMO_CODE = "normal-full";
const defaultPurchasePromotions = [
  { code: "normal-full", title: "จ่ายปกติ", description: "รับอัตราจ่ายเต็ม", discount_percent: 0 },
  { code: "discount-30", title: "ลด 30%", description: "ส่วนลด 30% ต่อโพย", discount_percent: 30 }
];

function toDate(dateString) {
  return new Date(dateString);
}

function resolveOpenCloseStatus(lottery, now = new Date()) {
  const baseOpen = new Date(lottery.openTime);
  const baseClose = new Date(lottery.closeTime);
  // ใช้เวลาเปิด/ปิดแบบรายวัน (ไม่อิงปี/เดือนของ seed)
  const open = new Date(now);
  open.setHours(baseOpen.getHours(), baseOpen.getMinutes(), 0, 0);
  const close = new Date(now);
  close.setHours(baseClose.getHours(), baseClose.getMinutes(), 0, 0);
  if (close <= open) {
    close.setDate(close.getDate() + 1);
  }
  const nowMs = now.getTime();
  if (nowMs < open.getTime()) {
    // ยังไม่ถึงเวลาเปิดวันนี้
    return {
      status: "closed",
      countdownTime: open.toISOString(),
      reason: "not-open",
      nextOpen: open.toISOString(),
      nextClose: close.toISOString()
    };
  }
  if (nowMs >= close.getTime()) {
    // เลยรอบวันนี้แล้ว ไปวันถัดไป
    const nextOpen = new Date(open);
    nextOpen.setDate(nextOpen.getDate() + 1);
    const nextClose = new Date(close);
    nextClose.setDate(nextClose.getDate() + 1);
    return {
      status: "closed",
      countdownTime: nextOpen.toISOString(),
      reason: "after-close",
      nextOpen: nextOpen.toISOString(),
      nextClose: nextClose.toISOString()
    };
  }
  // อยู่ในรอบเปิด
  return {
    status: "open",
    countdownTime: close.toISOString(),
    reason: "open",
    nextOpen: open.toISOString(),
    nextClose: close.toISOString()
  };
}

function buildThaiSlots() {
  return thaiLotterySchedule.schedule.map((item) => {
    const closeStart = new Date(`${item.date}T14:30:00+07:00`);
    const closeEnd = new Date(`${item.date}T20:00:00+07:00`);
    return {
      round: item.round,
      closeStart,
      closeEnd
    };
  });
}

function computeThaiState(now = new Date()) {
  const slots = buildThaiSlots();
  let current = null;
  let upcoming = null;
  for (const slot of slots) {
    if (!current && now >= slot.closeStart && now <= slot.closeEnd) {
      current = slot;
    }
    if (!upcoming && slot.closeStart > now) {
      upcoming = slot;
    }
    if (current && upcoming) break;
  }
  const active = current ?? upcoming;
  if (!active) return null;
  const isClosed = Boolean(current);
  const countdownTarget = current ? current.closeEnd : active.closeStart;
  return {
    status: isClosed ? "closed" : "open",
    countdownTime: countdownTarget.toISOString(),
    slot: active,
    card: {
      id: "th-lottery",
      name: "หวยไทย สลากกินแบ่งรัฐบาล",
      flag: "🇹🇭",
      dateLabel: active.closeStart.toLocaleDateString("th-TH"),
      windowLabel: "14:30 - 20:00",
      isClosed,
      countdownTarget: countdownTarget.toISOString()
    }
  };
}

const laoWeekdayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const laoDays = ["Monday", "Wednesday", "Friday"].map((day) => laoWeekdayMap[day]);

function computeLaoState(now = new Date()) {
  let current = null;
  let upcoming = null;
  for (let offset = -1; offset < 60; offset++) {
    const day = new Date(now);
    day.setDate(now.getDate() + offset);
    if (!laoDays.includes(day.getDay())) continue;
    const closeStart = new Date(day);
    closeStart.setHours(19, 45, 0, 0);
    const closeEnd = new Date(day);
    closeEnd.setHours(21, 30, 0, 0);
    if (!current && now >= closeStart && now <= closeEnd) {
      current = { closeStart, closeEnd };
    }
    if (!upcoming && closeStart > now) {
      upcoming = { closeStart, closeEnd };
    }
    if (current && upcoming) break;
  }
  const active = current ?? upcoming;
  if (!active) return null;
  const isClosed = Boolean(current);
  const countdownTarget = current ? active.closeEnd : active.closeStart;
  return {
    status: isClosed ? "closed" : "open",
    countdownTime: countdownTarget.toISOString(),
    slot: active,
    card: {
      id: "lao-lottery",
      name: "หวยลาว ลาวพัฒนา",
      flag: "🇱🇦",
      dateLabel: active.closeStart.toLocaleDateString("th-TH", { weekday: "long", year: "numeric", month: "short", day: "numeric" }),
      windowLabel: "19:45 - 21:30",
      isClosed,
      countdownTarget: countdownTarget.toISOString()
    }
  };
}

function getNextThaiRound(now = new Date()) {
  for (const item of thaiLotterySchedule.schedule) {
    const closeDate = new Date(`${item.date}T${item.close}:00+07:00`);
    if (closeDate <= now) continue;
    const openDate = new Date(closeDate.getTime());
    openDate.setDate(closeDate.getDate() - 1);
    openDate.setHours(8, 0, 0, 0);
    return {
      id: `th-lottery-${item.round}`,
      name: "หวยไทย สลากกินแบ่งรัฐบาล",
      closeTime: closeDate.toISOString(),
      openTime: openDate.toISOString(),
      flag: "🇹🇭",
      extra: `งวดที่ ${item.round}`
    };
  }
  return null;
}

const laoDayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const laoScheduleDays = ["Monday", "Wednesday", "Friday"].map((day) => laoDayMap[day]);

function getNextLaoRound(now = new Date()) {
  for (let offset = 0; offset < 21; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    if (!laoScheduleDays.includes(candidate.getDay())) continue;
    candidate.setHours(19, 45, 0, 0);
    if (candidate <= now) continue;
    const openDate = new Date(candidate.getTime());
    openDate.setDate(candidate.getDate() - 1);
    openDate.setHours(21, 30, 0, 0);
    return {
      id: "lao-lottery",
      name: "หวยลาว ลาวพัฒนา",
      closeTime: candidate.toISOString(),
      openTime: openDate.toISOString(),
      flag: "🇱🇦",
      extra: candidate.toLocaleDateString("th-TH", { weekday: "long" })
    };
  }
  return null;
}

function TopNav({
  profile,
  summary,
  announcements,
  onToggleMenu,
  isSidebarOpen,
  isCompactNavOpen,
  onToggleCompactNav,
  onLogout,
  lang,
  onToggleLang,
  t
}) {
  const creditAvailable = Number(
    typeof profile?.creditAvailable === "number"
      ? profile.creditAvailable
      : Number(profile?.creditLimit ?? 0) - Number(profile?.creditUsed ?? 0)
  );
  const creditText = creditAvailable.toLocaleString();
  const creditReport = summary?.todayStake ? `${summary.todayStake.toLocaleString()}` : "0";
  const announce = announcements?.[0];
  const userMenuItems = [
    { id: "profile", label: t("nav.account", "โปรไฟล์ & การตั้งค่า"), icon: "👤" },
    { id: "workspace", label: t("nav.members", "จัดการสมาชิก"), icon: "👥" },
    { id: "credit", label: t("nav.credit", "ข้อมูลเครดิต"), icon: "💳" },
    { id: "support", label: t("nav.support", "ศูนย์ช่วยเหลือ"), icon: "🛎️" }
  ];
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    function handleClick(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className={`top-nav ${isCompactNavOpen ? "compact-open" : ""}`}>
      <div className="nav-bar-row">
        <div className="brand-block">
          <h1>{t("brand.title", "ระบบหวย")}</h1>
          <small>{t("brand.subtitle", "ระบบหวยไทย & ต่างประเทศ")}</small>
        </div>
        <div className="nav-action-icons">
          <button
            className="nav-icon-circle nav-collapse-btn"
            type="button"
            onClick={onToggleCompactNav}
            aria-label="ข้อมูลสรุป"
          >
            {isCompactNavOpen ? "−" : "⋯"}
          </button>
          <button
            className="nav-icon-circle menu-toggle"
            type="button"
            onClick={onToggleMenu}
            aria-label={isSidebarOpen ? "ปิดเมนู" : "เปิดเมนู"}
          >
            {isSidebarOpen ? "×" : "☰"}
          </button>
        </div>
      </div>
      <div className={`nav-details ${isCompactNavOpen ? "open" : ""}`}>
        <div className="nav-inline-meta">
       
        </div>
        <div className="nav-right" ref={userMenuRef}>
          <button className="nav-user-toggle" type="button" onClick={() => setUserMenuOpen((prev) => !prev)}>
            <span className="nav-user-avatar">{profile.username?.slice(0, 2).toUpperCase()}</span>
            <span className="nav-user-toggle-caret">{userMenuOpen ? "▲" : "▼"}</span>
          </button>
          <div className={`nav-user-dropdown ${userMenuOpen ? "open" : ""}`}>
            <div className="nav-dropdown-info">
              <strong>{profile.username}</strong>
              <small>{t("common.creditRemain", "เครดิตคงเหลือ")}  {creditText}</small>
              <span className="nav-user-badge">{profile.role ? profile.role : t("common.member", "สมาชิก")}</span>
            </div>
            <ul className="nav-user-menu">
              <li>
                <button type="button" onClick={onToggleLang} className="secondary-btn ghost" style={{ width: "100%" }}>
                  {lang === "th" ? "EN" : "TH"} · {lang === "th" ? "English" : "ไทย"}
                </button>
              </li>
              {userMenuItems.map((item) => (
                <li key={item.id}>
                  <button type="button">
                    <span className="menu-icon">{item.icon}</span>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="nav-dropdown-footer">
              <button className="logout-link" type="button" onClick={onLogout}>
                {t("common.logout", "ออกจากระบบ")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function AnnouncementPopup({ item, onClose }) {
  if (!item) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "rgba(3,4,12,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50
      }}
    >
      <div className="panel" style={{ maxWidth: 420 }}>
        <h3>{item.title}</h3>
        <p>{item.body}</p>
        {item.expiresAt && (
          <p className="badge badge-warning">หมดอายุ: {new Date(item.expiresAt).toLocaleString("th-TH")}</p>
        )}
        <button className="primary-btn" onClick={onClose} style={{ marginTop: 16 }}>
          ปิดหน้าต่าง
        </button>
      </div>
    </div>
  );
}

function PurchaseResultModal({ data, onClose }) {
  if (!data) return null;
  const { status, title, description, numbers = [] } = data;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel purchase-result-modal" onClick={(event) => event.stopPropagation()}>
        <h3>{title}</h3>
        <p className={`purchase-modal-status ${status}`}>{description}</p>
        {numbers.length > 0 ? (
          <ul className="purchase-modal-list">
            {numbers.map((item, index) => (
              <li key={`${item.number}-${index}`}>
                <div>
                  <strong>{item.number}</strong>
                  <small>{payoutOptionMap[item.betType]?.label ?? item.betType}</small>
                </div>
                <span>{Number(item.amount).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="purchase-empty">ไม่มีรายการเลข</p>
        )}
        <button className="primary-btn" type="button" onClick={onClose}>
          ปิดหน้าต่าง
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { t, lang, toggleLang } = useI18n();
  const [session, setSession] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem("huaySession");
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn("cannot parse stored session", err);
      return null;
    }
  });
  const [view, setView] = useState("home");
  const [activeMenuKey, setActiveMenuKey] = useState("home");
  const [backofficeSection, setBackofficeSection] = useState("overview");
  const [payload, setPayload] = useState(initialPayload);
  const [numberRestrictions, setNumberRestrictions] = useState([]);
  const [popupItem, setPopupItem] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth > 960));
  const [compactNavOpen, setCompactNavOpen] = useState(false);
  const [purchaseModal, setPurchaseModal] = useState(null);
  const [purchaseSelection, setPurchaseSelection] = useState({ lotteryId: "", promotionCode: DEFAULT_PROMO_CODE, confirmed: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [supportThreads, setSupportThreads] = useState([]);
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportActiveUser, setSupportActiveUser] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const [adminTransactions, setAdminTransactions] = useState([]);
  const [adminCreditHistory, setAdminCreditHistory] = useState([]);
  const [lotteryRounds, setLotteryRounds] = useState({});

  const profile = session?.profile ?? { username: "guest", role: "agent", creditLimit: 0, creditUsed: 0 };
  const creditLimitValue = Number(profile?.creditLimit ?? 0);
  const creditUsedValue = Number(profile?.creditUsed ?? 0);
  const availableCreditValue = Math.max(0, Number(profile?.creditAvailable ?? creditLimitValue - creditUsedValue));
  const latestProfileRef = useRef(profile);
  const sessionRef = useRef(session);
  const loadDashboardRef = useRef(async () => {});
  const loadDashboard = useCallback(() => loadDashboardRef.current(), []);
  const dashboardLoadingRef = useRef(false);
  useEffect(() => {
    latestProfileRef.current = profile;
  }, [profile]);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const isStaff = profile?.role?.toLowerCase().includes("admin") || profile?.role?.toLowerCase().includes("staff");
  const isSuperAdmin = profile?.username?.toLowerCase() === "superadmin" || profile?.role?.toLowerCase().includes("admin");
  const canPurchase = !isSuperAdmin;
  const purchaseRestrictionMessage = "บัญชี Super Admin ไม่สามารถแทงหวยได้";

  const persistSession = useCallback(
    (nextSession) => {
      setSession(nextSession);
      if (typeof window === "undefined") return;
      if (nextSession) {
        window.localStorage.setItem("huaySession", JSON.stringify(nextSession));
      } else {
        window.localStorage.removeItem("huaySession");
      }
    },
    [setSession]
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = "light";
    // expose super-admin flag to CSS so we can hide certain admin-only modals
    if (isSuperAdmin) {
      document.documentElement.dataset.superAdmin = "true";
    } else {
      document.documentElement.removeAttribute("data-super-admin");
      document.documentElement.dataset.superAdmin = "";
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setSidebarOpen(window.innerWidth > 960);
      if (window.innerWidth > 960) {
        setCompactNavOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const callApi = useCallback(
    async (path, options = {}) => {
      if (!session?.token) {
        throw new Error("ต้องเข้าสู่ระบบก่อน");
      }
      const isFormData = options.body instanceof FormData;
      const headers = {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        "x-session-token": session.token,
        ...(options.headers ?? {})
      };
      const response = await fetch(path, {
        method: options.method || "GET",
        headers,
        body: options.body ?? null
      });
      if (response.status === 401) {
        persistSession(null);
        throw new Error("SESSION_EXPIRED");
      }
      if (response.status === 204) {
        return null;
      }
      if (!response.ok) {
        const msg = await response.text();
        throw new Error(msg || "REQUEST_FAILED");
      }
      return response.json();
    },
    [session, persistSession]
  );

  const syncProfileFromServer = useCallback(async () => {
    try {
      const fresh = await callApi("/api/profile");
      const currentSession = sessionRef.current;
      if (currentSession) {
        persistSession({ ...currentSession, profile: fresh });
      }
      return fresh;
    } catch (err) {
      console.error("refresh profile failed:", err);
      return latestProfileRef.current;
    }
  }, [callApi, persistSession]);

  const reloadNumberRestrictions = useCallback(async () => {
    if (!session?.token) {
      setNumberRestrictions([]);
      return;
    }
    // Admin: ใช้ endpoint รวม, ผู้ใช้ทั่วไป: ใช้ endpoint สาธารณะรายหวย
    if (isStaff) {
      try {
        const rows = await callApi("/api/admin/number-restrictions");
        setNumberRestrictions(rows);
        return;
      } catch (err) {
        console.error("number restriction load failed:", err);
        setNumberRestrictions([]);
        return;
      }
    }
    try {
      const codes = ["th-lottery", "lao-lottery"];
      const results = await Promise.all(
        codes.map(async (code) => {
          try {
            const res = await callApi(`/api/lotteries/${code}/restrictions`).catch(() => []);
            return (Array.isArray(res) ? res : []).map((r) => ({
              ...r,
              lotteryCode: r.lotteryCode || code
            }));
          } catch {
            return [];
          }
        })
      );
      setNumberRestrictions(results.flat());
    } catch (err) {
      console.error("number restriction load failed:", err);
      setNumberRestrictions([]);
    }
  }, [session?.token, isStaff, callApi]);

  const performLoadDashboard = useCallback(async () => {
    if (!session?.token) return;
    if (dashboardLoadingRef.current) return;
    dashboardLoadingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const [
        lotteryRes,
        summaryRes,
        memberRes,
        ledgerRes,
        creditBetweenRes,
        dailyRes,
        incomeRes,
        settingsRes,
        promotionRes,
        txnRes,
        adminTxnRes,
        creditHistoryRes
      ] = await Promise.all([
        callApi("/api/lotteries").catch(() => fallbackLotteries),
        callApi("/api/admin/summary").catch(() => initialPayload.summary),
        callApi("/api/admin/members").catch(() => []),
        callApi("/api/admin/credit-ledger").catch(() => []),
        callApi("/api/admin/credit-between").catch(() => []),
        callApi("/api/admin/daily-summary").catch(() => null),
        callApi("/api/admin/income-report").catch(() => []),
        callApi("/api/admin/settings").catch(() => null),
        callApi("/api/promotions").catch(() => []),
        callApi("/api/wallet/transactions").catch(() => []),
        isStaff ? callApi("/api/admin/transactions").catch(() => []) : Promise.resolve([]),
        isStaff ? callApi("/api/admin/credit-history").catch(() => []) : Promise.resolve([])
      ]);
      setPayload({
        lotteries: lotteryRes,
        summary: summaryRes,
        members: memberRes,
        ledger: ledgerRes,
        creditBetween: creditBetweenRes,
        daily: dailyRes,
        income: incomeRes,
        announcements: summaryRes.announcements ?? [],
        settings: settingsRes,
        results: summaryRes.results ?? defaultResults,
        promotions: promotionRes,
        transactions: txnRes
      });
      // Load per-lottery round mappings (public endpoint)
      try {
        const codes = (lotteryRes || []).map((l) => l.id || l.code).filter(Boolean);
        const roundsMap = {};
        await Promise.all(
          codes.map(async (code) => {
            try {
              const resp = await callApi(`/api/lottery-rounds/${encodeURIComponent(code)}`);
              roundsMap[code] = resp?.rounds ?? [];
            } catch (err) {
              roundsMap[code] = [];
            }
          })
        );
        setLotteryRounds(roundsMap);
      } catch (err) {
        console.error('load lottery rounds failed:', err);
        setLotteryRounds({});
      }
      setAdminTransactions(adminTxnRes || []);
      setAdminCreditHistory(creditHistoryRes || []);
      setPopupItem(summaryRes.announcements?.[0] ?? null);
      await syncProfileFromServer();
      await reloadNumberRestrictions();
    } catch (err) {
      console.error(err);
      setError(err.message || "ไม่สามารถโหลดข้อมูลได้");
      setPayload((prev) => ({
        ...prev,
        lotteries: fallbackLotteries,
        summary: prev.summary ?? {
          activeLotteries: fallbackLotteries.length,
          todayStake: 0,
          creditLimit: profile.creditLimit,
          creditUsed: profile.creditUsed,
          announcements: []
        }
      }));
    } finally {
      setLoading(false);
      dashboardLoadingRef.current = false;
    }
  }, [session?.token, callApi, reloadNumberRestrictions, isStaff, syncProfileFromServer]);
  loadDashboardRef.current = performLoadDashboard;

  useEffect(() => {
    if (session?.token) {
      loadDashboard();
    }
    // Intentionally depend only on session token to avoid repeated calls
  }, [session?.token, loadDashboard]);

  const refreshChat = useCallback(async () => {
    if (!session?.token) {
      setChatMessages([]);
      return;
    }
    setChatLoading(true);
    setChatError("");
    try {
      const rows = await callApi("/api/chat");
      setChatMessages(rows);
    } catch (err) {
      setChatError(err.message || "ไม่สามารถดึงประวัติแชทได้");
    } finally {
      setChatLoading(false);
    }
  }, [session?.token, callApi]);

  useEffect(() => {
    if (view === "contact") {
      refreshChat();
    }
    // Depend on view only to avoid re-running when callback identity changes
  }, [view]);

  const refreshSupportThreads = useCallback(async () => {
    if (!session?.token || !isSuperAdmin) {
      setSupportThreads([]);
      return;
    }
    try {
      const rows = await callApi("/api/admin/chat/threads");
      setSupportThreads(rows);
    } catch (err) {
      console.error("threads failed:", err);
    }
  }, [session?.token, isSuperAdmin, callApi]);

  useEffect(() => {
    if (view === "backoffice" && isSuperAdmin) {
      refreshSupportThreads();
    }
    // Depend on view and isSuperAdmin flag to reduce unnecessary calls
  }, [view, isSuperAdmin]);

  const handleSelectSupportThread = useCallback(
    async (username) => {
      if (!username) return;
      setSupportActiveUser(username);
      setSupportLoading(true);
      try {
        const rows = await callApi(`/api/admin/chat/${encodeURIComponent(username)}`);
        setSupportMessages(rows);
      } catch (err) {
        console.error(err);
      } finally {
        setSupportLoading(false);
      }
    },
    [callApi]
  );

  const handleSupportReply = useCallback(
    async (username, message) => {
      if (!username || !message) return;
      try {
        await callApi(`/api/admin/chat/${encodeURIComponent(username)}`, {
          method: "POST",
          body: JSON.stringify({ message })
        });
        await handleSelectSupportThread(username);
      } catch (err) {
        console.error(err);
      }
    },
    [callApi, handleSelectSupportThread]
  );

  const handleSyncThaiLottery = useCallback(async () => {
    try {
      await callApi("/api/admin/sync/thai-lottery", { method: "POST" });
      alert("ซิงก์ผลหวยไทยล่าสุดสำเร็จ");
      await loadDashboard();
    } catch (err) {
      console.error("sync thai lottery failed:", err);
      alert("ไม่สามารถซิงก์ผลหวยไทยได้");
    }
  }, [callApi, loadDashboard]);

  const handleApproveTransaction = useCallback(
    async (id) => {
      await callApi(`/api/admin/transactions/${id}/approve`, { method: "POST" });
      await loadDashboard();
    },
    [callApi, loadDashboard]
  );

  const handleRejectTransaction = useCallback(
    async (id) => {
      await callApi(`/api/admin/transactions/${id}/reject`, { method: "POST" });
      await loadDashboard();
    },
    [callApi, loadDashboard]
  );

  const handleConfirmTicket = useCallback(
    async (ticketId, payoutRate, items) => {
      const body = {};
      if (payoutRate != null) body.payoutRate = payoutRate;
      if (Array.isArray(items) && items.length) {
        body.items = items;
      }
      await callApi(`/api/admin/tickets/${encodeURIComponent(ticketId)}/confirm-win`, {
        method: "POST",
        body: JSON.stringify(body)
      });
      await loadDashboard();
    },
    [callApi, loadDashboard]
  );

  const handleRejectTicket = useCallback(
    async (ticketId, items) => {
      const body = {};
      if (Array.isArray(items) && items.length) {
        body.items = items;
      }
      await callApi(`/api/admin/tickets/${encodeURIComponent(ticketId)}/confirm-lose`, {
        method: "POST",
        body: JSON.stringify(body)
      });
      await loadDashboard();
    },
    [callApi, loadDashboard]
  );

  const handleCancelTicket = useCallback(
    async (ticketId) => {
      await callApi(`/api/tickets/${encodeURIComponent(ticketId)}/cancel`, {
        method: "POST"
      });
      await loadDashboard();
    },
    [callApi, loadDashboard]
  );

  const handleScanTickets = useCallback(
    async (lotteryCode, drawDate) => {
      const encodedLottery = encodeURIComponent(lotteryCode);
      const encodedDate = encodeURIComponent(drawDate);
      const result = await callApi(
        `/api/admin/lottery-results/${encodedLottery}/${encodedDate}/evaluate`,
        { method: "POST" }
      );
      await loadDashboard();
      return result;
    },
    [callApi, loadDashboard]
  );

  const handleFetchRoundSummary = useCallback(
    async (lotteryCode, startDate, endDate) => {
      const params = new URLSearchParams();
      if (lotteryCode) {
        params.set("lotteryCode", lotteryCode);
      }
      if (startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      } else if (startDate) {
        params.set("drawDate", startDate);
      }
      return callApi(`/api/admin/round-number-summary?${params.toString()}`);
    },
    [callApi]
  );

  const handleFetchPayoutRates = useCallback(
    async (lotteryCode) => {
      const encodedLottery = encodeURIComponent(lotteryCode);
      return callApi(`/api/admin/payout-rates/${encodedLottery}`);
    },
    [callApi]
  );

  const handleToggleLotteryStatus = useCallback(
    async (lotteryId, nextStatus) => {
      const target = (payload.lotteries || []).find((l) => l.id === lotteryId || l.code === lotteryId);
      const status = nextStatus || (target?.status === "closed" ? "open" : "closed");
      const updated = await callApi(`/api/admin/lotteries/${encodeURIComponent(lotteryId)}/status`, {
        method: "POST",
        body: JSON.stringify({ status })
      });
      // update local state without reloading everything
      setPayload((prev) => {
        const nextLotteries = (prev.lotteries || []).map((lot) =>
          lot.id === lotteryId || lot.code === lotteryId
            ? { ...lot, status: updated?.status ?? status }
            : lot
        );
        const activeCount = nextLotteries.filter((l) => l.status !== "closed").length;
        return {
          ...prev,
          lotteries: nextLotteries,
          summary: { ...(prev.summary || {}), activeLotteries: activeCount }
        };
      });
    },
    [callApi, payload.lotteries]
  );

  const handleSendChatMessage = useCallback(
    async (message) => {
      if (!message?.trim()) return;
      setChatLoading(true);
      try {
        await callApi("/api/chat", {
          method: "POST",
          body: JSON.stringify({ message: message.trim() })
        });
        await refreshChat();
      } catch (err) {
        setChatError(err.message || "ส่งข้อความไม่สำเร็จ");
      } finally {
        setChatLoading(false);
      }
    },
    [callApi, refreshChat]
  );

  const handleLogin = useCallback(
    async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const username = form.get("username");
      const password = form.get("password");
      if (!username || !password) {
        setLoginError("กรุณากรอกข้อมูลให้ครบ");
        return;
      }
      setLoginLoading(true);
      setLoginError("");
      try {
        const passwordHash = await hashPassword(password);
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password: passwordHash })
        });
        if (!response.ok) {
          const msg = await response.text();
          throw new Error(msg || "ไม่สามารถเข้าสู่ระบบได้");
        }
        const data = await response.json();
        persistSession(data);
        await loadDashboard();
      } catch (err) {
        console.error(err);
        setLoginError(err.message || "ไม่สามารถเข้าสู่ระบบได้");
      } finally {
        setLoginLoading(false);
      }
    },
    [persistSession, loadDashboard]
  );

  const resetPurchaseSelection = useCallback(() => {
    setPurchaseSelection({ lotteryId: "", promotionCode: DEFAULT_PROMO_CODE, confirmed: false });
  }, []);

  const updatePurchaseSelection = useCallback((patch) => {
    setPurchaseSelection((prev) => ({
      ...prev,
      ...patch,
      promotionCode: patch.promotionCode ?? prev.promotionCode ?? DEFAULT_PROMO_CODE,
      confirmed: false
    }));
  }, []);

  const confirmPurchaseSelection = useCallback(({ lotteryId, promotionCode }) => {
    if (!lotteryId) return;
    const code = promotionCode || DEFAULT_PROMO_CODE;
    setPurchaseSelection({ lotteryId, promotionCode: code, confirmed: true });
  }, []);

  const handleLogout = useCallback(() => {
    persistSession(null);
    setView("home");
    setActiveMenuKey("home");
    setBackofficeSection("overview");
    setPayload(initialPayload);
    setChatMessages([]);
    resetPurchaseSelection();
  }, [persistSession, resetPurchaseSelection]);

  const handleNavigate = useCallback(
    (item, { closeSidebar = true } = {}) => {
      if (!item) return;
      if (view === "purchase" && item.view !== "purchase") {
        setPurchaseSelection((prev) => ({ ...prev, confirmed: false }));
      }
      setView(item.view || "home");
      setActiveMenuKey(item.id || item.view);
      if (item.view === "backoffice") {
        setBackofficeSection(item.section || "overview");
      }
      if (closeSidebar && typeof window !== "undefined" && window.innerWidth < 960) {
        setSidebarOpen(false);
      }
    },
    [view]
  );

  const handleSelectLottery = useCallback(
    (lotteryId) => {
      setPurchaseSelection((prev) => ({
        lotteryId,
        promotionCode: prev.promotionCode || DEFAULT_PROMO_CODE,
        confirmed: true
      }));
      const purchaseItem = { id: "purchase", view: "purchase" };
      handleNavigate(purchaseItem, { closeSidebar: false });
    },
    [handleNavigate]
  );

  const navGroups = useMemo(() => {
    const filterItems = (items) =>
      items.filter((item) => {
        if (isSuperAdmin && item.hideForSuperAdmin) return false;
        if (item.requiresSuperAdmin && !isSuperAdmin) return false;
        return true;
      });
    if (isStaff) {
      return staffNavGroups.map((group) => ({
        ...group,
        items: filterItems(group.items)
      }));
    }
    return [{ id: "user-flow", label: "เมนูหลัก", items: filterItems(userFlowMenu) }];
  }, [isStaff, isSuperAdmin]);
  const flatNavItems = useMemo(() => navGroups.flatMap((group) => group.items), [navGroups]);
  const homeShortcuts = useMemo(
    () =>
      flatNavItems.filter(
        (item) => item.homeShortcut && !(isSuperAdmin && item.hideForSuperAdmin)
      ),
    [flatNavItems, isSuperAdmin]
  );

  const resolvedLotteries = payload.lotteries.length ? payload.lotteries : fallbackLotteries;
  const decoratedLotteries = useMemo(() => {
    const now = new Date();
    const thaiState = computeThaiState(now);
    const laoState = computeLaoState(now);
    return resolvedLotteries.map((item) => {
      const scheduleState =
        item.id === "th-lottery"
          ? thaiState
          : item.id === "lao-lottery"
          ? laoState
          : null;
      const base = { ...item };
      if (!base.flag && lotteryIconMap[item.id]) {
        base.flag = lotteryIconMap[item.id];
      }
       // derive display open/close for Thai/Lao using schedule slots
      let displayOpenTime = item.openTime;
      let displayCloseTime = item.closeTime;
      if (item.id === "th-lottery" && scheduleState?.slot) {
        const drawDate = new Date(scheduleState.slot.closeStart);
        const close = new Date(drawDate);
        close.setHours(14, 30, 0, 0);
        const reopen = new Date(drawDate);
        reopen.setHours(20, 0, 0, 0);
        displayCloseTime = close.toISOString();
        displayOpenTime = reopen.toISOString();
      }
      if (item.id === "lao-lottery" && scheduleState?.slot) {
        const drawDate = new Date(scheduleState.slot.closeStart);
        const close = new Date(drawDate);
        close.setHours(19, 45, 0, 0);
        const reopen = new Date(drawDate);
        reopen.setHours(21, 30, 0, 0);
        displayCloseTime = close.toISOString();
        displayOpenTime = reopen.toISOString();
      }
      const scheduleStatus = scheduleState?.status;
      const genericState = resolveOpenCloseStatus({ ...item, openTime: displayOpenTime, closeTime: displayCloseTime }, now);
      // If admin marked closed, stay closed; otherwiseใช้สถานะจาก schedule ถ้ามี ไม่งั้นใช้เวลาปิด/เปิดของรอบ
      const status = item.status === "closed" ? "closed" : scheduleStatus ?? genericState?.status ?? "open";
      const closeTime = scheduleState?.countdownTime ?? genericState?.countdownTime ?? displayCloseTime;
      const nextOpenTime = genericState?.nextOpen ?? displayOpenTime;
      const nextCloseTime = genericState?.nextClose ?? closeTime;
      return { ...base, status, closeTime: nextCloseTime, openTime: nextOpenTime };
    });
  }, [resolvedLotteries]);
  const purchasePromotions = useMemo(
    () => payload.promotions ?? [],
    [payload.promotions]
  );

  const latestResults = payload.results || defaultResults;
  const thaiResult = latestResults["th-lottery"] ?? defaultResults["th-lottery"];
  const laoResult = latestResults["lao-lottery"] ?? defaultResults["lao-lottery"];

  const handleDepositRequest = useCallback(
    async (amount, slipFile, note) => {
      let body;
      if (slipFile) {
        body = new FormData();
        body.append("amount", String(amount));
        body.append("slip", slipFile);
        if (note) {
          body.append("note", note);
        }
      } else {
        body = JSON.stringify({ amount, note });
      }
      await callApi("/api/wallet/deposit", {
        method: "POST",
        body
      });
      await loadDashboard();
    },
    [callApi, loadDashboard]
  );

  const handleWithdrawRequest = useCallback(
    async (amount, note) => {
      await callApi("/api/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify({ amount, note })
      });
      await loadDashboard();
    },
    [callApi, loadDashboard]
  );

  const handlePurchaseSubmit = useCallback(
    async (purchasePayload) => {
      if (!canPurchase) {
        setPurchaseModal({
          status: "error",
          title: "ไม่สามารถแทงหวยได้",
          description: purchaseRestrictionMessage,
          numbers: purchasePayload.meta?.items ?? []
        });
        throw new Error("restricted");
      }
      const latestProfile = await syncProfileFromServer();
      const creditLimit = Number(latestProfile?.creditLimit ?? profile.creditLimit ?? 0);
      const creditUsed = Number(latestProfile?.creditUsed ?? profile.creditUsed ?? 0);
      const availableCredit = Number(latestProfile?.creditAvailable ?? creditLimit - creditUsed);
      const requiredAmount = Number(purchasePayload.meta?.netAmount ?? purchasePayload.amount ?? 0);
      if (requiredAmount > availableCredit) {
        setPurchaseModal({
          status: "error",
          title: "เครดิตไม่เพียงพอ",
          description: `ยอดที่ต้องใช้ ${requiredAmount.toLocaleString()}  แต่เครดิตคงเหลือ ${availableCredit.toLocaleString()} `,
          numbers: purchasePayload.meta?.items ?? []
        });
        throw new Error("INSUFFICIENT_CREDIT");
      }
      try {
        const ticket = await callApi("/api/purchases", {
          method: "POST",
          body: JSON.stringify(purchasePayload)
        });
        const snapshot = ticket?.profile ?? ticket?.creditSnapshot;
        if (snapshot) {
          console.debug("purchase response ticket:", ticket);
          console.debug("purchase snapshot:", snapshot);
          const computedCreditLimit = Number(snapshot.creditLimit ?? profile.creditLimit ?? 0);
          const computedCreditUsed = Number(snapshot.creditUsed ?? profile.creditUsed ?? 0);
          const computedCreditAvailable = Number(
            snapshot.creditAvailable ?? computedCreditLimit - computedCreditUsed
          );
          const nextProfile = {
            ...(sessionRef.current?.profile ?? profile),
            creditLimit: computedCreditLimit,
            creditUsed: computedCreditUsed,
            creditAvailable: computedCreditAvailable
          };
          const currentSession = sessionRef.current;
          if (currentSession) {
            persistSession({ ...currentSession, profile: nextProfile });
          }
        }
        await syncProfileFromServer();
        setPurchaseModal({
          status: "success",
          title: "ส่งโพยสำเร็จ",
          description: ticket?.id ? `บันทึกโพย #${ticket.id} สำเร็จ` : "ส่งโพยเรียบร้อย",
          numbers: purchasePayload.meta?.items ?? []
        });
        await loadDashboard();
        return { success: true, ticket };
      } catch (err) {
        setPurchaseModal({
          status: "error",
          title: "ส่งโพยไม่สำเร็จ",
          description: err.message || "เกิดข้อผิดพลาดในการส่งโพย",
          numbers: purchasePayload.meta?.items ?? []
        });
        throw err;
      }
    },
    [
      canPurchase,
      purchaseRestrictionMessage,
      callApi,
      loadDashboard,
      profile.creditLimit,
      profile.creditUsed,
      profile.creditAvailable,
      syncProfileFromServer,
      persistSession
    ]
  );

  const handleSaveSettings = useCallback(
    async (values) => {
      try {
        const saved = await callApi("/api/admin/settings", {
          method: "POST",
          body: JSON.stringify(values)
        });
        setPayload((prev) => ({ ...prev, settings: saved }));
        alert("บันทึกการตั้งค่าสำเร็จ");
      } catch (err) {
        console.error(err);
        alert("บันทึกการตั้งค่าไม่สำเร็จ");
      }
    },
    [callApi]
  );

  const handleCreateMember = useCallback(
    async (values) => {
      const body = {
        username: values.username,
        password: values.password,
        role: values.role,
        creditLimit: Number(values.creditLimit) || 0,
        fullName: values.fullName || null,
        bankName: values.bankName || null,
        bankAccount: values.bankAccount || null,
        bsb: values.bsb || null,
        phone: values.phone || null
      };
      await callApi("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(body)
      });
      await loadDashboard();
    },
    [callApi, loadDashboard]
  );

  const handleCreateLottery = useCallback(
    async (values) => {
      const today = new Date().toISOString().slice(0, 10);
      const toDateTime = (value) => {
        if (!value) return "";
        if (!value.includes("T")) {
          return `${today}T${value || "00:00"}:00+07:00`;
        }
        if (/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
          return value;
        }
        return `${value}+07:00`;
      };
      const payload = {
        code: values.code,
        name: values.name,
        kind: values.kind || "international",
        group: values.group || null,
        description: values.description || null,
        status: values.status || "open",
        openTime: toDateTime(values.openTime),
        closeTime: toDateTime(values.closeTime)
      };
      await callApi("/api/admin/lotteries", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      await loadDashboard();
    },
    [callApi, loadDashboard]
  );

  const handleUpdateMemberCredit = useCallback(
    async (userId, values) => {
      await callApi(`/api/admin/users/${userId}/credit`, {
        method: "PATCH",
        body: JSON.stringify(values)
      });
      await loadDashboard();
    },
    [callApi, loadDashboard]
  );

  const handleCreateNumberRestriction = useCallback(
    async (values) => {
      await callApi("/api/admin/number-restrictions", {
        method: "POST",
        body: JSON.stringify(values)
      });
      await reloadNumberRestrictions();
    },
    [callApi, reloadNumberRestrictions]
  );

  const handleCreateRestrictionsBatch = useCallback(
    async (items) => {
      if (!Array.isArray(items) || !items.length) return [];
      const results = [];
      for (const item of items) {
        try {
          await callApi("/api/admin/number-restrictions", {
            method: "POST",
            body: JSON.stringify(item)
          });
          results.push({ ...item, ok: true });
        } catch (err) {
          results.push({ ...item, ok: false, error: err?.message || "FAILED" });
        }
      }
      await reloadNumberRestrictions();
      return results;
    },
    [callApi, reloadNumberRestrictions]
  );

  const handleDeleteNumberRestriction = useCallback(
    async (id) => {
      await callApi(`/api/admin/number-restrictions/${id}`, {
        method: "DELETE"
      });
      await reloadNumberRestrictions();
    },
    [callApi, reloadNumberRestrictions]
  );

  const handleSaveLotteryResult = useCallback(
    async (values) => {
      const saved = await callApi("/api/admin/lottery-results", {
        method: "POST",
        body: JSON.stringify(values)
      });
      setPayload((prev) => ({
        ...prev,
        results: { ...(prev.results ?? {}), [saved.lotteryCode]: saved }
      }));
      return saved;
    },
    [callApi]
  );

  const handleAccountUpdate = useCallback(
    async (values) => {
      await callApi("/api/profile", {
        method: "PUT",
        body: JSON.stringify(values)
      });
      await loadDashboard();
    },
    [callApi, loadDashboard]
  );

  const handlePasswordChange = useCallback(
    async (password) => {
      await callApi("/api/profile/password", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      alert("เปลี่ยนรหัสผ่านสำเร็จ");
    },
    [callApi]
  );

  const renderMainContent = () => {
    switch (view) {
      case "home":
        return (
          <HomeHub
            profile={profile}
            summary={payload.summary}
            announcements={payload.announcements}
            shortcuts={homeShortcuts}
            onSelectShortcut={(item) => handleNavigate(item, { closeSidebar: false })}
            thaiResult={thaiResult}
            laoResult={laoResult}
            latestResults={latestResults}
          />
        );
      case "cash-deposit":
        return (
          <DepositPanel
            onSubmit={handleDepositRequest}
            transactions={payload.transactions}
            depositNotice={payload.settings?.depositNotice}
            depositLineUrl={payload.settings?.depositLineUrl}
          />
        );
      case "cash-withdraw":
        return <WithdrawPanel onSubmit={handleWithdrawRequest} profile={profile} summary={payload.summary} />;
      case "credit-info":
        return (
          <CreditInfoPanel
            profile={profile}
            summary={payload.summary}
            daily={payload.daily}
            ledger={payload.ledger}
            transactions={payload.transactions}
          />
        );
      case "tickets":
        return (
          <TicketHistoryPanel
            ledger={payload.ledger}
            profile={profile}
            lotteries={decoratedLotteries}
            lotteryRounds={lotteryRounds}
            numberRestrictions={numberRestrictions}
            onCancelTicket={handleCancelTicket}
          />
        );
      case "account-settings":
        return <AccountSettingsPanel profile={profile} onSaveProfile={handleAccountUpdate} onChangePassword={handlePasswordChange} />;
      case "news":
        return <NewsPanel announcements={payload.announcements} />;
      case "contact":
        return (
          <ContactAdminPanel settings={payload.settings} messages={chatMessages} loading={chatLoading} error={chatError} onSend={handleSendChatMessage} />
        );
      case "lotteries":
        return (
          <div>
            <h2>หวยทั้งหมด</h2>
            <div className="card-grid">
              {decoratedLotteries.map((lottery) => (
                <div className="lottery-card" key={lottery.id}>
                  <div className="lottery-icon">{lotteryIconMap[lottery.id] || "🎯"}</div>
                  <h3>{lottery.name}</h3>
                  <span className={`status-pill ${lottery.status === "open" ? "status-open" : "status-closed"}`}>
                    {lottery.status === "open" ? "เปิดรับแทง" : "ปิดรอรอบ"}
                  </span>
                  <p style={{ flex: 1 }}>{lottery.description}</p>
                  <div className="lottery-times">
                    <small>เปิด: {formatDateTime(lottery.openTime)}</small>
                    <small>ปิด: {formatDateTime(lottery.closeTime)}</small>
                  </div>
                  <button className="select-lottery-btn" type="button" onClick={() => handleSelectLottery(lottery.id)}>
                    เลือกแทงรอบนี้
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      case "purchase": {
        if (isSuperAdmin) {
          return (
            <div className="purchase-guard">
              <div className="panel purchase-guard-panel">
                <h2>บัญชี Super Admin</h2>
                <p>บัญชีระดับ Super Admin ใช้สำหรับจัดการระบบและไม่สามารถแทงหวยได้</p>
                <button type="button" className="primary-btn" onClick={() => setView("home")}>
                  กลับหน้าหลัก
                </button>
              </div>
            </div>
          );
        }
        const selectionReady =
          Boolean(purchaseSelection.confirmed) &&
          Boolean(purchaseSelection.lotteryId);
        const lockedPromotionCode = purchasePromotions.some(
          (promo) => promo.code === purchaseSelection.promotionCode
        )
          ? purchaseSelection.promotionCode
          : purchasePromotions.length
            ? null
            : purchaseSelection.promotionCode || DEFAULT_PROMO_CODE;
        if (!selectionReady) {
          return (
            <PurchaseSelector
              lotteries={decoratedLotteries}
              promotions={purchasePromotions}
              selection={purchaseSelection}
              onSelectionChange={updatePurchaseSelection}
              onConfirm={({ lotteryId, promotionCode }) =>
                confirmPurchaseSelection({ lotteryId, promotionCode })
              }
            />
          );
        }
        return (
          <PurchaseForm
            lotteries={decoratedLotteries}
            initialLotteryId={purchaseSelection.lotteryId}
            lockedLotteryId={purchaseSelection.lotteryId}
            lockedPromotionCode={lockedPromotionCode}
            promotions={purchasePromotions}
            onSubmit={handlePurchaseSubmit}
            onChangeSelection={resetPurchaseSelection}
            availableCredit={availableCreditValue}
            onOpenDeposit={() => handleNavigate({ id: 'cash-deposit', view: 'cash-deposit' }, { closeSidebar: false })}
          />
        );
      }
      case "backoffice":
        return (
          <BackOfficePanel
            summary={payload.summary}
            members={payload.members}
            ledger={payload.ledger}
            creditBetween={payload.creditBetween}
            daily={payload.daily}
            income={payload.income}
            settings={payload.settings}
            lotteries={decoratedLotteries}
            results={payload.results}
            announcements={payload.announcements}
            onSaveSettings={handleSaveSettings}
            onCreateUser={handleCreateMember}
            onUpdateCredit={handleUpdateMemberCredit}
            onRefresh={loadDashboard}
            canManageUsers={isSuperAdmin}
            activeSection={backofficeSection}
            numberRestrictions={numberRestrictions}
            onCreateRestriction={handleCreateNumberRestriction}
            onCreateRestrictionsBatch={handleCreateRestrictionsBatch}
            onDeleteRestriction={handleDeleteNumberRestriction}
            onSaveResult={handleSaveLotteryResult}
            onSyncThaiLottery={handleSyncThaiLottery}
            supportThreads={supportThreads}
            supportMessages={supportMessages}
            supportActiveUser={supportActiveUser}
            supportLoading={supportLoading}
            onSelectSupportThread={handleSelectSupportThread}
            onReplySupport={handleSupportReply}
            adminTransactions={adminTransactions}
            creditHistory={adminCreditHistory}
            onApproveTransaction={handleApproveTransaction}
            onRejectTransaction={handleRejectTransaction}
            onToggleLotteryStatus={handleToggleLotteryStatus}
            onCreateLottery={handleCreateLottery}
            onConfirmTicket={handleConfirmTicket}
            onRejectTicket={handleRejectTicket}
            onScanTickets={handleScanTickets}
            onFetchRoundSummary={handleFetchRoundSummary}
            onFetchPayoutRates={handleFetchPayoutRates}
          />
        );
      default:
        return null;
    }
  };

  const navList = (
    <>
      {navGroups.map((group) => (
        <div className="menu-group" key={group.id}>
          <h2>{group.label}</h2>
          {group.items.map((item) => (
            <button key={item.id} className={activeMenuKey === item.id ? "active" : ""} type="button" onClick={() => handleNavigate(item)}>
              <span className="menu-icon">{item.icon}</span>
              {t(item.labelKey || item.label, item.label)}
            </button>
          ))}
        </div>
      ))}
    </>
  );

  useEffect(() => {
    if (!session) {
      document.body.classList.add("login-mode");
    } else {
      document.body.classList.remove("login-mode");
    }
    return () => document.body.classList.remove("login-mode");
  }, [session]);

  // periodic refresh to reflect admin actions (e.g. ticket status/payout updates)
  useEffect(() => {
    if (!session?.token) return () => {};
    const id = setInterval(() => {
      loadDashboard().catch(() => {});
    }, 200000);
    return () => clearInterval(id);
  }, [session?.token, loadDashboard]);

  if (!session) {
    return (
      <div className="login-wrapper">
        <div className="login-panel">
          <div className="login-hero">
            <h1>{t("brand.subtitle", "ระบบหวยไทย & ต่างประเทศ")}</h1>
            <p>ศูนย์กลางแพลตฟอร์มหวยสำหรับเอเยนต์ พร้อมระบบหลังบ้านครบวงจร</p>
          </div>
          <div className="login-form">
            <h2>{t("login.title", "เข้าสู่ระบบตัวแทน")}</h2>
            {loginError && <p className="badge badge-warning">{loginError}</p>}
            <form onSubmit={handleLogin}>
              <div className="field">
                <label>{t("login.username", "Username")}</label>
                <input name="username" placeholder="agentmaster" autoComplete="username" />
              </div>
              <div className="field">
                <label>{t("login.password", "Password")}</label>
                <input name="password" type="password" placeholder="••••••••" autoComplete="current-password" />
              </div>
              <button className="primary-btn" type="submit" disabled={loginLoading}>
                {loginLoading ? "กำลังเข้าสู่ระบบ..." : t("login.submit", "เข้าสู่ระบบ")}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {!isSuperAdmin && <AnnouncementPopup item={popupItem} onClose={() => setPopupItem(null)} />}
      <PurchaseResultModal data={purchaseModal} onClose={() => setPurchaseModal(null)} />
      <TopNav
        profile={profile}
        summary={payload.summary}
        announcements={payload.announcements}
        onToggleMenu={() => setSidebarOpen((prev) => !prev)}
        isSidebarOpen={sidebarOpen}
        isCompactNavOpen={compactNavOpen}
        onToggleCompactNav={() => setCompactNavOpen((prev) => !prev)}
        onLogout={handleLogout}
        lang={lang}
        onToggleLang={toggleLang}
        t={t}
      />
      <div className="app-shell">
        <div className={`sidebar-backdrop ${sidebarOpen ? "active" : ""}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>{navList}</aside>
        <main className="content">
          {loading && <p className="text-muted">กำลังโหลดข้อมูล...</p>}
          {error && <p className="text-error">{error}</p>}
          {renderMainContent()}
        </main>
      </div>
    </>
  );
}
