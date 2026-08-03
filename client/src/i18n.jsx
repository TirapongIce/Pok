import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

const resources = {
  th: {
    "brand.title": "ระบบหวย",
    "brand.subtitle": "ระบบหวยไทย & ต่างประเทศ",
    "nav.home": "หน้าหลัก",
    "nav.deposit": "ฝาก-เครดิต",
    "nav.withdraw": "ถอน-เครดิต",
    "nav.credit": "ข้อมูลเครดิต",
    "nav.purchase": "แทงหวย",
    "nav.tickets": "รายการโพย",
    "nav.account": "ตั้งค่าบัญชี",
    "nav.news": "ข่าว-ประชาสัมพันธ์",
    "nav.contact": "ติดต่อแอดมิน",
    "nav.lotteries": "รายการหวย",
    "nav.member.create": "เพิ่มสมาชิกใหม่",
    "nav.history": "โพยย้อนหลัง",
    "nav.banking": "บัญชีธนาคาร",
    "nav.dashboard": "แดชบอร์ดหลังบ้าน",
    "nav.members": "สมาชิก",
    "nav.agents": "Agent",
    "nav.credit.topup": "เติมเครดิต",
    "nav.lottery.control": "เปิด-ปิดระบบหวย",
    "nav.lottery.results": "ประกาศผลรางวัล",
    "nav.restrictions": "เลขอั้น",
    "nav.announcements": "ข่าว-ประชาสัมพันธ์",
    "nav.support": "ศูนย์ช่วยเหลือ",
    "nav.approvals": "อนุมัติคำขอ",
    "common.logout": "ออกจากระบบ",
    "common.creditRemain": "เครดิตคงเหลือ",
    "common.member": "สมาชิก",
    "common.totalStake": "ยอดแทง",
    "common.result": "ผลแพ้/ชนะ",
    "common.rate": "เรทจ่าย",
    "common.viewDetails": "รายละเอียด",
    "common.language": "ภาษา",
    "login.title": "เข้าสู่ระบบตัวแทน",
    "login.username": "Username",
    "login.password": "Password",
    "login.submit": "เข้าสู่ระบบ",
    "tickets.latest": "รายการโพยล่าสุด"
  },
  en: {
    "brand.title": "ระบบหวย",
    "brand.subtitle": "Thai & International Lottery Platform",
    "nav.home": "Home",
    "nav.deposit": "Deposit",
    "nav.withdraw": "Withdraw",
    "nav.credit": "Credit Info",
    "nav.purchase": "Buy Tickets",
    "nav.tickets": "Tickets",
    "nav.account": "Account Settings",
    "nav.news": "News",
    "nav.contact": "Contact Admin",
    "nav.lotteries": "Lotteries",
    "nav.member.create": "Create Member",
    "nav.history": "Ticket History",
    "nav.banking": "Bank Accounts",
    "nav.dashboard": "Backoffice Dashboard",
    "nav.members": "Members",
    "nav.agents": "Agent",
    "nav.credit.topup": "Top-up Credit",
    "nav.lottery.control": "Lottery Control",
    "nav.lottery.results": "Results",
    "nav.restrictions": "Number Limits",
    "nav.announcements": "Announcements",
    "nav.support": "Support Center",
    "nav.approvals": "Approvals",
    "common.logout": "Logout",
    "common.creditRemain": "Credit Available",
    "common.member": "Member",
    "common.totalStake": "Total Stake",
    "common.result": "Win/Loss",
    "common.rate": "Payout Rate",
    "common.viewDetails": "Details",
    "common.language": "Language",
    "login.title": "Agent Login",
    "login.username": "Username",
    "login.password": "Password",
    "login.submit": "Sign in",
    "tickets.latest": "Latest Tickets"
  }
};

const I18nContext = createContext({
  lang: "th",
  t: (key, fallback) => fallback || key,
  setLang: () => {},
  toggleLang: () => {}
});

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem("lang") || "th");

  useEffect(() => {
    localStorage.setItem("lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const toggleLang = useCallback(() => {
    setLang((prev) => (prev === "th" ? "en" : "th"));
  }, []);

  const t = useCallback(
    (key, fallback, vars = {}) => {
      const text = resources[lang]?.[key] ?? fallback ?? key;
      return Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), text);
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, toggleLang, t }), [lang, toggleLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
