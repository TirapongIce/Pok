import { useEffect, useMemo, useState, useCallback } from "react";
import NewsPanel from "./NewsPanel";
import AdminLotteryRoundsPanel from "./AdminLotteryRoundsPanel";
import { payoutOptionMap } from "../constants/purchaseOptions";
import { formatBetNumbers, formatDrawDateLabel } from "../utils/lotteryHelpers";
import { defaultResults } from "../constants/defaults";

const hasResultNumbers = (entry) => {
  if (!entry) return false;
  if (entry.firstPrize || entry.twoDigits || entry.threeDigits) return true;
  if (Array.isArray(entry.frontThree) && entry.frontThree.some(Boolean)) return true;
  if (Array.isArray(entry.backThree) && entry.backThree.some(Boolean)) return true;
  if (Array.isArray(entry.nearFirst) && entry.nearFirst.some(Boolean)) return true;
  if (Array.isArray(entry.extra) && entry.extra.some(Boolean)) return true;
  if (entry.extra && typeof entry.extra === "object") {
    return Object.values(entry.extra).some(Boolean);
  }
  return false;
};

export default function BackOfficePanel({
  summary,
  members,
  ledger,
  creditBetween,
  daily,
  income,
  settings,
  lotteries,
  results,
  announcements,
  onSaveSettings,
  onCreateUser,
  onUpdateCredit,
  onRefresh,
  canManageUsers,
  activeSection,
  numberRestrictions = [],
  onCreateRestriction,
  onDeleteRestriction,
  onSaveResult,
  supportThreads = [],
  supportMessages = [],
  supportActiveUser = "",
  supportLoading = false,
  onSelectSupportThread,
  onReplySupport,
  adminTransactions = [],
  creditHistory = [],
  onApproveTransaction,
  onRejectTransaction,
  onToggleLotteryStatus,
  onSyncThaiLottery,
  onCreateLottery,
  onConfirmTicket,
  onRejectTicket,
  onScanTickets,
  onFetchRoundSummary,
  onFetchPayoutRates,
  onCreateRestrictionsBatch
}) {
  const initialUserForm = {
    username: "",
    password: "",
    role: "agent",
    fullName: "",
    bankName: "",
    bankAccount: "",
    bsb: "",
    phone: "",
    creditLimit: 10000
  };
  const [userForm, setUserForm] = useState(initialUserForm);
  const [creditForm, setCreditForm] = useState({
    userId: "",
    topupAmount: ""
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [updatingCredit, setUpdatingCredit] = useState(false);
  const [bankAccounts, setBankAccounts] = useState(
    settings?.bankAccounts ?? []
  );
  const [newBankAccount, setNewBankAccount] = useState({
    bank: "",
    account: "",
  });
  const [newRestriction, setNewRestriction] = useState({
    lotteryCode: "th-lottery",
    betType: "three-top",
    number: "",
    payoutRate: "",
    maxAmount: "",
    discountPercent: "",
    scope: "",
    note: "",
  });
  const buildDefaultLotteryTimes = () => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      openTime: `${today}T01:00`,
      closeTime: `${today}T18:00`
    };
  };
  const [newLottery, setNewLottery] = useState({
    code: "",
    name: "",
    kind: "international",
    group: "",
    ...buildDefaultLotteryTimes(),
    status: "open",
    description: ""
  });
  const [savingRestriction, setSavingRestriction] = useState(false);
  const [pageLedger, setPageLedger] = useState(1);
  const [pageApprovals, setPageApprovals] = useState(1);
  const [pageRestrictions, setPageRestrictions] = useState(1);
  const [pageMembers, setPageMembers] = useState(1);
  const [searchLedger, setSearchLedger] = useState("");
  const [searchMembers, setSearchMembers] = useState("");
  const [searchApprovals, setSearchApprovals] = useState("");
  const [searchRestrictions, setSearchRestrictions] = useState("");
  const [searchCreditHistory, setSearchCreditHistory] = useState("");
  const [pageCreditHistory, setPageCreditHistory] = useState(1);
  const [ticketActions, setTicketActions] = useState({});
  const [selectedRows, setSelectedRows] = useState({});
  const [verifyLotteryFilter, setVerifyLotteryFilter] = useState("all");
  const resultMap = useMemo(() => {
    if (results && Object.keys(results).length) return results;
    return defaultResults;
  }, [results]);
  const [scanLotteryCode, setScanLotteryCode] = useState("th-lottery");
  const [scanDrawDate, setScanDrawDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [roundSummary, setRoundSummary] = useState(null);
  const [roundSummaryLoading, setRoundSummaryLoading] = useState(false);
  const [roundSummaryError, setRoundSummaryError] = useState("");
  const [summaryStartDate, setSummaryStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summaryEndDate, setSummaryEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summaryFilter, setSummaryFilter] = useState("");
  const [summarySortKey, setSummarySortKey] = useState("totalAmount");
  const [summarySortDir, setSummarySortDir] = useState("desc");
  const [payoutRatesByLottery, setPayoutRatesByLottery] = useState({});
  const [payoutRatesLoading, setPayoutRatesLoading] = useState(false);
  const [payoutRatesError, setPayoutRatesError] = useState("");
  const [autoThreshold, setAutoThreshold] = useState(150);
  const [autoRateFactor, setAutoRateFactor] = useState(0.5);
  const [autoBetTypes, setAutoBetTypes] = useState(["two-top", "two-bottom"]);
  const [autoApplying, setAutoApplying] = useState(false);
  const [messageModal, setMessageModal] = useState(null);
  const memberNameById = useMemo(() => {
    const map = new Map();
    (members || []).forEach((m) => {
      if (m?.id != null) {
        map.set(String(m.id), m.username || m.name || String(m.id));
      }
    });
    return map;
  }, [members]);
  const pageSize = 10;
  const [resultForm, setResultForm] = useState({
    lotteryCode: "th-lottery",
    drawDate: new Date().toISOString().slice(0, 10),
    firstPrize: "",
    frontThreeA: "",
    frontThreeB: "",
    backThreeA: "",
    backThreeB: "",
    twoDigits: "",
    threeDigits: "",
    nearFirstA: "",
    nearFirstB: "",
  });
  const [savingResult, setSavingResult] = useState(false);
  const [lotterySwitch, setLotterySwitch] = useState({});
  const [togglingLottery, setTogglingLottery] = useState({});
  const [adminReply, setAdminReply] = useState("");
  const [editUser, setEditUser] = useState(null);
  const pendingRows = useMemo(() => {
    const rows = [];
    (ledger || []).forEach((item) => {
      const list =
        (Array.isArray(item.items) && item.items.length
          ? item.items
          : Array.isArray(item.numbers)
            ? item.numbers.map((num) => ({ number: num, betType: item.betType }))
            : []) || [];
      list.forEach((it, idx) => {
        const status = it.status || item.status || "pending";
        rows.push({
          rowId: `${item.id}-${it.id ?? idx}`,
          ticketId: item.id,
          member: item.member,
          lotteryId: item.lotteryId,
          number: it.number,
          betType: it.betType || item.betType,
          amount: Number(it.amount ?? item.debit ?? 0),
          buyRate: it.payoutRate ?? item.payoutRate ?? null,
          status,
          logId: it.id ?? null
        });
      });
    });
    return rows.filter((r) => r.status === "pending");
  }, [ledger]);
  const selectedCount = useMemo(() => Object.values(selectedRows).filter(Boolean).length, [selectedRows]);
  const verifyLotteryOptions = useMemo(() => {
    const map = new Map();
    lotteries?.forEach((lot) => map.set(lot.id, lot.name || lot.id));
    pendingRows.forEach((row) => {
      if (row.lotteryId && !map.has(row.lotteryId)) {
        map.set(row.lotteryId, row.lotteryId);
      }
    });
    return [{ id: "all", name: "ทั้งหมด" }, ...Array.from(map.entries()).map(([id, name]) => ({ id, name }))];
  }, [lotteries, pendingRows]);
  const scanLotteryOptions = useMemo(() => {
    const list = [];
    (lotteries || []).forEach((lot) => {
      const id = lot?.id ?? lot?.code;
      if (!id) return;
      list.push({ id, name: lot?.name || id });
    });
    if (!list.length) {
      Object.keys(resultMap || {}).forEach((key) => {
        list.push({ id: key, name: resultMap?.[key]?.title || key });
      });
    }
    return list;
  }, [lotteries, resultMap]);
  const scanResultEntry = resultMap?.[scanLotteryCode];
  const scanHasResult =
    Boolean(scanResultEntry) &&
    scanResultEntry?.drawDate === scanDrawDate &&
    hasResultNumbers(scanResultEntry);
  const scanWinners = useMemo(() => {
    if (!scanResult?.details) return [];
    return scanResult.details.filter((item) => Number(item?.payoutAmount ?? 0) > 0);
  }, [scanResult]);
  const scanLosersCount = useMemo(() => {
    if (!scanResult) return 0;
    const evaluated = Number(scanResult.evaluated ?? scanResult.details?.length ?? 0);
    const winnersCount = Number(scanResult.winners ?? scanWinners.length);
    return Math.max(0, evaluated - winnersCount);
  }, [scanResult, scanWinners.length]);
  const roundSummaryItems = useMemo(() => {
    const items = Array.isArray(roundSummary?.items) ? roundSummary.items : [];
    return items
      .map((item) => ({
        ...item,
        number: String(item.number ?? "").trim(),
        betType: item.betType || "standard",
        totalAmount: Number(item.totalAmount ?? 0),
        ticketCount: Number(item.ticketCount ?? 0),
        userCount: Number(item.userCount ?? 0)
      }))
      .filter((item) => item.number);
  }, [roundSummary]);
  const filteredRoundSummaryItems = useMemo(() => {
    const query = summaryFilter.trim().toLowerCase();
    const labelOf = (item) => (payoutOptionMap[item.betType]?.label || item.betType || "").toLowerCase();
    let list = roundSummaryItems;
    if (query) {
      list = list.filter(
        (item) =>
          String(item.number || "").toLowerCase().includes(query) ||
          labelOf(item).includes(query)
      );
    }
    const dir = summarySortDir === "asc" ? 1 : -1;
    const sorted = [...list].sort((a, b) => {
      switch (summarySortKey) {
        case "number": {
          return String(a.number).localeCompare(String(b.number)) * dir;
        }
        case "betType": {
          return labelOf(a).localeCompare(labelOf(b)) * dir;
        }
        case "ticketCount": {
          return (a.ticketCount - b.ticketCount) * dir;
        }
        case "userCount": {
          return (a.userCount - b.userCount) * dir;
        }
        case "totalAmount":
        default: {
          return (a.totalAmount - b.totalAmount) * dir;
        }
      }
    });
    return sorted;
  }, [roundSummaryItems, summaryFilter, summarySortKey, summarySortDir]);
  const roundSummaryTotals = useMemo(() => {
    if (roundSummary?.totals) {
      return {
        totalAmount: Number(roundSummary.totals.totalAmount ?? 0),
        totalLines: Number(roundSummary.totals.totalLines ?? 0),
        totalNumbers: Number(roundSummary.totals.totalNumbers ?? roundSummaryItems.length)
      };
    }
    return roundSummaryItems.reduce(
      (acc, item) => {
        acc.totalAmount += item.totalAmount;
        acc.totalLines += item.ticketCount;
        return acc;
      },
      { totalAmount: 0, totalLines: 0, totalNumbers: roundSummaryItems.length }
    );
  }, [roundSummary, roundSummaryItems]);
  const roundSummaryDateLabel = useMemo(() => {
    const start = roundSummary?.startDate || roundSummary?.drawDate || summaryStartDate || scanDrawDate;
    const end = roundSummary?.endDate || roundSummary?.drawDate || summaryEndDate || scanDrawDate;
    if (!start) return "";
    if (end && end !== start) {
      return `${formatDrawDateLabel(start)} ถึง ${formatDrawDateLabel(end)}`;
    }
    return formatDrawDateLabel(start);
  }, [roundSummary, summaryStartDate, summaryEndDate, scanDrawDate]);
  const roundSummaryIsRange = useMemo(() => {
    const start = roundSummary?.startDate || roundSummary?.drawDate || summaryStartDate || scanDrawDate;
    const end = roundSummary?.endDate || roundSummary?.drawDate || summaryEndDate || scanDrawDate;
    return Boolean(start && end && start !== end);
  }, [roundSummary, summaryStartDate, summaryEndDate, scanDrawDate]);
  const restrictionIndex = useMemo(() => {
    const index = new Set();
    (numberRestrictions || []).forEach((item) => {
      if (!item?.lotteryCode || !item?.betType || !item?.number) return;
      index.add(`${item.lotteryCode}::${item.betType}::${item.number}`);
    });
    return index;
  }, [numberRestrictions]);
  const payoutRateMap = useMemo(() => {
    const map = {};
    const list = payoutRatesByLottery?.[scanLotteryCode] || [];
    list.forEach((row) => {
      if (!row?.betType) return;
      const rateValue = Number(row.rate ?? row.payoutRate ?? row.payout_rate ?? 0);
      if (!Number.isNaN(rateValue)) {
        map[row.betType] = rateValue;
      }
    });
    return map;
  }, [payoutRatesByLottery, scanLotteryCode]);
  const autoBetTypeOptions = useMemo(
    () =>
      Object.values(payoutOptionMap).map((opt) => ({
        id: opt.id,
        label: opt.label
      })),
    []
  );
  const autoCandidates = useMemo(() => {
    if (!roundSummaryItems.length) return [];
    const thresholdNum = Number(autoThreshold);
    const factorNum = Number(autoRateFactor);
    if (!Number.isFinite(thresholdNum) || !Number.isFinite(factorNum)) return [];
    return roundSummaryItems
      .filter((item) => autoBetTypes.includes(item.betType))
      .filter((item) => item.totalAmount >= thresholdNum)
      .map((item) => {
        const baseRate = payoutRateMap[item.betType] ?? payoutOptionMap[item.betType]?.rate ?? null;
        const computedRate =
          baseRate != null && Number.isFinite(factorNum)
            ? Number((Number(baseRate) * factorNum).toFixed(2))
            : null;
        const key = `${scanLotteryCode}::${item.betType}::${item.number}`;
        const exists = restrictionIndex.has(key);
        return {
          ...item,
          baseRate,
          newRate: computedRate,
          hasRestriction: exists
        };
      });
  }, [roundSummaryItems, autoThreshold, autoRateFactor, autoBetTypes, payoutRateMap, scanLotteryCode, restrictionIndex]);
  const autoSummary = useMemo(() => {
    const total = autoCandidates.length;
    const ready = autoCandidates.filter((item) => !item.hasRestriction && item.newRate != null).length;
    const already = autoCandidates.filter((item) => item.hasRestriction).length;
    const missingRate = autoCandidates.filter((item) => item.newRate == null).length;
    return { total, ready, already, missingRate };
  }, [autoCandidates]);
  const showMessage = useCallback((message, title = "แจ้งเตือน") => {
    setMessageModal({ title, message });
  }, []);

  const loadRoundSummary = async ({ lotteryCode, startDate, endDate }) => {
    if (!onFetchRoundSummary) {
      showMessage("ยังไม่พร้อมใช้งานการสรุปเลขซื้อ");
      return;
    }
    if (!startDate || !endDate) {
      showMessage("กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด");
      return;
    }
    if (startDate > endDate) {
      showMessage("วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด");
      return;
    }
    setRoundSummaryLoading(true);
    setRoundSummaryError("");
    try {
      const result = await onFetchRoundSummary(lotteryCode, startDate, endDate);
      setRoundSummary(result);
      if (onFetchPayoutRates) {
        setPayoutRatesLoading(true);
        setPayoutRatesError("");
        try {
          const rates = await onFetchPayoutRates(lotteryCode);
          setPayoutRatesByLottery((prev) => ({ ...prev, [lotteryCode]: rates || [] }));
        } catch (err) {
          console.error(err);
          setPayoutRatesError(err?.message || "โหลดเรตจ่ายไม่สำเร็จ");
        } finally {
          setPayoutRatesLoading(false);
        }
      }
    } catch (err) {
      console.error(err);
      setRoundSummary(null);
      setRoundSummaryError(err?.message || "โหลดสรุปเลขไม่สำเร็จ");
    } finally {
      setRoundSummaryLoading(false);
    }
  };

  const handleLoadRoundSummary = () =>
    loadRoundSummary({
      lotteryCode: scanLotteryCode,
      startDate: scanDrawDate,
      endDate: scanDrawDate
    });

  const handleLoadRoundSummaryRange = () =>
    loadRoundSummary({
      lotteryCode: scanLotteryCode,
      startDate: summaryStartDate,
      endDate: summaryEndDate
    });

  const handleLoadPayoutRates = async () => {
    if (!onFetchPayoutRates) {
      showMessage("ยังไม่พร้อมใช้งานการโหลดเรตจ่าย");
      return;
    }
    setPayoutRatesLoading(true);
    setPayoutRatesError("");
    try {
      const rates = await onFetchPayoutRates(scanLotteryCode);
      setPayoutRatesByLottery((prev) => ({ ...prev, [scanLotteryCode]: rates || [] }));
    } catch (err) {
      console.error(err);
      setPayoutRatesError(err?.message || "โหลดเรตจ่ายไม่สำเร็จ");
    } finally {
      setPayoutRatesLoading(false);
    }
  };

  const handleApplyAutoRestrictions = async () => {
    if (!canManageUsers) {
      showMessage("เมนูนี้ใช้ได้เฉพาะ Super Admin");
      return;
    }
    if (!roundSummaryItems.length) {
      showMessage("ยังไม่มีสรุปเลขซื้อ กรุณาโหลดสรุปก่อน");
      return;
    }
    const thresholdNum = Number(autoThreshold);
    const factorNum = Number(autoRateFactor);
    if (!Number.isFinite(thresholdNum) || thresholdNum <= 0) {
      showMessage("กรุณาระบุเกณฑ์ยอดซื้อให้ถูกต้อง");
      return;
    }
    if (!Number.isFinite(factorNum) || factorNum <= 0) {
      showMessage("กรุณาระบุสัดส่วนเรตจ่ายให้ถูกต้อง");
      return;
    }
    const targets = autoCandidates.filter((item) => !item.hasRestriction && item.newRate != null);
    if (!targets.length) {
      showMessage("ไม่มีเลขที่เข้าเงื่อนไขหรือมีการปรับเรตแล้ว");
      return;
    }
    const ok = window.confirm(`ยืนยันปรับเรตอัตโนมัติ ${targets.length} รายการ?`);
    if (!ok) return;
    const scopeMap = {
      "three-top": "three",
      "three-tod": "three",
      "three-bottom": "three",
      "three-front": "three",
      "three-front-tod": "three",
      "two-top": "two",
      "two-bottom": "two",
      "run-top": "run",
      "run-bottom": "run"
    };
    setAutoApplying(true);
    try {
      const scopeLabel = roundSummaryIsRange ? `ช่วง ${roundSummaryDateLabel}` : `งวด ${roundSummaryDateLabel}`;
      const payloads = targets.map((item) => ({
        lotteryCode: scanLotteryCode,
        betType: item.betType,
        number: item.number,
        payoutRate: item.newRate,
        scope: scopeMap[item.betType] || null,
        note: `Auto rate x${factorNum} เมื่อยอดซื้อ >= ${thresholdNum} ${scopeLabel}`
      }));
      let results = [];
      if (onCreateRestrictionsBatch) {
        results = await onCreateRestrictionsBatch(payloads);
      } else if (onCreateRestriction) {
        for (const payload of payloads) {
          try {
            await onCreateRestriction(payload);
            results.push({ ...payload, ok: true });
          } catch (err) {
            results.push({ ...payload, ok: false, error: err?.message || "FAILED" });
          }
        }
      } else {
        showMessage("ยังไม่พร้อมใช้งานการสร้างเลขอั้น");
        return;
      }
      const successCount = results.filter((r) => r.ok !== false).length;
      const failCount = results.length - successCount;
      if (failCount > 0) {
        showMessage(`ปรับเรตสำเร็จ ${successCount} รายการ / ไม่สำเร็จ ${failCount} รายการ`);
      } else {
        showMessage(`ปรับเรตสำเร็จ ${successCount} รายการ`);
      }
    } catch (err) {
      console.error(err);
      showMessage(err?.message || "ปรับเรตอัตโนมัติไม่สำเร็จ");
    } finally {
      setAutoApplying(false);
    }
  };

  const handleToggleAllRows = (checked) => {
    if (!checked) {
      setSelectedRows({});
      return;
    }
    const next = {};
    pendingRows.forEach((row) => {
      next[row.rowId] = true;
    });
    setSelectedRows(next);
  };

  const handleBulkAction = async (action) => {
    const rows = pendingRows.filter((row) => selectedRows[row.rowId]);
    if (!rows.length) {
      showMessage("กรุณาเลือกโพย/รายการที่ต้องการก่อน");
      return;
    }
    if (action === "reject") {
      const ok = window.confirm(`ยืนยันตั้งค่าไม่ถูกรางวัล ${rows.length} รายการ?`);
      if (!ok) return;
      const grouped = rows.reduce((acc, row) => {
        acc[row.ticketId] = acc[row.ticketId] || [];
        acc[row.ticketId].push({ id: row.logId });
        return acc;
      }, {});
      setTicketActions((prev) => ({ ...prev, ...Object.keys(grouped).reduce((m, id) => ({ ...m, [id]: true }), {}) }));
      try {
        for (const ticketId of Object.keys(grouped)) {
          await onRejectTicket?.(ticketId, grouped[ticketId]);
        }
        setSelectedRows({});
      } finally {
        setTicketActions({});
      }
      return;
    }
    if (action === "confirm") {
      const rowsNeedingRate = rows.filter((r) => r.buyRate == null);
      let fallbackRate = null;
      if (rowsNeedingRate.length) {
        const input = window.prompt("ระบุเรตจ่ายสำหรับรายการที่ไม่มีเรต", "");
        if (input == null) return;
        const rateNum = Number(input);
        if (!Number.isFinite(rateNum) || rateNum <= 0) {
          showMessage("กรุณาระบุเรตเป็นตัวเลขมากกว่า 0");
          return;
        }
        fallbackRate = rateNum;
      }
      const grouped = rows.reduce((acc, row) => {
        acc[row.ticketId] = acc[row.ticketId] || [];
        acc[row.ticketId].push({ id: row.logId, payoutRate: row.buyRate ?? fallbackRate });
        return acc;
      }, {});
      setTicketActions((prev) => ({ ...prev, ...Object.keys(grouped).reduce((m, id) => ({ ...m, [id]: true }), {}) }));
      try {
        for (const ticketId of Object.keys(grouped)) {
          await onConfirmTicket?.(ticketId, null, grouped[ticketId]);
        }
        setSelectedRows({});
      } finally {
        setTicketActions({});
      }
    }
  };
  useEffect(() => {
    setBankAccounts(settings?.bankAccounts ?? []);
  }, [settings?.bankAccounts]);
  useEffect(() => {
    if (!scanLotteryOptions.length) return;
    if (!scanLotteryOptions.some((opt) => opt.id === scanLotteryCode)) {
      setScanLotteryCode(scanLotteryOptions[0].id);
    }
  }, [scanLotteryOptions, scanLotteryCode]);
  useEffect(() => {
    if (scanResultEntry?.drawDate) {
      setScanDrawDate(scanResultEntry.drawDate);
    }
  }, [scanLotteryCode, scanResultEntry?.drawDate]);
  useEffect(() => {
    setScanResult(null);
  }, [scanLotteryCode, scanDrawDate]);

  useEffect(() => {
    const next = {};
    (lotteries ?? []).forEach((lottery) => {
      next[lottery.id] = lottery.status !== "closed";
    });
    setLotterySwitch(next);
  }, [lotteries]);

  const handleUserFormChange = (e) => {
    const { name, value } = e.target;
    setUserForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreditFormChange = (e) => {
    const { name, value } = e.target;
    setCreditForm((prev) => ({ ...prev, [name]: value }));
  };

  async function submitUserForm(event) {
    event.preventDefault();
    if (!onCreateUser) return;
    setCreatingUser(true);
    try {
      await onCreateUser({
        ...userForm,
        creditLimit: Number(userForm.creditLimit) || 0,
      });
      showMessage("สร้างสมาชิกสำเร็จ");
      setUserForm(initialUserForm);
      await onRefresh?.();
    } catch (err) {
      console.error(err);
      showMessage("สร้างสมาชิกไม่สำเร็จ");
    } finally {
      setCreatingUser(false);
    }
  }

  async function submitCreditForm(event) {
    event.preventDefault();
    if (!onUpdateCredit || !creditForm.userId) return;
    setUpdatingCredit(true);
    try {
      const amount = Number(creditForm.topupAmount || 0);
      await onUpdateCredit(creditForm.userId, {
        topupAmount: Number.isFinite(amount) && amount > 0 ? amount : 0
      });
      showMessage("ปรับเครดิตสำเร็จ");
      setCreditForm({ userId: "", topupAmount: "" });
      await onRefresh?.();
    } catch (err) {
      console.error(err);
      showMessage("ไม่สามารถอัปเดตเครดิตได้");
    } finally {
      setUpdatingCredit(false);
    }
  }

  function handleAddBankAccount(event) {
    event.preventDefault();
    if (!newBankAccount.bank || !newBankAccount.account) return;
    setBankAccounts((prev) => [...prev, newBankAccount]);
    setNewBankAccount({ bank: "", account: "" });
  }

  function handleRestrictionFieldChange(event) {
    const { name, value } = event.target;
    setNewRestriction((prev) => ({ ...prev, [name]: value }));
  }

  async function handleAddNumberRestriction(event) {
    event.preventDefault();
    if (
      !newRestriction.number ||
      !newRestriction.lotteryCode ||
      !onCreateRestriction
    )
      return;
    setSavingRestriction(true);
    try {
      const payload = {
        lotteryCode: newRestriction.lotteryCode,
        betType: newRestriction.betType,
        number: newRestriction.number.trim(),
        payoutRate:
          newRestriction.payoutRate === ""
            ? undefined
            : Number(newRestriction.payoutRate),
        maxAmount:
          newRestriction.maxAmount === ""
            ? undefined
            : Number(newRestriction.maxAmount),
        discountPercent:
          newRestriction.discountPercent === ""
            ? undefined
            : Number(newRestriction.discountPercent),
        scope: newRestriction.scope || undefined,
        note: newRestriction.note,
      };
      await onCreateRestriction(payload);
      setNewRestriction((prev) => ({
        ...prev,
        number: "",
        payoutRate: "",
        note: "",
        maxAmount: "",
        discountPercent: "",
      }));
    } catch (err) {
      console.error(err);
      showMessage("ไม่สามารถบันทึกเลขอั้นได้");
    } finally {
      setSavingRestriction(false);
    }
  }

  const renderPager = (total, page, setPage) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (totalPages <= 1) return null;
    return (
      <div className="pager">
        <button type="button" className="secondary-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          ก่อนหน้า
        </button>
        <span>
          หน้า {page} / {totalPages}
        </span>
        <button
          type="button"
          className="secondary-btn"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          ถัดไป
        </button>
      </div>
    );
  };

  async function handleCreateLottery(event) {
    event.preventDefault();
    if (!newLottery.code || !newLottery.name || !onCreateLottery) return;
    try {
      await onCreateLottery(newLottery);
      showMessage("บันทึกหวยใหม่สำเร็จ");
      setNewLottery({
        code: "",
        name: "",
        kind: "international",
        group: "",
        ...buildDefaultLotteryTimes(),
        status: "open",
        description: ""
      });
      await onRefresh?.();
    } catch (err) {
      console.error(err);
      showMessage("ไม่สามารถบันทึกหวยได้");
    }
  }

  async function handleDeleteRestriction(id) {
    if (!window.confirm("ยืนยันลบเลขอั้นนี้หรือไม่?") || !onDeleteRestriction)
      return;
    try {
      await onDeleteRestriction(id);
    } catch (err) {
      console.error(err);
      showMessage("ลบเลขอั้นไม่สำเร็จ");
    }
  }

  function handleResultFormChange(event) {
    const { name, value } = event.target;
    setResultForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleResultSubmit(event) {
    event.preventDefault();
    if (!resultForm.drawDate || !onSaveResult) return;
    setSavingResult(true);
    try {
      const payload = {
        lotteryCode: resultForm.lotteryCode,
        drawDate: resultForm.drawDate,
        firstPrize: resultForm.firstPrize || undefined,
        frontThree: [resultForm.frontThreeA, resultForm.frontThreeB].filter(
          Boolean
        ),
        backThree: [resultForm.backThreeA, resultForm.backThreeB].filter(
          Boolean
        ),
        nearFirst: [resultForm.nearFirstA, resultForm.nearFirstB].filter(
          Boolean
        ),
        twoDigits: resultForm.twoDigits || undefined,
        threeDigits: resultForm.threeDigits || undefined,
      };
      await onSaveResult(payload);
      showMessage("บันทึกผลรางวัลสำเร็จ");
    } catch (err) {
      console.error(err);
      showMessage("ไม่สามารถบันทึกผลรางวัลได้");
    } finally {
      setSavingResult(false);
    }
  }

  async function toggleLotteryStatus(id) {
    if (togglingLottery[id]) return;
    const nextStatus = !lotterySwitch[id];
    setLotterySwitch((prev) => ({ ...prev, [id]: nextStatus }));
    setTogglingLottery((prev) => ({ ...prev, [id]: true }));
    try {
      await onToggleLotteryStatus?.(id, nextStatus ? "open" : "closed");
    } catch (err) {
      console.error(err);
      // revert local switch on failure
      setLotterySwitch((prev) => ({ ...prev, [id]: !nextStatus }));
      showMessage("ไม่สามารถเปลี่ยนสถานะได้");
    } finally {
      setTogglingLottery((prev) => {
        const clone = { ...prev };
        delete clone[id];
        return clone;
      });
    }
  }

  const overview = (
    <>
      <div className="panel">
        <h3>สรุประบบ</h3>
        <div className="two-column">
          <div>
            <strong>หวยเปิดรับ</strong>
            <p>{summary?.activeLotteries ?? 0} รายการ</p>
          </div>
          <div>
            <strong>เครดิตใช้งาน</strong>
            <p>
              {Number(summary?.creditUsed ?? 0).toLocaleString()} /{" "}
              {Number(summary?.creditLimit ?? 0).toLocaleString()}
            </p>
          </div>
          <div>
            <strong>ยอดโพยวันนี้</strong>
            <p>{Number(daily?.totalAmount ?? 0).toLocaleString()}</p>
          </div>
          <div>
            <strong>รายได้ประมาณการ</strong>
            <p>{Number(daily?.estimateRevenue ?? 0).toLocaleString()}</p>
          </div>
        </div>
      </div>
      <div className="panel">
        <h3>รายงานโพยล่าสุด</h3>
        <table className="table">
          <thead>
            <tr>
              <th>โพย</th>
              <th>สมาชิก</th>
              <th>หวย</th>
              <th>สถานะ</th>
              <th>ยอดแทง</th>
            </tr>
          </thead>
          <tbody>
            {(ledger ?? []).slice(0, 5).map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.member}</td>
                <td>{item.lotteryId}</td>
                <td>{item.credit > 0 ? "ถูกรางวัล" : "รอดำเนินการ"}</td>
                <td>{Number(item.debit ?? 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  const membersView = (
    <div className="panel">
      <h3>ระบบจัดการสมาชิก</h3>
      {canManageUsers ? (
        <p>
          ใช้เมนู &quot;เพิ่มสมาชิกใหม่&quot; และ &quot;เติมเครดิต&quot;
          สำหรับงานที่ต้องอนุมัติจาก Super Admin
        </p>
      ) : (
        <p>สิทธิ์การเพิ่มสมาชิกและจัดการเครดิตสงวนสำหรับ Super Admin</p>
      )}
      <div className="table-actions">
        <input
          type="search"
          className="table-filter"
          placeholder="ค้นหา สมาชิก/เครดิต/บทบาท"
          value={searchMembers}
          onChange={(e) => {
            setSearchMembers(e.target.value);
            setPageMembers(1);
          }}
        />
        <button
          type="button"
          className="clear-btn"
          onClick={() => {
            setSearchMembers("");
            setPageMembers(1);
          }}
          disabled={!searchMembers}
        >
          ล้างตัวกรอง
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>รหัส</th>
            <th>บทบาท</th>
            <th>เครดิต</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {(members ?? [])
            .filter((member) => {
              const q = searchMembers.trim().toLowerCase();
              if (!q) return true;
              return (
                String(member.username ?? "").toLowerCase().includes(q) ||
                String(member.role ?? "").toLowerCase().includes(q) ||
                String(member.creditLimit ?? "").toLowerCase().includes(q) ||
                String(member.creditUsed ?? "").toLowerCase().includes(q)
              );
            })
            .slice((pageMembers - 1) * pageSize, pageMembers * pageSize)
            .map((member) => (
              <tr key={member.id}>
                <td>{member.username}</td>
                <td>{member.role}</td>
                <td>
                  {Number(member.creditUsed ?? 0).toLocaleString()} /{" "}
                  {Number(member.creditLimit ?? 0).toLocaleString()}
                </td>
                <td>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setEditUser({ ...member })}
                    title="แก้ไขข้อมูล"
                  >
                    ✎ แก้ไข
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {renderPager(
        (members ?? []).filter((member) => {
          const q = searchMembers.trim().toLowerCase();
          if (!q) return true;
          return (
            String(member.username ?? "").toLowerCase().includes(q) ||
            String(member.role ?? "").toLowerCase().includes(q) ||
            String(member.creditLimit ?? "").toLowerCase().includes(q) ||
            String(member.creditUsed ?? "").toLowerCase().includes(q)
          );
        }).length,
        pageMembers,
        setPageMembers
      )}

      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div
            className="modal modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>แก้ไขสมาชิก</h3>
            <div className="edit-grid">
              <div className="field">
                <label>Username</label>
                <input value={editUser.username} disabled />
              </div>
              <div className="field">
                <label>Password (เว้นว่างถ้าไม่เปลี่ยน)</label>
                <input
                  type="password"
                  value={editUser.password || ""}
                  onChange={(e) =>
                    setEditUser((prev) => ({ ...prev, password: e.target.value }))
                  }
                  placeholder="••••••"
                />
              </div>
              <div className="field">
                <label>บทบาท</label>
                <select
                  value={editUser.role}
                  onChange={(e) =>
                    setEditUser((prev) => ({ ...prev, role: e.target.value }))
                  }
                >
                  <option value="agent">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div className="field">
                <label>ชื่อบัญชี</label>
                <input
                  type="text"
                  value={editUser.fullName || ""}
                  onChange={(e) =>
                    setEditUser((prev) => ({ ...prev, fullName: e.target.value }))
                  }
                  placeholder="ชื่อเจ้าของบัญชี"
                />
              </div>
              <div className="field">
                <label>ธนาคาร</label>
                <input
                  type="text"
                  value={editUser.bankName || ""}
                  onChange={(e) =>
                    setEditUser((prev) => ({ ...prev, bankName: e.target.value }))
                  }
                  placeholder="ชื่อธนาคาร"
                />
              </div>
              <div className="field">
                <label>เลขบัญชี</label>
                <input
                  type="text"
                  value={editUser.bankAccount || ""}
                  onChange={(e) =>
                    setEditUser((prev) => ({
                      ...prev,
                      bankAccount: e.target.value,
                    }))
                  }
                  placeholder="เช่น 123-4-56789-0"
                />
              </div>
              <div className="field">
                <label>BSB</label>
                <input
                  type="text"
                  value={editUser.bsb || ""}
                  onChange={(e) =>
                    setEditUser((prev) => ({ ...prev, bsb: e.target.value }))
                  }
                  placeholder="BSB"
                />
              </div>
              <div className="field">
                <label>เครดิต</label>
                <input
                  type="number"
                  value={editUser.creditLimit ?? 0}
                  onChange={(e) =>
                    setEditUser((prev) => ({
                      ...prev,
                      creditLimit: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="field">
                <label>เบอร์โทร</label>
                <input
                  type="text"
                  value={editUser.phone || ""}
                  onChange={(e) =>
                    setEditUser((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  placeholder="เบอร์โทร"
                />
              </div>
              <div className="field">
                <label>เครดิตที่ใช้แล้ว</label>
                <input
                  type="number"
                  value={editUser.creditUsed ?? 0}
                  onChange={(e) =>
                    setEditUser((prev) => ({
                      ...prev,
                      creditUsed: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="field">
                <label>บัญชีธนาคาร</label>
                <input
                  type="text"
                  value={editUser.bankName || ""}
                  onChange={(e) =>
                    setEditUser((prev) => ({ ...prev, bankName: e.target.value }))
                  }
                  placeholder="ชื่อธนาคาร"
                />
              </div>
              <div className="field">
                <label>เลขที่บัญชี</label>
                <input
                  type="text"
                  value={editUser.bankAccount || ""}
                  onChange={(e) =>
                    setEditUser((prev) => ({
                      ...prev,
                      bankAccount: e.target.value,
                    }))
                  }
                  placeholder="เช่น 123-4-56789-0"
                />
              </div>
            </div>
            <div className="modal-actions right">
              <button className="secondary-btn ghost" type="button" onClick={() => setEditUser(null)}>
                ยกเลิก
              </button>

              <button
                className="primary-btn"
                type="button"
                onClick={async () => {
                  try {
                    await onUpdateCredit?.(editUser.id, {
                      creditLimit: Number(editUser.creditLimit),
                      creditUsed: Number(editUser.creditUsed),
                      bankName: editUser.bankName,
                      bankAccount: editUser.bankAccount
                    });
                    showMessage("อัปเดตสมาชิกสำเร็จ");
                    setEditUser(null);
                    await onRefresh?.();
                  } catch (err) {
                    console.error(err);
                    showMessage("ไม่สามารถอัปเดตสมาชิกได้");
                  }
                }}
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const memberCreateView = (
    <div className="panel">
      <h3>เพิ่มสมาชิกใหม่</h3>
      {canManageUsers ? (
        <form onSubmit={submitUserForm}>
          <div className="field">
            <label>Username</label>
            <input
              name="username"
              value={userForm.username}
              onChange={handleUserFormChange}
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              name="password"
              type="password"
              value={userForm.password}
              onChange={handleUserFormChange}
              required
            />
          </div>
          <div className="field">
            <label>ชื่อบัญชี</label>
            <input
              name="fullName"
              value={userForm.fullName}
              onChange={handleUserFormChange}
              placeholder="ชื่อ-นามสกุลผู้ถือบัญชี"
            />
          </div>
          <div className="field">
            <label>ธนาคาร</label>
            <input
              name="bankName"
              type="text"
              value={userForm.bankName}
              onChange={handleUserFormChange}
              placeholder="เช่น KBank / SCB"
            />
          </div>
          <div className="field">
            <label>เลขบัญชี</label>
            <input
              name="bankAccount"
              type="text"
              value={userForm.bankAccount}
              onChange={handleUserFormChange}
              placeholder="เช่น 123-4-56789-0"
            />
          </div>
          <div className="field">
            <label>BSB</label>
            <input
              name="bsb"
              type="text"
              value={userForm.bsb}
              onChange={handleUserFormChange}
              placeholder="ถ้ามี"
            />
          </div>
          <div className="field">
            <label>เบอร์โทร</label>
            <input
              name="phone"
              type="tel"
              value={userForm.phone}
              onChange={handleUserFormChange}
              placeholder="เช่น 0812345678"
            />
          </div>
          <div className="field">
            <label>บทบาท</label>
            <select
              name="role"
              value={userForm.role}
              onChange={handleUserFormChange}
            >
              <option value="admin">Admin</option>
              <option value="agent">User</option>
            </select>
          </div>
          <div className="field">
            <label>เครดิตเริ่มต้น</label>
            <input
              name="creditLimit"
              type="number"
              value={userForm.creditLimit}
              onChange={handleUserFormChange}
            />
          </div>
          <button className="primary-btn" type="submit" disabled={creatingUser}>
            {creatingUser ? "กำลังสร้าง..." : "สร้างสมาชิก"}
          </button>
        </form>
      ) : (
        <p>สิทธิ์การเพิ่มสมาชิกสงวนสำหรับ Super Admin</p>
      )}
    </div>
  );

  const creditTopupView = (
    <div className="panel">
      <h3>เติมเครดิต / ปรับเครดิต</h3>
      {canManageUsers ? (
        <form onSubmit={submitCreditForm}>
          <div className="field">
            <label>เลือกสมาชิก</label>
            <select
              name="userId"
              value={creditForm.userId}
              onChange={handleCreditFormChange}
              required
            >
              <option value="">-- เลือกสมาชิก --</option>
              {(members ?? []).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.username}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>ปรับเครดิต (บวกเพิ่มจากเครดิตคงเหลือ)</label>
            <input
              name="topupAmount"
              type="number"
              value={creditForm.topupAmount}
              onChange={handleCreditFormChange}
              placeholder="เช่น 1000"
            />
          </div>
          <button
            className="primary-btn"
            type="submit"
            disabled={updatingCredit}
          >
            {updatingCredit ? "กำลังอัปเดต..." : "ปรับเครดิต"}
          </button>
        </form>
      ) : (
        <p>สิทธิ์การจัดการเครดิตสงวนสำหรับ Super Admin</p>
      )}
    </div>
  );

  const creditView = (
    <div className="panel">
      <h3>รายงานเครดิต</h3>
      <div className="table-actions">
        <input
          type="search"
          className="table-filter"
          placeholder="ค้นหาโพย/สมาชิก/หวย"
          value={searchLedger}
          onChange={(e) => {
            setSearchLedger(e.target.value);
            setPageLedger(1);
          }}
        />
        <button
          type="button"
          className="clear-btn"
          onClick={() => {
            setSearchLedger("");
            setPageLedger(1);
          }}
          disabled={!searchLedger}
        >
          ล้างตัวกรอง
        </button>
      </div>
      <div className="two-column">
        <div>
          <h4>รายวัน</h4>
          <p>
            ยอดแทง {Number(daily?.totalAmount ?? 0).toLocaleString()} / โพย{" "}
            {daily?.totalTickets ?? 0} รายการ
          </p>
        </div>
        <div>
          <h4>เครดิตระหว่างสมาชิก</h4>
          <ul>
            {(creditBetween ?? []).map((item) => (
              <li key={item.username}>
                {item.username}: เหลือ{" "}
                {Number(item.creditAvailable ?? 0).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <h4>เดินบัญชี</h4>
      <table className="table">
        <thead>
          <tr>
            <th>โพย</th>
            <th>สมาชิก</th>
            <th>หวย</th>
            <th>เดบิต</th>
            <th>เครดิต</th>
          </tr>
        </thead>
        <tbody>
          {(ledger ?? [])
            .filter((item) => {
              const q = searchLedger.trim().toLowerCase();
              if (!q) return true;
              return (
                String(item.id ?? "").toLowerCase().includes(q) ||
                String(item.member ?? "").toLowerCase().includes(q) ||
                String(item.lotteryId ?? "").toLowerCase().includes(q)
              );
            })
            .slice((pageLedger - 1) * pageSize, pageLedger * pageSize)
            .map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.member}</td>
              <td>{item.lotteryId}</td>
              <td>{Number(item.debit ?? 0).toLocaleString()}</td>
              <td>{Number(item.credit ?? 0).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {renderPager(
        (ledger ?? []).filter((item) => {
          const q = searchLedger.trim().toLowerCase();
          if (!q) return true;
          return (
            String(item.id ?? "").toLowerCase().includes(q) ||
            String(item.member ?? "").toLowerCase().includes(q) ||
            String(item.lotteryId ?? "").toLowerCase().includes(q)
          );
        }).length,
        pageLedger,
        setPageLedger
      )}
    </div>
  );

  const approvalView = (
    <div className="panel">
      <h3>อนุมัติคำขอฝาก-ถอน</h3>
      <p className="text-muted">ตรวจสอบคำขอแล้วกดอนุมัติหรือปฏิเสธ</p>
      <div className="table-actions">
        <input
          type="search"
          className="table-filter"
          placeholder="ค้นหา ผู้ใช้/ประเภท/สถานะ"
          value={searchApprovals}
          onChange={(e) => {
            setSearchApprovals(e.target.value);
            setPageApprovals(1);
          }}
        />
        <button
          type="button"
          className="clear-btn"
          onClick={() => {
            setSearchApprovals("");
            setPageApprovals(1);
          }}
          disabled={!searchApprovals}
        >
          ล้างตัวกรอง
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>เวลา</th>
            <th>ผู้ใช้</th>
            <th>ประเภท</th>
            <th>สถานะ</th>
            <th>จำนวน</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {(adminTransactions ?? [])
            .filter((txn) => {
              const q = searchApprovals.trim().toLowerCase();
              if (!q) return true;
              return (
                String(txn.user_id ?? txn.userId ?? txn.username ?? txn.user ?? "").toLowerCase().includes(q) ||
                String(txn.txn_type ?? "").toLowerCase().includes(q) ||
                String(txn.status ?? "").toLowerCase().includes(q)
              );
            })
            .slice((pageApprovals - 1) * pageSize, pageApprovals * pageSize)
            .map((txn) => {
            const label = txn.txn_type === "withdraw" ? "ถอน" : "ฝาก";
            const userLabel =
              txn.username ||
              txn.user ||
              txn.member ||
              memberNameById.get(String(txn.user_id ?? txn.userId ?? "")) ||
              String(txn.user_id ?? txn.userId ?? "-");
            return (
              <tr key={txn.id}>
                <td>
                  {new Date(txn.created_at ?? txn.createdAt).toLocaleString(
                    "th-TH"
                  )}
                </td>
                <td>{userLabel}</td>
                <td>{label}</td>
                <td>{txn.status}</td>
                <td>{Number(txn.amount ?? 0).toLocaleString()}</td>
                <td>
                  {txn.status !== "approved" && (
                    <>
                      <button
                        className="secondary-btn"
                        style={{ marginRight: 6 }}
                        onClick={() => onApproveTransaction?.(txn.id)}
                      >
                        อนุมัติ
                      </button>
                      <button
                        className="secondary-btn"
                        onClick={() => onRejectTransaction?.(txn.id)}
                      >
                        ปฏิเสธ
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {!adminTransactions?.length && (
            <tr>
              <td colSpan={6}>ยังไม่มีคำขอล่าสุด</td>
            </tr>
          )}
        </tbody>
      </table>
      {renderPager(
        (adminTransactions ?? []).filter((txn) => {
          const q = searchApprovals.trim().toLowerCase();
          if (!q) return true;
          return (
            String(txn.user_id ?? txn.userId ?? txn.username ?? txn.user ?? "").toLowerCase().includes(q) ||
            String(txn.txn_type ?? "").toLowerCase().includes(q) ||
            String(txn.status ?? "").toLowerCase().includes(q)
          );
        }).length,
        pageApprovals,
        setPageApprovals
      )}
    </div>
  );

  const creditHistoryView = (
    <div className="panel">
      <h3>ประวัติเครดิต</h3>
      <div className="table-actions">
        <input
          type="search"
          className="table-filter"
          placeholder="ค้นหา สมาชิก/ผู้ทำรายการ/ประเภท"
          value={searchCreditHistory}
          onChange={(e) => {
            setSearchCreditHistory(e.target.value);
            setPageCreditHistory(1);
          }}
        />
        <button
          type="button"
          className="clear-btn"
          onClick={() => {
            setSearchCreditHistory("");
            setPageCreditHistory(1);
          }}
          disabled={!searchCreditHistory}
        >
          ล้างตัวกรอง
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>เวลา</th>
            <th>ประเภท</th>
            <th>สมาชิก</th>
            <th>จำนวน</th>
            <th>ผู้ทำรายการ</th>
            <th>สถานะ</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {(creditHistory ?? [])
            .filter((item) => {
              const q = searchCreditHistory.trim().toLowerCase();
              if (!q) return true;
              return (
                String(item.targetUsername ?? item.targetUserId ?? "").toLowerCase().includes(q) ||
                String(item.actorUsername ?? "").toLowerCase().includes(q) ||
                String(item.action ?? "").toLowerCase().includes(q) ||
                String(item.txnType ?? "").toLowerCase().includes(q) ||
                String(item.status ?? "").toLowerCase().includes(q) ||
                String(item.amount ?? "").toLowerCase().includes(q)
              );
            })
            .slice((pageCreditHistory - 1) * pageSize, pageCreditHistory * pageSize)
            .map((item) => {
              const actionMap = {
                credit_topup: "เติมเครดิต",
                admin_deposit: "ฝากเครดิต (แอดมิน)",
                admin_withdraw: "ถอนเครดิต (แอดมิน)",
                transaction_approved: "อนุมัติคำขอ",
                transaction_rejected: "ปฏิเสธคำขอ"
              };
              const txnLabel =
                item.txnType === "withdraw"
                  ? "ถอน"
                  : item.txnType === "deposit"
                    ? "ฝาก"
                    : "";
              const baseLabel = actionMap[item.action] || item.action || "-";
              const typeLabel =
                (item.action === "transaction_approved" || item.action === "transaction_rejected") && txnLabel
                  ? `${baseLabel} (${txnLabel})`
                  : baseLabel;
              const targetLabel =
                item.targetUsername ||
                memberNameById.get(String(item.targetUserId ?? "")) ||
                (item.targetUserId ? `#${item.targetUserId}` : "-");
              const statusLabel = item.status
                ? item.status === "approved"
                  ? "อนุมัติ"
                  : item.status === "rejected"
                    ? "ปฏิเสธ"
                    : item.status
                : item.action === "transaction_rejected"
                  ? "ปฏิเสธ"
                  : item.action === "transaction_approved"
                    ? "อนุมัติ"
                    : "สำเร็จ";
              return (
                <tr key={item.id ?? `${item.action}-${item.createdAt}`}>
                  <td>{item.createdAt ? new Date(item.createdAt).toLocaleString("th-TH") : "-"}</td>
                  <td>{typeLabel}</td>
                  <td>{targetLabel}</td>
                  <td>{Number(item.amount ?? 0).toLocaleString()}</td>
                  <td>{item.actorUsername || "-"}</td>
                  <td>{statusLabel}</td>
                  <td>{item.note || "-"}</td>
                </tr>
              );
            })}
          {!creditHistory?.length && (
            <tr>
              <td colSpan={7}>ยังไม่มีประวัติการทำรายการ</td>
            </tr>
          )}
        </tbody>
      </table>
      {renderPager(
        (creditHistory ?? []).filter((item) => {
          const q = searchCreditHistory.trim().toLowerCase();
          if (!q) return true;
          return (
            String(item.targetUsername ?? item.targetUserId ?? "").toLowerCase().includes(q) ||
            String(item.actorUsername ?? "").toLowerCase().includes(q) ||
            String(item.action ?? "").toLowerCase().includes(q) ||
            String(item.txnType ?? "").toLowerCase().includes(q) ||
            String(item.status ?? "").toLowerCase().includes(q) ||
            String(item.amount ?? "").toLowerCase().includes(q)
          );
        }).length,
        pageCreditHistory,
        setPageCreditHistory
      )}
    </div>
  );

  const incomeView = (
    <div className="panel">
      <h3>รายงานรายได้</h3>
      <table className="table">
        <thead>
          <tr>
            <th>หวย</th>
            <th>ยอดแทงรวม</th>
            <th>กำไรคาดการณ์</th>
          </tr>
        </thead>
        <tbody>
          {(income ?? []).map((item) => (
            <tr key={item.lottery}>
              <td>{item.lottery}</td>
              <td>{Number(item.totalStake ?? 0).toLocaleString()}</td>
              <td>{Number(item.estimatedMargin ?? 0).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const historyView = (
    <div className="panel">
      <h3>โพยย้อนหลัง</h3>
      <div className="table-actions">
        <input
          type="search"
          className="table-filter"
          placeholder="ค้นหา โพย/สมาชิก/หวย"
          value={searchLedger}
          onChange={(e) => {
            setSearchLedger(e.target.value);
            setPageLedger(1);
          }}
        />
        <button
          type="button"
          className="clear-btn"
          onClick={() => {
            setSearchLedger("");
            setPageLedger(1);
          }}
          disabled={!searchLedger}
        >
          ล้างตัวกรอง
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>โพย</th>
            <th>สมาชิก</th>
            <th>หวย</th>
            <th>เลขที่ซื้อ</th>
            <th>สถานะ</th>
            <th>ยอดแทง</th>
            <th>เวลาสร้าง</th>
          </tr>
        </thead>
        <tbody>
          {(ledger ?? [])
            .filter((item) => {
              const q = searchLedger.trim().toLowerCase();
              if (!q) return true;
              return (
                String(item.id ?? "").toLowerCase().includes(q) ||
                String(item.member ?? "").toLowerCase().includes(q) ||
                String(item.lotteryId ?? "").toLowerCase().includes(q)
              );
            })
            .slice((pageLedger - 1) * pageSize, pageLedger * pageSize)
            .map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.member}</td>
              <td>{item.lotteryId}</td>
              <td>{formatBetNumbers(item.numbers)}</td>
              <td>{item.credit > 0 ? "ถูกรางวัล" : "รอดำเนินการ"}</td>
              <td>{Number(item.debit ?? 0).toLocaleString()}</td>
              <td>{new Date(item.createdAt).toLocaleString("th-TH")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {renderPager(
        (ledger ?? []).filter((item) => {
          const q = searchLedger.trim().toLowerCase();
          if (!q) return true;
          return (
            String(item.id ?? "").toLowerCase().includes(q) ||
            String(item.member ?? "").toLowerCase().includes(q) ||
            String(item.lotteryId ?? "").toLowerCase().includes(q)
          );
        }).length,
        pageLedger,
        setPageLedger
      )}
    </div>
  );

  const settingsView = (
    <div className="panel">
      <h3>ตั้งค่าหวย</h3>
      <LotterySettings settings={settings} onSave={onSaveSettings} />
    </div>
  );

  const directMembersView = (
    <div className="panel">
      <h3>ฝากตรง-ถอนตรง (สมาชิก)</h3>
      <CashFlowPanel audience="สมาชิก" />
    </div>
  );

  const directAgentsView = (
    <div className="panel">
      <h3>สถานะ Agent</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>เครดิต</th>
            <th>ลูกทีม</th>
          </tr>
        </thead>
        <tbody>
          {(members ?? [])
            .filter((member) => member.role === "agent")
            .map((agent) => (
              <tr key={agent.id}>
                <td>{agent.username}</td>
                <td>
                  {Number(agent.creditUsed ?? 0).toLocaleString()} /{" "}
                  {Number(agent.creditLimit ?? 0).toLocaleString()}
                </td>
                <td>{agent.children?.length ?? 0}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  const bankingView = (
    null
  );

  const lotteryControlView = (
    <div className="panel">
      <h3>เปิด-ปิดระบบหวย</h3>
      <p className="text-muted">
        เลือกวันและเวลาเปิด-ปิดสำหรับรอบรับแทงให้ตรงตามงวดจริง (เวลาประเทศไทย) จากนั้นกดเพิ่มหวยใหม่เพื่อบันทึก
      </p>
      {canManageUsers && (
        <form className="grid two-column" style={{ marginBottom: 16 }} onSubmit={handleCreateLottery}>
          <div className="field">
            <label>รหัสหวย (code)</label>
            <input
              name="code"
              value={newLottery.code}
              onChange={(e) => setNewLottery((prev) => ({ ...prev, code: e.target.value.trim() }))}
              required
            />
          </div>
          <div className="field">
            <label>ชื่อหวย</label>
            <input
              name="name"
              value={newLottery.name}
              onChange={(e) => setNewLottery((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>วันเวลาเปิด</label>
            <input
              type="datetime-local"
              name="openTime"
              value={newLottery.openTime}
              onChange={(e) => setNewLottery((prev) => ({ ...prev, openTime: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>วันเวลาปิด</label>
            <input
              type="datetime-local"
              name="closeTime"
              value={newLottery.closeTime}
              onChange={(e) => setNewLottery((prev) => ({ ...prev, closeTime: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>สถานะ</label>
            <select
              name="status"
              value={newLottery.status}
              onChange={(e) => setNewLottery((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="open">เปิด</option>
              <option value="closed">ปิด</option>
            </select>
          </div>
          <div className="field">
            <label>กลุ่ม/ประเทศ</label>
            <input
              name="group"
              value={newLottery.group}
              onChange={(e) => setNewLottery((prev) => ({ ...prev, group: e.target.value }))}
              placeholder="เช่น เวียดนาม"
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>รายละเอียด</label>
            <textarea
              name="description"
              value={newLottery.description}
              onChange={(e) => setNewLottery((prev) => ({ ...prev, description: e.target.value }))}
              rows={2}
            />
          </div>
          <button className="primary-btn" type="submit" style={{ gridColumn: "1 / -1" }}>
            เพิ่มหวยใหม่
          </button>
        </form>
      )}
      <table className="table">
        <thead>
          <tr>
            <th>หวย</th>
            <th>สถานะ</th>
            <th>ดำเนินการ</th>
          </tr>
        </thead>
        <tbody>
          {(lotteries ?? []).map((lottery) => (
            <tr key={lottery.id}>
              <td>{lottery.name}</td>
              <td>{lotterySwitch[lottery.id] ? "เปิดรับ" : "ปิด"}</td>
              <td>
                <button
                  className="primary-btn"
                  type="button"
                  onClick={() => toggleLotteryStatus(lottery.id)}
                  disabled={Boolean(togglingLottery[lottery.id])}
                >
                  {lotterySwitch[lottery.id] ? "ปิด" : "เปิด"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const lotteryNumbersView = (
    <div className="panel">
      <h3>เลขอั้น & เรตจ่ายพิเศษ</h3>
      <div className="table-actions">
        <input
          type="search"
          className="table-filter"
          placeholder="ค้นหา หวย/เลข/ประเภท"
          value={searchRestrictions}
          onChange={(e) => {
            setSearchRestrictions(e.target.value);
            setPageRestrictions(1);
          }}
        />
        <button
          type="button"
          className="clear-btn"
          onClick={() => {
            setSearchRestrictions("");
            setPageRestrictions(1);
          }}
          disabled={!searchRestrictions}
        >
          ล้างตัวกรอง
        </button>
      </div>
      {numberRestrictions.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>หวย</th>
              <th>ประเภท</th>
              <th>หมายเลข</th>
              <th>เรตจ่าย</th>
              <th>จำกัด</th>
              <th>ลด%</th>
              <th>หมายเหตุ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {numberRestrictions
              .slice((pageRestrictions - 1) * pageSize, pageRestrictions * pageSize)
              .map((item) => (
              <tr key={item.id}>
                <td>
                  {lotteries.find((lottery) => lottery.id === item.lotteryCode)
                    ?.name ?? item.lotteryCode}
                </td>
                <td>{payoutOptionMap[item.betType]?.label ?? item.betType}</td>
                <td>{item.number}</td>
                <td>
                  {item.payoutRate
                    ? Number(item.payoutRate).toLocaleString()
                    : "-"}
                </td>
                <td>
                  {item.maxAmount
                    ? Number(item.maxAmount).toLocaleString()
                    : "-"}
                </td>
                <td>{item.discountPercent ?? "-"}</td>
                <td>{item.note || "-"}</td>
                <td style={{ textAlign: "right" }}>
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={() => handleDeleteRestriction(item.id)}
                  >
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty-copy">ยังไม่มีเลขอั้น</p>
      )}
      {renderPager(
        numberRestrictions.filter((item) => {
          const q = searchRestrictions.trim().toLowerCase();
          if (!q) return true;
          const lotName =
            lotteries.find((lottery) => lottery.id === item.lotteryCode)?.name ??
            item.lotteryCode;
          return (
            String(lotName).toLowerCase().includes(q) ||
            String(item.number ?? "").toLowerCase().includes(q) ||
            String(item.betType ?? "").toLowerCase().includes(q)
          );
        }).length,
        pageRestrictions,
        setPageRestrictions
      )}
      <form className="two-column" style={{marginTop: "15px"}} onSubmit={handleAddNumberRestriction}>
        <div className="field" >
          <label>เลือกหวย</label>
          <select
            name="lotteryCode"
            value={newRestriction.lotteryCode}
            onChange={handleRestrictionFieldChange}
          >
            {lotteries.map((lottery) => (
              <option key={lottery.id} value={lottery.id}>
                {lottery.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>ประเภท</label>
          <select
            name="betType"
            value={newRestriction.betType}
            onChange={handleRestrictionFieldChange}
          >
            {Object.values(payoutOptionMap).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>หมายเลข</label>
          <input
            name="number"
            value={newRestriction.number}
            onChange={handleRestrictionFieldChange}
            placeholder="เช่น 999"
            required
          />
        </div>
        <div className="field">
          <label>เรตจ่าย (หากต่างจากปกติ)</label>
          <input
            name="payoutRate"
            value={newRestriction.payoutRate}
            onChange={handleRestrictionFieldChange}
            placeholder="เช่น 450"
            type="number"
            min="0"
            step="0.01"
          />
        </div>
        <div className="field">
          <label>จำกัดยอดต่อบิล</label>
          <input
            name="maxAmount"
            value={newRestriction.maxAmount}
            onChange={handleRestrictionFieldChange}
            placeholder="เช่น 100"
            type="number"
            min="0"
          />
        </div>
        <div className="field">
          <label>ลดเปอร์เซ็นต์</label>
          <input
            name="discountPercent"
            value={newRestriction.discountPercent}
            onChange={handleRestrictionFieldChange}
            placeholder="เช่น 30"
            type="number"
            min="0"
            step="0.1"
          />
        </div>
        <div className="field">
          <label>ประเภทสูตร</label>
          <select
            name="scope"
            value={newRestriction.scope}
            onChange={handleRestrictionFieldChange}
          >
            <option value="">ทั่วไป</option>
            <option value="three">เลข 3 ตัว</option>
            <option value="two">เลข 2 ตัว</option>
            <option value="double">เลขเบิ้ล</option>
            <option value="run">เลขวิ่ง</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>หมายเหตุ</label>
          <input
            name="note"
            value={newRestriction.note}
            onChange={handleRestrictionFieldChange}
            placeholder="บันทึกเพิ่มเติม"
          />
        </div>
        <button
          className="primary-btn"
          type="submit"
          style={{ gridColumn: "1 / -1" }}
          disabled={savingRestriction}
        >
          {savingRestriction ? "กำลังบันทึก..." : "เพิ่มเลขอั้น"}
        </button>
      </form>
    </div>
  );

  const lotteryResultAdminView = (
    <div className="panel result-admin-panel">
      <div className="result-form-banner">
        <div>
          <div className="chip chip-success">บันทึกผลรางวัล</div>
          <p className="banner-sub">
            กรอกผลรางวัลแต่ละงวด หรือซิงก์ผลอัตโนมัติ
          </p>
        </div>
        {onSyncThaiLottery && (
          <button
            type="button"
            className="sync-btn"
            onClick={() => onSyncThaiLottery()}
            title="ดึงผลหวยไทยล่าสุด"
          >
            รันหวยไทย (ซิงก์อัตโนมัติ)
          </button>
        )}
      </div>
      <form className="result-form-grid" onSubmit={handleResultSubmit}>
        <div className="field">
          <label>เลือกหวย</label>
          <select
            name="lotteryCode"
            value={resultForm.lotteryCode}
            onChange={handleResultFormChange}
          >
            {lotteries.map((lottery) => (
              <option key={lottery.id} value={lottery.id}>
                {lottery.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>วันที่ออกผล</label>
          <input
            type="date"
            name="drawDate"
            value={resultForm.drawDate}
            onChange={handleResultFormChange}
            required
          />
        </div>
        <div className="field">
          <label>รางวัลที่ 1</label>
          <input
            name="firstPrize"
            value={resultForm.firstPrize}
            onChange={handleResultFormChange}
            placeholder="เช่น 123456"
          />
        </div>
        <div className="field">
          <label>เลขหัว 3 ตัว</label>
          <div className="flex-pair">
            <input
              name="frontThreeA"
              value={resultForm.frontThreeA}
              onChange={handleResultFormChange}
              placeholder="เช่น 123"
            />
            <input
              name="frontThreeB"
              value={resultForm.frontThreeB}
              onChange={handleResultFormChange}
              placeholder="เช่น 456"
            />
          </div>
        </div>
        <div className="field">
          <label>เลขท้าย 3 ตัว</label>
          <div className="flex-pair">
            <input
              name="backThreeA"
              value={resultForm.backThreeA}
              onChange={handleResultFormChange}
              placeholder="เช่น 789"
            />
            <input
              name="backThreeB"
              value={resultForm.backThreeB}
              onChange={handleResultFormChange}
              placeholder="เช่น 012"
            />
          </div>
        </div>
        <div className="field">
          <label>เลขท้าย 2 ตัว</label>
          <input
            name="twoDigits"
            value={resultForm.twoDigits}
            onChange={handleResultFormChange}
            placeholder="เช่น 89"
          />
        </div>
        <div className="field">
          <label>หวยลาว - 3 ตัว</label>
          <input
            name="threeDigits"
            value={resultForm.threeDigits}
            onChange={handleResultFormChange}
            placeholder="เช่น 234"
          />
        </div>
        <div className="field">
          <label>เลขข้างเคียง</label>
          <div className="flex-pair">
            <input
              name="nearFirstA"
              value={resultForm.nearFirstA}
              onChange={handleResultFormChange}
              placeholder="เช่น 111111"
            />
            <input
              name="nearFirstB"
              value={resultForm.nearFirstB}
              onChange={handleResultFormChange}
              placeholder="เช่น 111112"
            />
          </div>
        </div>
        <button
          className="primary-btn"
          type="submit"
          style={{ gridColumn: "1 / -1" }}
          disabled={savingResult}
        >
          {savingResult ? "กำลังบันทึก..." : "บันทึกผลรางวัล"}
        </button>
      </form>
      <div className="result-admin-list">
        {Object.entries(resultMap || {}).map(([id, result]) => (
          <div key={id} className="result-admin-card">
            <strong className="result-admin-title">{result.title ?? id}</strong>
            <p className="result-admin-date">
              งวด {formatDrawDateLabel(result.drawDate)}
            </p>
            {result.firstPrize && (
              <p>
                <span>รางวัลที่ 1:</span> {result.firstPrize}
              </p>
            )}
            {result.twoDigits && (
              <p>
                <span>สองตัว:</span> {result.twoDigits}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const announcementView = <NewsPanel announcements={announcements} editable />;
  const ticketVerifyView = (
    <div className="panel">
      <h3>ยืนยันโพยถูกรางวัล (Super Admin)</h3>
      <p className="text-muted">เลือกโพยสถานะรอดำเนินการ แล้วระบุเรตจ่ายเพื่อยืนยันเครดิต</p>
      <div className="scan-panel">
        <div className="scan-header">
          <strong>สแกนโพยตามงวด</strong>
          <span className="text-muted">ต้องบันทึกผลรางวัลก่อนจึงจะสแกนได้</span>
        </div>
        <div className="scan-fields">
          <div className="field">
            <label>เลือกประเภทหวย</label>
            <select
              value={scanLotteryCode}
              onChange={(e) => setScanLotteryCode(e.target.value)}
            >
              {scanLotteryOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>เลือกงวด</label>
            <input
              type="date"
              value={scanDrawDate}
              onChange={(e) => setScanDrawDate(e.target.value)}
            />
          </div>
          <div className="scan-actions">
            <button
              type="button"
              className="primary-btn"
              disabled={!scanHasResult || scanLoading || !onScanTickets}
              onClick={async () => {
                if (!scanHasResult) {
                  showMessage("ต้องบันทึกผลรางวัลก่อนจึงจะสแกนได้");
                  return;
                }
                if (!onScanTickets) {
                  showMessage("ยังไม่พร้อมใช้งานการสแกนโพย");
                  return;
                }
                setScanLoading(true);
                try {
                  const result = await onScanTickets(scanLotteryCode, scanDrawDate);
                  setScanResult(result);
                } catch (err) {
                  console.error(err);
                  showMessage(err?.message || "สแกนโพยไม่สำเร็จ");
                } finally {
                  setScanLoading(false);
                }
              }}
            >
              {scanLoading ? "กำลังสแกน..." : "สแกนโพย"}
            </button>
            <button
              type="button"
              className="secondary-btn ghost"
              disabled={roundSummaryLoading || !onFetchRoundSummary}
              onClick={handleLoadRoundSummary}
            >
              {roundSummaryLoading ? "กำลังโหลดสรุป..." : "โหลดสรุปเลขซื้อ"}
            </button>
            {!scanHasResult && (
              <span className="text-muted">ต้องบันทึกผลรางวัลก่อน</span>
            )}
          </div>
        </div>
        {scanResult && (
          <div className="scan-result">
            <div className="scan-summary">
              <div className="detail-card">
                <small>งวดที่สแกน</small>
                <strong>{formatDrawDateLabel(scanResult.drawDate || scanDrawDate)}</strong>
              </div>
              <div className="detail-card">
                <small>ตรวจสอบทั้งหมด</small>
                <strong>{Number(scanResult.evaluated ?? 0).toLocaleString()}</strong>
              </div>
              <div className="detail-card">
                <small>ถูกรางวัล</small>
                <strong>{Number(scanResult.winners ?? scanWinners.length).toLocaleString()}</strong>
              </div>
              <div className="detail-card">
                <small>เครดิตที่จ่าย</small>
                <strong>{Number(scanResult.totalPayout ?? 0).toLocaleString()}</strong>
              </div>
            </div>
            {scanWinners.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>โพย</th>
                    <th>สมาชิก</th>
                    <th>เลขที่ถูก</th>
                    <th>ยอดแทง</th>
                    <th>เรตจ่าย</th>
                    <th>เครดิตที่จ่าย</th>
                  </tr>
                </thead>
                <tbody>
                  {scanWinners.map((winner) => (
                    <tr key={winner.ticketId}>
                      <td>#{winner.ticketId}</td>
                      <td>{winner.username || winner.userId || "-"}</td>
                      <td>{formatBetNumbers(winner.numbers)}</td>
                      <td>{Number(winner.amount ?? 0).toLocaleString()}</td>
                      <td>{winner.payoutRate != null ? Number(winner.payoutRate).toLocaleString() : "-"}</td>
                      <td>{Number(winner.payoutAmount ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-muted">
                ไม่มีผู้ถูกรางวัล ระบบตั้งค่าไม่ถูกรางวัลอัตโนมัติแล้ว {scanLosersCount.toLocaleString()} รายการ
              </p>
            )}
            {scanWinners.length > 0 && scanLosersCount > 0 && (
              <p className="text-muted">
                ระบบตั้งค่าไม่ถูกรางวัลอัตโนมัติแล้ว {scanLosersCount.toLocaleString()} รายการ
              </p>
            )}
          </div>
        )}
        {roundSummaryError && (
          <p className="text-error">{roundSummaryError}</p>
        )}
        {roundSummary && (
          <div className="scan-result">
            <div className="scan-header">
              <strong>สรุปเลขซื้อรวม</strong>
              <span className="text-muted">
                {(lotteries || []).find((lot) => lot.id === scanLotteryCode)?.name || scanLotteryCode} ·{" "}
                {roundSummaryIsRange ? "ช่วงวันที่" : "งวด"} {roundSummaryDateLabel}
              </span>
            </div>
            <div className="scan-summary">
              <div className="detail-card">
                <small>จำนวนเลข</small>
                <strong>{Number(roundSummaryTotals.totalNumbers ?? 0).toLocaleString()}</strong>
              </div>
              <div className="detail-card">
                <small>รายการรวม</small>
                <strong>{Number(roundSummaryTotals.totalLines ?? 0).toLocaleString()}</strong>
              </div>
              <div className="detail-card">
                <small>ยอดซื้อรวม</small>
                <strong>{Number(roundSummaryTotals.totalAmount ?? 0).toLocaleString()}</strong>
              </div>
            </div>
            {roundSummaryItems.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>เลข</th>
                    <th>ประเภท</th>
                    <th>ยอดซื้อรวม</th>
                    <th>จำนวนรายการ</th>
                    <th>จำนวนผู้ซื้อ</th>
                  </tr>
                </thead>
                <tbody>
                  {roundSummaryItems.map((row) => (
                    <tr key={`${row.betType}-${row.number}`}>
                      <td><strong>{row.number}</strong></td>
                      <td>{payoutOptionMap[row.betType]?.label || row.betType}</td>
                      <td>{Number(row.totalAmount ?? 0).toLocaleString()}</td>
                      <td>{Number(row.ticketCount ?? 0).toLocaleString()}</td>
                      <td>{Number(row.userCount ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-muted">ยังไม่มีเลขที่ซื้อในงวดนี้</p>
            )}
          </div>
        )}
      </div>
      <div className="table-actions" style={{ gap: 8, flexWrap: "wrap" }}>
        {verifyLotteryOptions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`secondary-btn ghost ${verifyLotteryFilter === opt.id ? "active" : ""}`}
            onClick={() => setVerifyLotteryFilter(opt.id)}
          >
            {opt.name}
          </button>
        ))}
      </div>
      <div className="table-actions">
        <input
          type="search"
          className="table-filter"
          placeholder="ค้นหา โพย/สมาชิก/หวย"
          value={searchRestrictions}
          onChange={(e) => setSearchRestrictions(e.target.value)}
        />
        <button
          type="button"
          className="clear-btn"
          onClick={() => setSearchRestrictions("")}
          disabled={!searchRestrictions}
        >
          ล้าง
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>โพย</th>
            <th>สมาชิก</th>
            <th>หวย</th>
            <th>เลข / ประเภท</th>
            <th>เรตตอนซื้อ</th>
            <th>ยอดแทง</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pendingRows
            .filter((row) => verifyLotteryFilter === "all" || row.lotteryId === verifyLotteryFilter)
            .filter((row) => {
              const q = searchRestrictions.trim().toLowerCase();
              if (!q) return true;
              const fields = [
                `#${row.ticketId}`,
                row.member,
                row.lotteryId,
                row.number,
                payoutOptionMap[row.betType]?.label || row.betType
              ].filter(Boolean);
              return fields.some((f) => f.toLowerCase().includes(q));
            })
            .slice(0, 200)
            .map((row) => {
              const buyRate =
                row.buyRate ??
                (row.betType && payoutOptionMap[row.betType]?.rate) ??
                null;
              const isActing = Boolean(ticketActions[row.ticketId]);
              const checked = Boolean(selectedRows[row.rowId]);
              return (
                <tr key={row.rowId}>
                  <td>
                    <label className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setSelectedRows((prev) => ({
                            ...prev,
                            [row.rowId]: e.target.checked
                          }))
                        }
                      />
                      &nbsp;#{row.ticketId}
                    </label>
                  </td>
                  <td>{row.member}</td>
                  <td>{lotteries.find((l) => l.id === row.lotteryId)?.name || row.lotteryId}</td>
                  <td>
                    <strong>{row.number}</strong> · {payoutOptionMap[row.betType]?.label || row.betType || "—"}
                  </td>
                  <td>{buyRate != null ? Number(buyRate).toLocaleString() : "-"}</td>
                  <td>{Number(row.amount ?? 0).toLocaleString()}</td>
                  <td>
                    {isActing ? (
                      <span className="text-muted" style={{ fontSize: 12 }}>
                        กำลังบันทึก...
                      </span>
                    ) : (
                      <div className="ticket-action-row">
                        <button
                        className="secondary-btn ghost small-btn"
                        type="button"
                        onClick={async () => {
                          const ok = window.confirm(`ยืนยันว่าโพย #${row.ticketId} ไม่ถูกรางวัล (เลข ${row.number}) ?`);
                          if (!ok) return;
                          setTicketActions((prev) => ({ ...prev, [row.ticketId]: true }));
                          try {
                            await onRejectTicket?.(row.ticketId, [{ id: row.logId }]);
                            setSelectedRows((prev) => {
                              const next = { ...prev };
                              delete next[row.rowId];
                              return next;
                            });
                          } catch (err) {
                            console.error(err);
                              showMessage("ตั้งค่าไม่ถูกรางวัลไม่สำเร็จ");
                          } finally {
                            setTicketActions((prev) => {
                              const next = { ...prev };
                              delete next[row.ticketId];
                              return next;
                            });
                          }
                        }}
                      >
                        ไม่ถูกรางวัล
                      </button>
                      <button
                          className="primary-btn small-btn"
                          type="button"
                          onClick={async () => {
                            const defaultRate = buyRate ?? "";
                            const input = window.prompt("ระบุเรตจ่าย (ตัวเลข)", defaultRate ? Number(defaultRate) : "");
                            if (input == null) return;
                            const rateNum = Number(input);
                            if (!Number.isFinite(rateNum) || rateNum <= 0) {
                              showMessage("กรุณาระบุเรตเป็นตัวเลขมากกว่า 0");
                              return;
                            }
                            setTicketActions((prev) => ({ ...prev, [row.ticketId]: true }));
                            try {
                              await onConfirmTicket?.(row.ticketId, rateNum, [{ id: row.logId, payoutRate: rateNum }]);
                              setSelectedRows((prev) => {
                                const next = { ...prev };
                                delete next[row.rowId];
                                return next;
                              });
                            } catch (err) {
                              console.error(err);
                              showMessage("ตั้งค่าโพยถูกไม่สำเร็จ");
                          } finally {
                            setTicketActions((prev) => {
                              const next = { ...prev };
                              delete next[row.ticketId];
                              return next;
                            });
                          }
                        }}
                      >
                        ยืนยันโพยถูก
                      </button>
                    </div>
                    )}
                  </td>
                </tr>
              );
            })}
          {(ledger || []).filter((item) => item.status === "pending").length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "#888" }}>
                ไม่มีโพยรอดำเนินการ
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
  const roundNumberSummaryView = (
    <div className="panel">
      <h3>สรุปเลขซื้อรายงวด & ปรับเรตอัตโนมัติ</h3>
      <p className="text-muted">
        ตรวจสอบเลขที่มียอดซื้อสูงในแต่ละงวด และสร้างเลขอั้นเพื่อปรับเรตจ่ายอัตโนมัติ
      </p>
      <div className="scan-panel">
        <div className="scan-fields">
          <div className="field">
            <label>เลือกประเภทหวย</label>
            <select
              value={scanLotteryCode}
              onChange={(e) => setScanLotteryCode(e.target.value)}
            >
              {scanLotteryOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>วันที่เริ่มต้น</label>
            <input
              type="date"
              value={summaryStartDate}
              onChange={(e) => setSummaryStartDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label>วันที่สิ้นสุด</label>
            <input
              type="date"
              value={summaryEndDate}
              onChange={(e) => setSummaryEndDate(e.target.value)}
            />
          </div>
          <div className="scan-actions">
            <button
              type="button"
              className="primary-btn"
              disabled={roundSummaryLoading || !onFetchRoundSummary}
              onClick={handleLoadRoundSummaryRange}
            >
              {roundSummaryLoading ? "กำลังโหลดสรุป..." : "โหลดสรุปเลขซื้อ"}
            </button>
            <button
              type="button"
              className="secondary-btn ghost"
              disabled={payoutRatesLoading || !onFetchPayoutRates}
              onClick={handleLoadPayoutRates}
            >
              {payoutRatesLoading ? "กำลังโหลดเรต..." : "โหลดเรตจ่าย"}
            </button>
          </div>
        </div>
        {payoutRatesError && (
          <p className="text-error">{payoutRatesError}</p>
        )}
        {roundSummaryError && (
          <p className="text-error">{roundSummaryError}</p>
        )}
        {roundSummary && (
          <div className="scan-result">
            <div className="scan-header">
              <strong>สรุปเลขซื้อรวม</strong>
              <span className="text-muted">
                {(lotteries || []).find((lot) => lot.id === scanLotteryCode)?.name || scanLotteryCode} ·{" "}
                {roundSummaryIsRange ? "ช่วงวันที่" : "งวด"} {roundSummaryDateLabel}
              </span>
            </div>
            <div className="scan-summary">
              <div className="detail-card">
                <small>จำนวนเลข</small>
                <strong>{Number(roundSummaryTotals.totalNumbers ?? 0).toLocaleString()}</strong>
              </div>
              <div className="detail-card">
                <small>รายการรวม</small>
                <strong>{Number(roundSummaryTotals.totalLines ?? 0).toLocaleString()}</strong>
              </div>
              <div className="detail-card">
                <small>ยอดซื้อรวม</small>
                <strong>{Number(roundSummaryTotals.totalAmount ?? 0).toLocaleString()}</strong>
              </div>
            </div>
            <div className="table-actions" style={{ marginBottom: 8 }}>
              <input
                type="search"
                className="table-filter"
                placeholder="ค้นหาเลข/ประเภท"
                value={summaryFilter}
                onChange={(e) => setSummaryFilter(e.target.value)}
              />
              <select
                className="table-filter"
                value={summarySortKey}
                onChange={(e) => setSummarySortKey(e.target.value)}
              >
                <option value="totalAmount">เรียงตามยอดซื้อรวม</option>
                <option value="number">เรียงตามเลข</option>
                <option value="betType">เรียงตามประเภท</option>
                <option value="ticketCount">เรียงตามจำนวนรายการ</option>
                <option value="userCount">เรียงตามจำนวนผู้ซื้อ</option>
              </select>
              <select
                className="table-filter"
                value={summarySortDir}
                onChange={(e) => setSummarySortDir(e.target.value)}
              >
                <option value="desc">มาก → น้อย</option>
                <option value="asc">น้อย → มาก</option>
              </select>
              <button
                type="button"
                className="clear-btn"
                onClick={() => setSummaryFilter("")}
                disabled={!summaryFilter}
              >
                ล้าง
              </button>
              <span className="text-muted">
                แสดง {filteredRoundSummaryItems.length.toLocaleString()} จาก {roundSummaryItems.length.toLocaleString()}
              </span>
            </div>
            {filteredRoundSummaryItems.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>เลข</th>
                    <th>ประเภท</th>
                    <th>ยอดซื้อรวม</th>
                    <th>จำนวนรายการ</th>
                    <th>จำนวนผู้ซื้อ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoundSummaryItems.map((row) => (
                    <tr key={`${row.betType}-${row.number}`}>
                      <td><strong>{row.number}</strong></td>
                      <td>{payoutOptionMap[row.betType]?.label || row.betType}</td>
                      <td>{Number(row.totalAmount ?? 0).toLocaleString()}</td>
                      <td>{Number(row.ticketCount ?? 0).toLocaleString()}</td>
                      <td>{Number(row.userCount ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-muted">
                {roundSummaryItems.length
                  ? "ไม่พบข้อมูลตามตัวกรอง"
                  : roundSummaryIsRange
                    ? "ยังไม่มีเลขที่ซื้อในช่วงวันที่นี้"
                    : "ยังไม่มีเลขที่ซื้อในงวดนี้"}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="scan-panel" style={{ marginTop: 16 }}>
        <div className="scan-header">
          <strong>กฎปรับเรตอัตโนมัติ</strong>
          <span className="text-muted">ระบบจะสร้างเลขอั้นสำหรับเลขที่เข้าเงื่อนไข</span>
        </div>
        <div className="grid two-column" style={{ marginTop: 12 }}>
          <div className="field">
            <label>เกณฑ์ยอดซื้อรวม (บาท)</label>
            <input
              type="number"
              min="0"
              value={autoThreshold}
              onChange={(e) => setAutoThreshold(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>ปรับเรตเป็นสัดส่วน (เช่น 0.5 = ครึ่งนึง)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={autoRateFactor}
              onChange={(e) => setAutoRateFactor(Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>ประเภทที่ใช้กฎ</label>
            <div className="table-actions" style={{ gap: 10, flexWrap: "wrap" }}>
              {autoBetTypeOptions.map((opt) => {
                const checked = autoBetTypes.includes(opt.id);
                return (
                  <label key={opt.id} className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setAutoBetTypes((prev) =>
                          e.target.checked
                            ? Array.from(new Set([...prev, opt.id]))
                            : prev.filter((id) => id !== opt.id)
                        );
                      }}
                    />
                    &nbsp;{opt.label}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <div className="scan-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="primary-btn"
            disabled={autoApplying}
            onClick={handleApplyAutoRestrictions}
          >
            {autoApplying ? "กำลังปรับเรต..." : `ปรับเรตอัตโนมัติ (${autoSummary.ready} รายการ)`}
          </button>
          <span className="text-muted">
            เลขที่มีเลขอั้นแล้วจะไม่ถูกสร้างซ้ำ
          </span>
        </div>
      </div>
      <div className="scan-panel" style={{ marginTop: 16 }}>
        <div className="scan-header">
          <strong>เลขที่เข้าเงื่อนไข</strong>
          <span className="text-muted">
            ทั้งหมด {autoSummary.total.toLocaleString()} · พร้อมปรับ {autoSummary.ready.toLocaleString()} · มีเลขอั้นแล้ว {autoSummary.already.toLocaleString()}
          </span>
        </div>
        {autoCandidates.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>เลข</th>
                <th>ประเภท</th>
                <th>ยอดซื้อรวม</th>
                <th>จำนวนรายการ</th>
                <th>เรตเดิม</th>
                <th>เรตใหม่</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {autoCandidates.map((item) => (
                <tr key={`${item.betType}-${item.number}`}>
                  <td><strong>{item.number}</strong></td>
                  <td>{payoutOptionMap[item.betType]?.label || item.betType}</td>
                  <td>{Number(item.totalAmount ?? 0).toLocaleString()}</td>
                  <td>{Number(item.ticketCount ?? 0).toLocaleString()}</td>
                  <td>{item.baseRate != null ? Number(item.baseRate).toLocaleString() : "-"}</td>
                  <td>{item.newRate != null ? Number(item.newRate).toLocaleString() : "-"}</td>
                  <td>
                    {item.hasRestriction
                      ? "มีเลขอั้นแล้ว"
                      : item.newRate == null
                        ? "ไม่มีเรตฐาน"
                        : "พร้อมปรับ"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted">ยังไม่มีเลขที่เข้าเงื่อนไข</p>
        )}
      </div>
    </div>
  );
  const supportView = (
    <div className="panel support-panel">
      <h3>ศูนย์ช่วยเหลือ</h3>
      <div className="support-layout">
        <div className="support-thread-list">
          {(supportThreads ?? []).map((thread) => (
            <button
              key={thread.id ?? thread.username}
              type="button"
              className={supportActiveUser === thread.username ? "active" : ""}
              onClick={() => onSelectSupportThread?.(thread.username)}
            >
              <strong>{thread.username ?? thread.user_id}</strong>
              <small>
                {thread.updated_at
                  ? new Date(thread.updated_at).toLocaleString("th-TH")
                  : "—"}
              </small>
            </button>
          ))}
          {!supportThreads?.length && <p>ยังไม่มีข้อความใหม่</p>}
        </div>
        <div className="support-thread-detail">
          {supportActiveUser ? (
            <>
              <div className="chat-window">
                {supportLoading && <p>กำลังโหลด...</p>}
                {(supportMessages ?? []).map((msg) => (
                  <div
                    key={msg.id}
                    className={`chat-bubble ${
                      msg.sender === "admin" ? "admin" : "user"
                    }`}
                  >
                    <p>{msg.message}</p>
                    <small>
                      {new Date(msg.created_at ?? msg.createdAt).toLocaleString(
                        "th-TH"
                      )}
                    </small>
                  </div>
                ))}
                {!supportMessages?.length && !supportLoading && (
                  <p>ยังไม่มีข้อความ</p>
                )}
              </div>
              <form
                className="chat-input"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!adminReply.trim()) return;
                  onReplySupport?.(supportActiveUser, adminReply.trim());
                  setAdminReply("");
                }}
              >
                <textarea
                  rows={3}
                  value={adminReply}
                  onChange={(e) => setAdminReply(e.target.value)}
                  placeholder="ตอบกลับผู้ใช้"
                />
                <button
                  className="primary-btn"
                  type="submit"
                  disabled={!adminReply.trim()}
                >
                  ส่งข้อความ
                </button>
              </form>
            </>
          ) : (
            <p>เลือกสมาชิกด้านซ้ายเพื่อดูบทสนทนา</p>
          )}
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case "members":
        return membersView;
      case "member-create":
        return memberCreateView;
      case "credit":
        return creditView;
      case "credit-topup":
        return creditTopupView;
      case "approvals":
        return approvalView;
      case "credit-history":
        return creditHistoryView;
      case "income":
        return incomeView;
      case "cash":
        return directMembersView;
      case "history":
        return historyView;
      case "settings":
        return settingsView;
      case "direct-members":
        return directMembersView;
      case "direct-agent":
        return directAgentsView;
      case "lottery-control":
        return lotteryControlView;
      case "lottery-numbers":
        return lotteryNumbersView;
      case "lottery-results":
        return lotteryResultAdminView;
      case "lottery-rounds":
        return (
          <AdminLotteryRoundsPanel lotteries={lotteries} onSaved={onRefresh} />
        );
      case "ticket-verify":
        return ticketVerifyView;
      case "round-number-summary":
        return roundNumberSummaryView;
      case "announcements":
        return announcementView;
      case "support":
        return supportView;
      default:
        return overview;
    }
  };

  return (
    <>
      <div className="dashboard">{renderContent()}</div>
      {messageModal && (
        <div className="modal-backdrop">
          <div className="modal small-modal">
            <div className="modal-header">
              <strong>{messageModal.title || "แจ้งเตือน"}</strong>
            </div>
            <div className="modal-body">
              <p>{messageModal.message}</p>
            </div>
            <div className="modal-footer" style={{ justifyContent: "flex-end" }}>
              <button className="primary-btn" type="button" onClick={() => setMessageModal(null)}>
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CashFlowPanel({
  initialTab = "deposit",
  allowToggle = true,
  audience = "สมาชิก",
}) {
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  return (
    <div>
      <p className="cashflow-meta">สำหรับ{audience}</p>
      {allowToggle ? (
        <div className="tabs">
          <button
            onClick={() => setTab("deposit")}
            className={tab === "deposit" ? "active" : ""}
          >
            ฝากตรง
          </button>
          <button
            onClick={() => setTab("withdraw")}
            className={tab === "withdraw" ? "active" : ""}
          >
            ถอนตรง
          </button>
        </div>
      ) : (
        <div className="cashflow-chip">
          {tab === "deposit" ? "โหมดฝาก" : "โหมดถอน"}
        </div>
      )}
      <div className="field">
        <label>ยอดเงิน</label>
        <input type="number" defaultValue={1000} />
      </div>
      <div className="field">
        <label>รายละเอียด</label>
        <input
          type="text"
          placeholder={
            tab === "deposit"
              ? "เช่น ฝากผ่าน Mobile Banking"
              : "เช่น ถอนเข้าธนาคาร"
          }
        />
      </div>
      <button
        className="primary-btn"
        type="button"
        onClick={() => showMessage("โหมดสาธิต: ยังไม่เชื่อมต่อระบบ")}
      >
        {tab === "deposit" ? "ยืนยันฝาก" : "ยืนยันถอน"}
      </button>
    </div>
  );
}

function LotterySettings({ settings, onSave }) {
  const [form, setForm] = useState({
    autoCloseBeforeMinutes: 15,
    defaultMinBet: 5,
    defaultMaxBet: 20000,
    maintenanceMode: false,
    noticeMessage: "",
    depositNotice: "ติดต่อ Admin ของระบบเพื่อยืนยันการฝาก",
    depositLineUrl: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        autoCloseBeforeMinutes: settings.autoCloseBeforeMinutes ?? 15,
        defaultMinBet: settings.defaultMinBet ?? 5,
        defaultMaxBet: settings.defaultMaxBet ?? 20000,
        maintenanceMode: settings.maintenanceMode ?? false,
        noticeMessage: settings.noticeMessage ?? "",
        depositNotice: settings.depositNotice ?? "ติดต่อ Admin ของระบบเพื่อยืนยันการฝาก",
        depositLineUrl: settings.depositLineUrl ?? "",
      });
    }
  }, [settings]);

  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave?.({
        ...form,
        autoCloseBeforeMinutes: Number(form.autoCloseBeforeMinutes),
        defaultMinBet: Number(form.defaultMinBet),
        defaultMaxBet: Number(form.defaultMaxBet),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="two-column" onSubmit={handleSubmit}>
      <div className="field">
        <label>ปิดรอบก่อนเวลารับแทง (นาที)</label>
        <input
          name="autoCloseBeforeMinutes"
          type="number"
          value={form.autoCloseBeforeMinutes}
          onChange={handleChange}
          min="1"
        />
      </div>
      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label>ลิงก์ LINE สำหรับปุ่มติดต่อ</label>
        <input
          name="depositLineUrl"
          type="url"
          value={form.depositLineUrl}
          onChange={handleChange}
          placeholder="https://line.me/..."
        />
      </div>
      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label>ข้อความหน้าฝากเครดิต (แจ้งลูกค้า)</label>
        <textarea
          name="depositNotice"
          rows={2}
          value={form.depositNotice}
          onChange={handleChange}
          placeholder="ติดต่อ Admin ของระบบเพื่อยืนยันการฝาก"
        />
      </div>
      <div className="field">
        <label>สถานะระบบ</label>
        <select
          name="maintenanceMode"
          value={form.maintenanceMode ? "down" : "up"}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              maintenanceMode: e.target.value === "down",
            }))
          }
        >
          <option value="up">ออนไลน์</option>
          <option value="down">ปิดปรับปรุง</option>
        </select>
      </div>
      <div className="field">
        <label>ขั้นต่ำ</label>
        <input
          name="defaultMinBet"
          type="number"
          value={form.defaultMinBet}
          onChange={handleChange}
          min="1"
        />
      </div>
      <div className="field">
        <label>สูงสุด</label>
        <input
          name="defaultMaxBet"
          type="number"
          value={form.defaultMaxBet}
          onChange={handleChange}
          min="1"
        />
      </div>
      <div className="field" style={{ gridColumn: "1 / -1", marginTop: 10 }}>
        <label>ข้อความแจ้งเตือน Pop-up</label>
        <textarea
          name="noticeMessage"
          rows={3}
          value={form.noticeMessage}
          onChange={handleChange}
          placeholder="พิมพ์ข้อความที่จะให้แสดงหน้าลูกค้า"
        />
      </div>
      <button className="primary-btn" type="submit" disabled={saving}>
        {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
      </button>
    </form>
  );
}
