import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CountdownBadge from "./CountdownBadge";
import {
  betStepMap,
  betSteps,
  payoutOptionMap,
  payoutOptions,
  purchaseTabs,
} from "../constants/purchaseOptions";
import {
  generatePermutations,
  generateRandomNumbers,
  padNumber,
} from "../utils/lotteryHelpers";

const fallbackPromotions = [
  {
    code: "normal-full",
    title: "จ่ายปกติ",
    description: "รับอัตราจ่ายเต็มทุกรายการ",
    discount_percent: 0,
  },
];

export default function PurchaseForm({
  onSubmit,
  lotteries,
  initialLotteryId,
  promotions = [],
  lockedLotteryId,
  lockedPromotionCode,
  onChangeSelection,
  availableCredit = Infinity,
  onOpenDeposit,
}) {
  const [lotteryId, setLotteryId] = useState(
    () => lockedLotteryId || initialLotteryId || lotteries[0]?.id || ""
  );
  const [mode, setMode] = useState("panel");
  const [category, setCategory] = useState("three");
  const [activeBetTypes, setActiveBetTypes] = useState(() => [
    payoutOptions.three[0].id,
  ]);
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [manualDigits, setManualDigits] = useState("");
  const [ticketItems, setTicketItems] = useState([]);
  const [lastSubmission, setLastSubmission] = useState(null);
  const [amountPerBet, setAmountPerBet] = useState("1");
  const [activeBlock, setActiveBlock] = useState(0);
  const [bulkPriceInput, setBulkPriceInput] = useState("");
  const [showPriceEditor, setShowPriceEditor] = useState(false);
  const [toast, setToast] = useState(null);
  const [quickAdd, setQuickAdd] = useState(true);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [laoFilters, setLaoFilters] = useState({
    highLow: null,
    parity: null,
    quick: null,
  });
  const [options, setOptions] = useState({
    reverse: false,
    randomFive: false,
  });
  const [creditError, setCreditError] = useState("");
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);

  const selectedLottery =
    lotteries.find((lottery) => lottery.id === lotteryId) || lotteries[0];
  const filteredPayoutOptions = useMemo(() => {
    const allowedId = selectedLottery?.id;
    return Object.entries(payoutOptions).reduce((acc, [key, list]) => {
      acc[key] = list.filter((option) => {
        if (!option.lotteries || option.lotteries.length === 0) {
          return true;
        }
        return allowedId ? option.lotteries.includes(allowedId) : false;
      });
      return acc;
    }, {});
  }, [selectedLottery?.id]);
  const isLaoLottery = selectedLottery?.id === "lao-lottery";
  const effectivePromotions =
    promotions && promotions.length ? promotions : fallbackPromotions;
  const promotionCodes = useMemo(
    () => new Set((promotions || []).map((promo) => promo.code)),
    [promotions]
  );
  const [selectedPromotion, setSelectedPromotion] = useState(
    () => lockedPromotionCode ?? effectivePromotions?.[0]?.code ?? null
  );
  const activePromotion =
    effectivePromotions.find((promo) => promo.code === selectedPromotion) ||
    effectivePromotions[0] ||
    null;
  const hasPromotions = effectivePromotions?.length > 0;
  const availableSteps = betSteps;
  const selectionLocked = Boolean(lockedLotteryId);
  const promotionLocked = Boolean(lockedPromotionCode);
  const canResetSelection = typeof onChangeSelection === "function";
  const closeDate = selectedLottery?.closeTime
    ? new Date(selectedLottery.closeTime)
    : null;
  const openDate = selectedLottery?.openTime
    ? new Date(selectedLottery.openTime)
    : null;
  const isLotteryOpen = selectedLottery?.status === "open";
  const statusText = isLotteryOpen ? "เปิดรับแทง" : "ปิดรับรอบนี้แล้ว";
  const closeLabel = closeDate
    ? closeDate.toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";
  const openLabel = openDate
    ? openDate.toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  useEffect(() => {
    if (!effectivePromotions?.length) return;
    setSelectedPromotion((prev) => {
      if (
        lockedPromotionCode &&
        effectivePromotions.some((promo) => promo.code === lockedPromotionCode)
      ) {
        return lockedPromotionCode;
      }
      if (effectivePromotions.some((promo) => promo.code === prev)) {
        return prev;
      }
      return effectivePromotions[0]?.code ?? null;
    });
  }, [effectivePromotions, lockedPromotionCode]);

  useEffect(() => {
    if (!availableSteps.some((step) => step.id === category)) {
      setCategory(availableSteps[0].id);
    }
  }, [availableSteps, category]);

  const stepConfig = betStepMap[category];
  const payoutList = filteredPayoutOptions[category] || [];
  const manualLimit = stepConfig?.digits ?? 0;
  const manualReady = manualDigits.length === manualLimit && manualLimit > 0;

  useEffect(() => {
    if (lockedLotteryId) {
      setLotteryId(lockedLotteryId);
    }
  }, [lockedLotteryId]);

  useEffect(() => {
    if (!lotteries.length || lockedLotteryId) return;
    if (!lotteryId) {
      setLotteryId(initialLotteryId || lotteries[0].id);
    }
  }, [lotteries, lotteryId, initialLotteryId, lockedLotteryId]);

  useEffect(() => {
    if (initialLotteryId && !lockedLotteryId) {
      setLotteryId(initialLotteryId);
    }
  }, [initialLotteryId, lockedLotteryId]);

  useEffect(() => {
    const allowed = payoutList ?? [];
    setActiveBetTypes((prev) => {
      const valid = prev.filter((id) => allowed.some((item) => item.id === id));
      if (valid.length) return valid;
      return allowed.length ? [allowed[0].id] : [];
    });
    setSelectedNumbers([]);
    setManualDigits("");
    setActiveBlock(0);
  }, [category, payoutList]);

  useEffect(() => {
    setSelectedNumbers([]);
    setManualDigits("");
    setActiveBlock(0);
  }, [mode]);

  const boardNumbers = useMemo(() => {
    if (!stepConfig || mode === "manual") return [];
    if (stepConfig.boardType === "three") {
      const start = activeBlock * 100;
      return Array.from({ length: 100 }, (_, idx) => padNumber(start + idx, 3));
    }
    if (stepConfig.boardType === "two") {
      return Array.from({ length: 100 }, (_, idx) => padNumber(idx, 2));
    }
    if (stepConfig.boardType === "run") {
      return Array.from({ length: 10 }, (_, idx) => idx.toString());
    }
    return [];
  }, [stepConfig, activeBlock, mode]);

  const filteredBoardNumbers = useMemo(() => {
    if (!stepConfig || mode === "manual") return [];
    let numbers = boardNumbers;
    if (isLaoLottery && mode === "panel" && stepConfig.digits >= 1) {
      if (laoFilters.highLow) {
        const threshold =
          stepConfig.digits === 3 ? 500 : stepConfig.digits === 2 ? 50 : 5;
        numbers = numbers.filter((num) => {
          const value = Number(num);
          return laoFilters.highLow === "high"
            ? value >= threshold
            : value < threshold;
        });
      }
      if (laoFilters.parity) {
        numbers = numbers.filter((num) => {
          const tail = Number(num[num.length - 1]);
          return laoFilters.parity === "even" ? tail % 2 === 0 : tail % 2 !== 0;
        });
      }
      if (laoFilters.quick) {
        numbers = numbers.filter((num) => {
          const value = Number(num);
          switch (laoFilters.quick) {
            case "high":
              return (
                value >=
                (stepConfig.digits === 4
                  ? 5000
                  : stepConfig.digits === 3
                  ? 500
                  : 50)
              );
            case "low":
              return (
                value <
                (stepConfig.digits === 4
                  ? 5000
                  : stepConfig.digits === 3
                  ? 500
                  : 50)
              );
            case "even":
              return value % 2 === 0;
            case "odd":
              return value % 2 === 1;
            default:
              return true;
          }
        });
      }
    }
    return numbers;
  }, [boardNumbers, isLaoLottery, laoFilters, mode, stepConfig]);

  useEffect(() => {
    if (mode !== "panel" || !options.randomFive) return;
    if (!stepConfig) return;
    const pool =
      filteredBoardNumbers.length > 0
        ? filteredBoardNumbers
        : Array.from({ length: 10 ** stepConfig.digits }, (_, idx) =>
            padNumber(idx, stepConfig.digits)
          );
    setSelectedNumbers(
      generateRandomNumbers(Math.min(5, pool.length), stepConfig.digits, pool)
    );
  }, [options.randomFive, filteredBoardNumbers, stepConfig, mode]);

  useEffect(() => {
    if (mode === "panel") return;
    setOptions((prev) => ({ ...prev, randomFive: false }));
  }, [mode]);

  useEffect(() => {
    if (!isLaoLottery || mode !== "panel") {
      setLaoFilters({ highLow: null, parity: null, quick: null });
    }
  }, [isLaoLottery, mode, category]);

  useEffect(() => {
    if (showPriceEditor && ticketItems.length === 0) {
      setShowPriceEditor(false);
    }
  }, [showPriceEditor, ticketItems.length]);
  useEffect(() => {
    if (quickAdd) {
      setSelectedNumbers([]);
      setManualDigits("");
    }
  }, [quickAdd]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  const hasSelection = manualReady || selectedNumbers.length > 0;
  const selectionCount = manualReady ? 1 : selectedNumbers.length;
  const displaySelectionCount =
    ticketItems.length + (hasSelection ? selectionCount : 0);
  const amountPerBetValue = Math.max(0, Number(amountPerBet) || 0);
  const hasTicketItems = ticketItems.length > 0;
  const hasValidAmounts =
    hasTicketItems && ticketItems.every((item) => Number(item.amount) > 0);

  const promotionCodeForPayload = promotionCodes.has(activePromotion?.code)
    ? activePromotion?.code
    : null;
  const grossAmount = useMemo(
    () =>
      ticketItems.reduce((sum, item) => {
        const value =
          Number(item.amount) > 0 ? Number(item.amount) : amountPerBetValue;
        return sum + value;
      }, 0),
    [ticketItems, amountPerBetValue]
  );
  const discountPercent = promotionCodeForPayload
    ? Number(activePromotion?.discount_percent ?? 0)
    : 0;
  const computeNetAmount = useCallback(
    (gross) => Math.max(0, gross * (1 - discountPercent / 100)),
    [discountPercent]
  );
  const pendingNumbers = useMemo(() => {
    if (!hasSelection || !stepConfig) return [];
    const baseNumbers =
      mode === "manual"
        ? manualReady
          ? [manualDigits]
          : []
        : selectedNumbers;
    if (!baseNumbers.length) return [];
    return expandWithOptions(baseNumbers);
  }, [
    hasSelection,
    manualDigits,
    manualReady,
    mode,
    selectedNumbers,
    stepConfig,
    options.reverse,
  ]);
  const effectiveBetTypes = useMemo(() => {
    const fallbackList = filteredPayoutOptions[category] ?? [];
    if (activeBetTypes.length) return activeBetTypes;
    return fallbackList.slice(0, 1).map((item) => item.id);
  }, [activeBetTypes, filteredPayoutOptions, category]);
  const pendingGrossAmount = useMemo(() => {
    if (!pendingNumbers.length) return 0;
    return pendingNumbers.length * effectiveBetTypes.length * amountPerBetValue;
  }, [pendingNumbers.length, effectiveBetTypes.length, amountPerBetValue]);
  const effectiveGrossAmount = hasTicketItems ? grossAmount : pendingGrossAmount;
  const totalAmount = useMemo(
    () => computeNetAmount(effectiveGrossAmount),
    [computeNetAmount, effectiveGrossAmount]
  );
  const normalizedAvailableCredit = Number.isFinite(Number(availableCredit))
    ? Math.max(0, Number(availableCredit))
    : Infinity;
  const canSubmit =
    isLotteryOpen &&
    (hasTicketItems
      ? hasValidAmounts || amountPerBetValue > 0
      : hasSelection && amountPerBetValue > 0);
  const quickAddLabel =
    mode === "manual" ? "พิมพ์ครบแล้วเพิ่มทันที" : "แตะเลขแล้วเพิ่มทันที";

  function toggleNumber(value) {
    if (quickAdd) {
      addNumbersToTicket([value], { announce: true });
      return;
    }
    setSelectedNumbers((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value]
    );
  }

  function handleFastPick() {
    if (!stepConfig) return;
    if (mode === "manual") {
      if (!manualLimit) return;
      const max = 10 ** manualLimit;
      const randomValue = padNumber(
        Math.floor(Math.random() * max),
        manualLimit
      );
      setManualDigits(randomValue);
      return;
    }
    const pool =
      filteredBoardNumbers.length > 0
        ? filteredBoardNumbers
        : Array.from({ length: 10 ** stepConfig.digits }, (_, idx) =>
            padNumber(idx, stepConfig.digits)
          );
    setSelectedNumbers(
      generateRandomNumbers(Math.min(10, pool.length), stepConfig.digits, pool)
    );
  }

  function expandWithOptions(numbers) {
    let payload = [...numbers];
    if (options.reverse && stepConfig?.digits > 1) {
      payload = payload.flatMap((num) => generatePermutations(num));
    }
    return Array.from(new Set(payload));
  }

  function createItems(numbers) {
    if (!stepConfig) return [];
    if (!numbers.length) return [];
    const expanded = expandWithOptions(numbers);
    const payoutList = filteredPayoutOptions[category] ?? [];
    const effectiveBetTypes =
      (activeBetTypes.length
        ? activeBetTypes
        : payoutList.slice(0, 1).map((item) => item.id)) ?? [];
    const perBetAmount = Math.max(0, Number(amountPerBet) || 0);
    const betTypeLabelMap = Object.values(payoutOptionMap).reduce((acc, opt) => {
      acc[opt.id] = opt.label;
      return acc;
    }, {});
    return expanded.flatMap((num) =>
      effectiveBetTypes.map((betTypeId) => ({
        id: `${num}-${betTypeId}-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`,
        number: num,
        category,
        betType: betTypeId,
        betTypeLabel: betTypeLabelMap[betTypeId],
        amount: perBetAmount,
        mode,
      }))
    );
  }

  function gatherNumbersForSelection() {
    if (!stepConfig) return [];
    let numbers = [];
    if (mode === "manual") {
      if (!manualReady) return [];
      numbers = [manualDigits];
    } else {
      numbers = selectedNumbers;
    }
    if (!numbers.length && options.randomFive && mode === "panel") {
      numbers = generateRandomNumbers(5, stepConfig?.digits ?? 3, boardNumbers);
    }
    return numbers;
  }

  const resetSelection = useCallback(() => {
    setSelectedNumbers([]);
    setManualDigits("");
  }, []);

  const handleReset = useCallback(() => {
    resetSelection();
    setTicketItems([]);
    setBulkPriceInput("");
    setAmountPerBet("1");
    setActiveBetTypes([payoutOptions[category]?.[0]?.id].filter(Boolean));
    setOptions({ reverse: false, randomFive: false });
    setLaoFilters({ highLow: null, parity: null, quick: null });
    setActiveBlock(0);
    setShowPriceEditor(false);
  }, [category, resetSelection]);

  function handleAddSelection() {
    const numbers = gatherNumbersForSelection();
    if (!numbers.length) return;
    const added = addNumbersToTicket(numbers, { announce: true });
    if (added) {
      resetSelection();
    }
  }

  function addNumbersToTicket(numbers, { announce } = {}) {
    const nextItems = createItems(numbers);
    if (!nextItems.length) return false;
    const additionGross = nextItems.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );
    if (
      Number.isFinite(normalizedAvailableCredit) &&
      computeNetAmount(grossAmount + additionGross) >
        normalizedAvailableCredit + 1e-6
    ) {
      const msg = `ยอดที่ต้องใช้ ${computeNetAmount(
        grossAmount + additionGross
      ).toLocaleString()}  แต่เครดิตคงเหลือ ${normalizedAvailableCredit.toLocaleString()} `;
      setCreditError(msg);
      setIsCreditModalOpen(true);
      return false;
    }
    setCreditError("");
    setTicketItems((prev) => [...prev, ...nextItems]);
    if (announce) {
      const message =
        numbers.length === 1
          ? `เพิ่มเลข ${numbers[0]} แล้ว`
          : `เพิ่ม ${numbers.length} เลขแล้ว`;
      setToast({
        id: Date.now(),
        message,
      });
    }
    return true;
  }

  function handleTogglePriceEditor() {
    if (!ticketItems.length && hasSelection) {
      handleAddSelection();
      setShowPriceEditor(true);
      return;
    }
    if (amountPerBetValue > 0 && ticketItems.length) {
      setTicketItems((prev) =>
        prev.map((item) =>
          Number(item.amount) > 0
            ? item
            : { ...item, amount: amountPerBetValue }
        )
      );
    }
    setShowPriceEditor((prev) => !prev);
  }

  const handleItemAmountChange = useCallback((id, value) => {
    const nextAmount = Number(String(value).replace(/[^0-9.]/g, "")) || 0;
    setTicketItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, amount: nextAmount } : item
      )
    );
  }, []);

  const handleBulkAmount = useCallback((value) => {
    const nextAmount = Number(String(value).replace(/[^0-9.]/g, "")) || 0;
    setTicketItems((prev) =>
      prev.map((item) => ({ ...item, amount: nextAmount }))
    );
    setAmountPerBet(nextAmount ? String(nextAmount) : "");
    setBulkPriceInput(nextAmount ? String(nextAmount) : "");
  }, []);

  async function handleSubmitTickets() {
    if (!isLotteryOpen) {
      alert("หวยปิดรับแทงชั่วคราว");
      return;
    }
    let itemsToSend = ticketItems;
    if (!itemsToSend.length) {
      const numbers = gatherNumbersForSelection();
      const generated = createItems(numbers);
      if (!generated.length) return;
      itemsToSend = generated;
    }
    const normalizedItems = itemsToSend.map((item) => ({
      ...item,
      amount: Number(item.amount) > 0 ? item.amount : amountPerBetValue,
    }));
    if (!normalizedItems.every((item) => Number(item.amount) > 0)) {
      return;
    }
    const bets = normalizedItems.map((item) => item.number);
    const grossTotal = normalizedItems.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );
    const netTotal = computeNetAmount(grossTotal);
    const payoutList = filteredPayoutOptions[category] ?? [];
    const effectiveBetTypes =
      (activeBetTypes.length
        ? activeBetTypes
        : payoutList.slice(0, 1).map((item) => item.id)) ?? [];
    const payload = {
      lotteryId: lotteryId || lotteries[0]?.id,
      bets,
      amount: grossTotal,
      promotionCode: promotionCodeForPayload,
      meta: {
        grossAmount: grossTotal,
        netAmount: netTotal,
        betTypes: effectiveBetTypes,
        category,
        items: normalizedItems,
        options,
        promotion: promotionCodeForPayload ? activePromotion : null,
      },
    };
    if (
      Number.isFinite(normalizedAvailableCredit) &&
      netTotal > normalizedAvailableCredit + 1e-6
    ) {
      const msg = `ยอดที่ต้องใช้ ${netTotal.toLocaleString()}  แต่เครดิตคงเหลือ ${normalizedAvailableCredit.toLocaleString()} `;
      setCreditError(msg);
      setIsCreditModalOpen(true);
      return;
    }
    try {
      await onSubmit(payload);
      setLastSubmission({
        id: Date.now(),
        createdAt: new Date().toISOString(),
        lottery: selectedLottery?.name ?? "",
        total: netTotal,
        betTypes: effectiveBetTypes,
        category,
        items: normalizedItems,
      });
      setTicketItems([]);
      resetSelection();
      setBulkPriceInput("");
      setCreditError("");
    } catch (err) {
      console.error(err);
    }
  }

  function removeTicket(id) {
    setTicketItems((prev) => prev.filter((item) => item.id !== id));
  }

  function handleManualDigit(value) {
    if (!stepConfig) return;
    if (manualDigits.length >= manualLimit) return;
    const nextValue = `${manualDigits}${value}`;
    if (quickAdd && nextValue.length === manualLimit) {
      const added = addNumbersToTicket([nextValue], { announce: true });
      if (!added) {
        setManualDigits(nextValue);
        return;
      }
      setManualDigits("");
      return;
    }
    setManualDigits(nextValue);
  }

  function handleManualClear() {
    setManualDigits("");
  }

  function handleManualBackspace() {
    setManualDigits((prev) => prev.slice(0, -1));
  }

  function toggleBetType(optionId) {
    setActiveBetTypes((prev) => {
      if (prev.includes(optionId)) {
        return prev.filter((id) => id !== optionId);
      }
      return [...prev, optionId];
    });
  }

  const blockButtons = useMemo(() => {
    if (!stepConfig || mode === "manual") return [];
    if (stepConfig.boardType === "three") {
      return Array.from({ length: 10 }, (_, idx) => ({
        label: padNumber(idx * 100, 3),
        value: idx,
      }));
    }
    return [];
  }, [stepConfig, mode]);

  function addRepeatingNumbers() {
    if (mode !== "panel" || !stepConfig || stepConfig.digits < 2) return;
    const combos = Array.from({ length: 10 }, (_, digit) =>
      String(digit).repeat(stepConfig.digits)
    );
    setSelectedNumbers((prev) => {
      const set = new Set(prev);
      combos.forEach((value) => set.add(value));
      return Array.from(set);
    });
  }

  function toggleLaoFilter(type, value) {
    setLaoFilters((prev) => ({
      ...prev,
      [type]: prev[type] === value ? null : value,
    }));
  }

  const showAutoCreditWarning =
    !creditError &&
    Number.isFinite(normalizedAvailableCredit) &&
    totalAmount > normalizedAvailableCredit + 1e-6
      ? `ยอดรวม ${totalAmount.toLocaleString()}  เกินเครดิตคงเหลือ ${normalizedAvailableCredit.toLocaleString()} `
      : "";
  const priceWarning =
    hasTicketItems && !hasValidAmounts && amountPerBetValue <= 0
      ? "กรุณาใส่ราคาให้ครบทุกเลข หรือระบุราคาต่อเลข"
      : "";
  const creditWarning = creditError || showAutoCreditWarning;
  const purchaseWarning = creditWarning || priceWarning;

  useEffect(() => {
    if (
      creditError &&
      computeNetAmount(grossAmount) <= normalizedAvailableCredit + 1e-6
    ) {
      setCreditError("");
    }
  }, [creditError, computeNetAmount, grossAmount, normalizedAvailableCredit]);

  const toastMarkup =
    toast && typeof document !== "undefined"
      ? createPortal(
          <div className="toast-container" role="status" aria-live="polite">
            <div className="toast toast-success" key={toast.id}>
              {toast.message}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="purchase-responsive">
      {toastMarkup}
      <div className="purchase-mobile-header">
        <div className="purchase-mobile-toolbar">
          <div className="mobile-chip">
            <span>ยอดต่อโพย</span>
            <strong>{totalAmount.toLocaleString()}</strong>
          </div>
          <div className="mobile-chip">
            <span>รายการที่เลือก</span>
            <strong>{displaySelectionCount}</strong>
          </div>
          <div className="mobile-chip">
            <span>รูปแบบ</span>
            <strong>{betStepMap[category]?.label ?? "-"}</strong>
          </div>
        </div>
        <div className="purchase-mobile-card">
          <div>
            <strong>{selectedLottery?.name ?? "เลือกรอบหวย"}</strong>
            <small>
              งวดประจำวันที่:{" "}
              {selectedLottery?.closeTime
                ? new Date(selectedLottery.closeTime).toLocaleDateString(
                    "th-TH"
                  )
                : "-"}
            </small>
          </div>
          <CountdownBadge closeTime={selectedLottery?.closeTime} />
        </div>
      </div>
      <div className="purchase-shell">
        <section className="purchase-sidebar panel purchase-dark-panel">
          <div className="lottery-info-card">
            <div className="lottery-info-header">
              <div>
                <p>หวยที่เลือก</p>
                <strong>{selectedLottery?.name ?? "เลือกรอบหวย"}</strong>
                <small>
                  {selectedLottery?.extra
                    ? `งวด ${selectedLottery.extra}`
                    : "งวดประจำวันนี้"}
                </small>
              </div>
              <span
                className={`lottery-status-chip ${
                  selectedLottery?.status === "open" ? "open" : "closed"
                }`}
              >
                {statusText}
              </span>
            </div>
            <div className="lottery-info-meta">
              <div>
                <span>เปิดรับ</span>
                <strong>{openLabel}</strong>
              </div>
              <div>
                <span>ปิดรับ</span>
                <strong>{closeLabel}</strong>
              </div>
            </div>
          <div className="lottery-info-countdown">
            {isLotteryOpen ? (
              <CountdownBadge closeTime={selectedLottery?.closeTime} />
            ) : (
              <span className="countdown offline">ปิดรับรอบนี้แล้ว</span>
            )}
            <small>อัปเดตตามเวลาระบบ</small>
          </div>
            {hasPromotions && (
              <div className="promotion-card">
                <div>
                  <span>โปรโมชันโพย</span>
                  <strong>{activePromotion?.title ?? "ไม่มีโปรโมชัน"}</strong>
                  <small>
                    {activePromotion?.description ?? "จ่ายเต็มตามเรทมาตรฐาน"}
                  </small>
                </div>
                {promotionLocked ? (
                  <div className="promotion-locked-pill">
                    <strong>{activePromotion?.title ?? "โปรโมชันพิเศษ"}</strong>
                    {activePromotion?.discount_percent ? (
                      <span>ลด {activePromotion.discount_percent}%</span>
                    ) : (
                      <span>จ่ายเต็ม</span>
                    )}
                  </div>
                ) : (
                  <select
                    id="promotion-select"
                    value={selectedPromotion ?? ""}
                    onChange={(event) =>
                      setSelectedPromotion(event.target.value)
                    }
                  >
                    {effectivePromotions.map((promo) => (
                      <option key={promo.code} value={promo.code}>
                        {promo.title}
                        {promo.discount_percent
                          ? ` · ลด ${promo.discount_percent}%`
                          : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
          <div className="sidebar-section action-stack">
            {canResetSelection && (
              <button
                type="button"
                className="action-btn action-dark"
                onClick={onChangeSelection}
              >
                กลับ
              </button>
            )}
            <button
              type="button"
              className={`action-btn ${
                mode === "panel" ? "action-primary" : ""
              }`}
              onClick={() => setMode("panel")}
            >
              เลือกจากแผง
            </button>
            <button
              type="button"
              className={`action-btn ${
                mode === "manual" ? "action-primary" : ""
              }`}
              onClick={() => setMode("manual")}
            >
              พิมพ์เลข
            </button>
            <button
              type="button"
              className="action-btn"
              onClick={handleFastPick}
            >
              สุ่มเลขด่วน
            </button>
          </div>
          <div className="purchase-list-panel">
            <div className="purchase-list-head">
              <div>
                <span>โพยที่เลือก</span>
                <strong>{ticketItems.length} รายการ</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTicketItems([]);
                  setShowPriceEditor(false);
                }}
                disabled={!ticketItems.length}
              >
                ล้างทั้งหมด
              </button>
            </div>
            <div className="purchase-list-body">
              {ticketItems.length === 0 ? (
                <p className="purchase-empty">ยังไม่มีรายการ</p>
              ) : (
                ticketItems.map((item) => {
                  const displayAmount =
                    Number(item.amount) > 0 ? Number(item.amount) : amountPerBetValue;
                  return (
                    <div className="ticket-item" key={item.id}>
                      <div>
                        <strong>{item.number}</strong>
                        <small>
                          {item.category === "three"
                            ? "สามตัว"
                            : item.category === "two"
                            ? "สองตัว"
                            : "เลขวิ่ง"}{" "}
                          · {payoutOptionMap[item.betType]?.label ?? item.betType}
                        </small>
                      </div>
                      <div>
                        <strong>{displayAmount.toLocaleString()}</strong>
                        <button
                          type="button"
                          onClick={() => removeTicket(item.id)}
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="ticket-summary-bar">
              <div>
                <span>ยอดก่อนส่วนลด</span>
                <strong>{grossAmount.toLocaleString()}</strong>
              </div>
              <div>
                <span>ส่วนลด {discountPercent}%</span>
                <strong>-{(grossAmount - totalAmount).toLocaleString()}</strong>
              </div>
              <div>
                <span>ยอดสุทธิ</span>
                <strong>{totalAmount.toLocaleString()}</strong>
              </div>
            </div>
          </div>
          {lastSubmission && (
            <div className="purchase-list history">
              <div className="purchase-list-head">
                <span>รายการที่ส่งล่าสุด</span>
                <small>
                  {new Date(lastSubmission.createdAt).toLocaleString("th-TH")}
                </small>
              </div>
              <div className="purchase-list-body">
                {lastSubmission.items.map((item) => (
                  <div
                    className="ticket-item history-item"
                    key={`${lastSubmission.id}-${item.id}`}
                  >
                    <div>
                      <strong>{item.number}</strong>
                      <small>
                        {item.category === "three"
                          ? "สามตัว"
                          : item.category === "two"
                          ? "สองตัว"
                          : "เลขวิ่ง"}{" "}
                        · {payoutOptionMap[item.betType]?.label ?? item.betType}
                      </small>
                    </div>
                    <strong>{Number(item.amount).toLocaleString()}</strong>
                  </div>
                ))}
              </div>
              <div className="ticket-summary-bar compact">
                <div>
                  <span>ยอดรวมล่าสุด</span>
                  <strong>{lastSubmission.total.toLocaleString()}</strong>
                </div>
              </div>
            </div>
          )}
        </section>
        <section className="purchase-board panel">
          <div className="purchase-board-top">
            <div className="purchase-board-info">
              <span>หวยที่เลือก</span>
              {selectionLocked ? (
                <strong className="locked-value">
                  {selectedLottery?.name ?? "-"}
                </strong>
              ) : (
                <select
                  style={{ marginLeft: 10 }}
                  value={lotteryId}
                  onChange={(e) => setLotteryId(e.target.value)}
                >
                  {lotteries.map((lottery) => (
                    <option key={lottery.id} value={lottery.id}>
                      {lottery.name}
                    </option>
                  ))}
                </select>
              )}
              {canResetSelection && (
                <button
                  type="button"
                  className="change-selection-btn"
                  onClick={onChangeSelection}
                >
                  เปลี่ยนประเภท / โปรโมชัน
                </button>
              )}
            </div>
            <div className="purchase-tabs">
              {purchaseTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={mode === tab.id ? "active" : ""}
                  type="button"
                  onClick={() => setMode(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="purchase-step-header">
            <div>
              <h3>กดเลข & ใส่ราคา</h3>
              <small>
                เลือกเลข แล้วระบุราคาต่อเลขได้ทันที (ส่งโพยได้เลย)
              </small>
            </div>
            <div className="purchase-step-meta">
              <span>เลือกแล้ว</span>
              <strong>{hasSelection ? selectionCount : 0} เลข</strong>
              <small>ในโพย {ticketItems.length} รายการ</small>
            </div>
          </div>

          <div className="purchase-steps">
            {availableSteps.map((step) => (
              <button
                key={step.id}
                type="button"
                className={`purchase-step ${
                  category === step.id ? "active" : ""
                }`}
                onClick={() => setCategory(step.id)}
              >
                <span className="step-number">{step.order}</span>
                <span>{step.label}</span>
              </button>
            ))}
          </div>
          <div className="purchase-bettype-row">
            <button
              className="fast-button"
              type="button"
              onClick={handleFastPick}
            >
              แบบด่วน (Fast)
            </button>
            <div className="payout-options">
              {payoutList.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`payout-card ${
                    activeBetTypes.includes(option.id) ? "active" : ""
                  }`}
                  aria-pressed={
                    activeBetTypes.includes(option.id) ? "true" : "false"
                  }
                  onClick={() => toggleBetType(option.id)}
                >
                  <strong>{option.label}</strong>
                  <span>
                    จ่าย{" "}
                    {option.rate.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="purchase-option-checks">
            <label>
              <input
                type="checkbox"
                checked={options.reverse}
                onChange={() =>
                  setOptions((prev) => ({ ...prev, reverse: !prev.reverse }))
                }
              />{" "}
              กลับตัวเลข
            </label>
            <label className="quick-add-toggle">
              <input
                type="checkbox"
                checked={quickAdd}
                onChange={() => setQuickAdd((prev) => !prev)}
              />{" "}
              {quickAddLabel}
            </label>

            {mode === "panel" && stepConfig?.digits >= 2 && (
              <div className="option-shortcuts">
                <button type="button" onClick={addRepeatingNumbers}>
                  {stepConfig.digits === 3 ? "เลขตอง" : "เลขเบิ้ล"}
                </button>
              </div>
            )}
          </div>
              {isLaoLottery && mode === "panel" && (
                <div className="lao-filters">
                  <div className="lao-filter-group">
                    <span>สูง-ต่ำ</span>
                    <div>
                      <button
                        type="button"
                        className={
                          laoFilters.highLow === "high" ? "active" : ""
                        }
                        onClick={() => toggleLaoFilter("highLow", "high")}
                      >
                        สูง
                      </button>
                      <button
                        type="button"
                        className={
                          laoFilters.highLow === "low" ? "active" : ""
                        }
                        onClick={() => toggleLaoFilter("highLow", "low")}
                      >
                        ต่ำ
                      </button>
                    </div>
                  </div>
                  <div className="lao-filter-group">
                    <span>คู่-คี่</span>
                    <div>
                      <button
                        type="button"
                        className={laoFilters.parity === "even" ? "active" : ""}
                        onClick={() => toggleLaoFilter("parity", "even")}
                      >
                        คู่
                      </button>
                      <button
                        type="button"
                        className={laoFilters.parity === "odd" ? "active" : ""}
                        onClick={() => toggleLaoFilter("parity", "odd")}
                      >
                        คี่
                      </button>
                    </div>
                  </div>
                  <div className="lao-filter-group">
                    <span>เลขด่วน</span>
                    <div>
                      <button
                        type="button"
                        className={laoFilters.quick === "high" ? "active" : ""}
                        onClick={() => toggleLaoFilter("quick", "high")}
                      >
                        เลขสูง
                      </button>
                      <button
                        type="button"
                        className={laoFilters.quick === "low" ? "active" : ""}
                        onClick={() => toggleLaoFilter("quick", "low")}
                      >
                        เลขต่ำ
                      </button>
                      <button
                        type="button"
                        className={laoFilters.quick === "even" ? "active" : ""}
                        onClick={() => toggleLaoFilter("quick", "even")}
                      >
                        คู่
                      </button>
                      <button
                        type="button"
                        className={laoFilters.quick === "odd" ? "active" : ""}
                        onClick={() => toggleLaoFilter("quick", "odd")}
                      >
                        คี่
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {mode === "panel" && (
                <div className="purchase-board-body">
                  {stepConfig?.boardType === "three" ? (
                    <div className="purchase-blocks">
                      <div className="block-control">
                        {blockButtons.map((btn) => (
                          <button
                            key={btn.value}
                            type="button"
                            className={activeBlock === btn.value ? "active" : ""}
                            onClick={() => setActiveBlock(btn.value)}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                      <div className="block-grid">
                        {filteredBoardNumbers.map((num) => (
                          <button
                            key={num}
                            type="button"
                            className={
                              selectedNumbers.includes(num) ? "selected" : ""
                            }
                            onClick={() => toggleNumber(num)}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="panel-grid">
                      {filteredBoardNumbers.map((num) => (
                        <button
                          key={num}
                          type="button"
                          className={
                            selectedNumbers.includes(num) ? "selected" : ""
                          }
                          onClick={() => toggleNumber(num)}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {mode === "manual" && (
                <div className="manual-panel">
                  <div className="manual-display">
                    {Array.from(
                      { length: Math.max(manualLimit, 1) },
                      (_, idx) => {
                        const value = manualDigits[idx] || "";
                        return (
                          <div
                            key={idx}
                            className={`manual-digit ${
                              value ? "filled" : ""
                            }`}
                          >
                            {value}
                          </div>
                        );
                      }
                    )}
                  </div>
                  <div className="manual-pad">
                    {Array.from({ length: 10 }, (_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleManualDigit(idx.toString())}
                        disabled={manualDigits.length >= manualLimit}
                      >
                        {idx}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="manual-action"
                      onClick={handleManualBackspace}
                    >
                      ลบ
                    </button>
                    <button
                      type="button"
                      className="manual-action manual-clear"
                      onClick={handleManualClear}
                    >
                      เคลียร์
                    </button>
                  </div>
                </div>
              )}

              <div className="purchase-number-actions">
                <label className="amount-input-inline">
                  <span>ราคาต่อเลข (ใช้ส่งโพยได้ทันที)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amountPerBet}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, "");
                      setAmountPerBet(val);
                    }}
                    placeholder="เช่น 10"
                  />
                </label>
                <div className="purchase-number-buttons">
                  {!quickAdd && (
                    <>
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={!hasSelection}
                        onClick={resetSelection}
                      >
                        ล้างที่เลือก
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={!hasSelection}
                        onClick={handleAddSelection}
                      >
                        เพิ่มเข้ารายการ
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={!ticketItems.length && !hasSelection}
                    onClick={handleTogglePriceEditor}
                  >
                    {showPriceEditor ? "ซ่อนการตั้งราคาแยก" : "ปรับราคาแยกรายการ"}
                  </button>
                </div>
                {!ticketItems.length && !hasSelection && (
                  <small className="price-editor-hint">
                    เลือกเลขก่อน เพื่อปรับราคาแยกรายการ
                  </small>
                )}
              </div>

          {showPriceEditor && (
            <div className="purchase-price-panel">
              <div className="purchase-step-header">
                <div>
                  <p className="selection-step-label">ตั้งราคาแยกรายการ (ไม่บังคับ)</p>
                  <h3>ปรับราคาแยกรายการ</h3>
                  <small>ถ้าไม่ตั้งราคาแยก ระบบจะใช้ราคาต่อเลขด้านบน</small>
                </div>
                <div className="purchase-step-meta">
                  <span>ทั้งหมด</span>
                  <strong>{ticketItems.length} รายการ</strong>
                </div>
              </div>

              <div className="price-bulk">
                <label>ใส่ราคาทุกรายการ</label>
                <div className="price-bulk-row">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={bulkPriceInput}
                    onChange={(e) => setBulkPriceInput(e.target.value)}
                    placeholder="เช่น 20"
                  />
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => handleBulkAmount(bulkPriceInput)}
                  >
                    ใช้ราคานี้
                  </button>
                </div>
                <div className="price-bulk-chips">
                  {[5, 10, 20, 50, 100, 200].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleBulkAmount(amt)}
                    >
                      {amt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="price-item-list">
                {ticketItems.length === 0 ? (
                  <p className="purchase-empty">ยังไม่มีรายการ</p>
                ) : (
                  ticketItems.map((item) => {
                    const payoutRate = Number(
                      item.payoutRate ??
                        payoutOptionMap[item.betType]?.rate ??
                        0
                    );
                    const amountValue = Number(item.amount ?? 0);
                    const hasRate = Number.isFinite(payoutRate) && payoutRate > 0;
                    const winAmount = hasRate ? amountValue * payoutRate : 0;
                    const rateLabel = hasRate
                      ? payoutRate.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })
                      : "-";
                    const winLabel = hasRate
                      ? winAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })
                      : "-";
                    return (
                      <div className="price-item" key={item.id}>
                        <div className="price-item-main">
                          <strong>{item.number}</strong>
                          <small>
                            {item.category === "three"
                              ? "สามตัว"
                              : item.category === "two"
                              ? "สองตัว"
                              : "เลขวิ่ง"}{" "}
                            ·{" "}
                            {payoutOptionMap[item.betType]?.label ??
                              item.betType}
                          </small>
                        </div>
                        <div className="price-item-meta">
                          <div className="price-meta-field">
                            <span>เรทจ่าย</span>
                            <input
                              type="text"
                              value={rateLabel}
                              readOnly
                            />
                          </div>
                          <div className="price-meta-field">
                            <span>เรทชนะ</span>
                            <input
                              type="text"
                              value={winLabel}
                              readOnly
                            />
                          </div>
                        </div>
                        <div className="price-item-actions">
                                <span>ยอดแทง</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.amount}
                            onChange={(e) =>
                              handleItemAmountChange(item.id, e.target.value)
                            }
                            placeholder="ราคา"
                          />
                          <button
                            type="button"
                            className="danger-btn"
                            onClick={() => removeTicket(item.id)}
                          >
                            ลบ
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {purchaseWarning && (
            <p className="purchase-credit-warning">{purchaseWarning}</p>
          )}
          <div className="purchase-footer">
            <div>
              <span>ยอดรวม</span>
              <strong>{totalAmount.toLocaleString()}</strong>
            </div>
            <button
              className="primary-btn purchase-submit"
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmitTickets}
            >
              ส่งโพย
            </button>
          </div>
        </section>
      </div>

      {isCreditModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsCreditModalOpen(false)}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480 }}
          >
            <h3>เครดิตไม่พอ</h3>
            <p style={{ color: "var(--text-secondary)" }}>
              {creditError ||
                `ยอดรวม ${totalAmount.toLocaleString()}  เกินเครดิตคงเหลือ ${normalizedAvailableCredit.toLocaleString()} `}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className="secondary-btn"
                type="button"
                onClick={() => setIsCreditModalOpen(false)}
                style={{ flex: 1 }}
              >
                ปิด
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={() => {
                  setIsCreditModalOpen(false);
                  if (typeof onOpenDeposit === "function") {
                    onOpenDeposit();
                    return;
                  }
                  try {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  } catch {}
                }}
                style={{ flex: 1 }}
              >
                ฝากเครดิต
              </button>
            </div>
          </div>
        </div>
      )}

      {isRulesModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsRulesModalOpen(false)}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h3>กติกาและการจ่าย</h3>
            {(() => {
              const list = Object.values(filteredPayoutOptions).flat();
              return (
                <>
                  <p>
                    เลือกแทงเฉพาะงวดที่เปิดรับ ระบบตัดรอบเวลา{" "}
                    {selectedLottery?.closeTime
                      ? new Date(selectedLottery.closeTime).toLocaleTimeString(
                          "th-TH"
                        )
                      : "-"}
                    .
                  </p>
                  <ul>
                    {list?.map((option) => (
                      <li key={option.id}>
                        {option.label}: จ่าย{" "}
                        {option.rate.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </li>
                    ))}
                  </ul>
                </>
              );
            })()}
            <button
              className="primary-btn"
              type="button"
              onClick={() => setIsRulesModalOpen(false)}
            >
              ปิด
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
