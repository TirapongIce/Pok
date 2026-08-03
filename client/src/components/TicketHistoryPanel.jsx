import { useState } from "react";
import { Modal } from "antd";
import { payoutOptionMap } from "../constants/purchaseOptions";
import { formatBetNumbers } from "../utils/lotteryHelpers";
import { useI18n } from "../i18n.jsx";

function drawRoundLabel(item, configuredRounds = []) {
  // Determine actual draw date string
  const draw =
    item.drawDate || (item.createdAt ? item.createdAt.slice(0, 10) : null);
  if (!draw) return "-";
  try {
    const d = new Date(draw + "T00:00:00");
    const day = d.getDate();
    const weekday = d.toLocaleDateString("th-TH", { weekday: "long" });
    // If configured round mappings exist for this lottery, prefer them
    if (Array.isArray(configuredRounds) && configuredRounds.length) {
      const matched = configuredRounds.find(
        (r) => Number(r.day) === Number(day)
      );
      if (matched && matched.name) return matched.name;
    }
    // Fallback: Thai lottery heuristic
    if (
      String(item.lotteryId).toLowerCase().includes("th-lottery") ||
      String(item.lotteryId).toLowerCase().includes("thai")
    ) {
      if (day === 1 || day === 16) {
        return `งวด ${day} ${d.toLocaleDateString("th-TH", {
          month: "short",
          year: "numeric",
        })}`;
      }
    }
    if (String(item.lotteryId).toLowerCase().includes("lao")) {
      return `งวดวัน${weekday}`;
    }
    return `งวด ${d.toLocaleDateString("th-TH")}`;
  } catch (e) {
    return draw;
  }
}

function matchesNumberRule(pattern, value) {
  const target = String(value ?? "").trim();
  const raw = String(pattern ?? "").trim();
  if (!raw || !target) return false;
  if (raw === "*") return true;
  if (raw.includes(",")) {
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .some((part) => matchesNumberRule(part, target));
  }
  if (raw.includes("-")) {
    const [startStr, endStr] = raw.split("-").map((part) => part.trim());
    const start = Number(startStr);
    const end = Number(endStr);
    const numeric = Number(target);
    if (Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(numeric)) {
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      return numeric >= min && numeric <= max;
    }
  }
  return raw === target;
}

export default function TicketHistoryPanel({
  ledger = [],
  profile,
  lotteries = [],
  lotteryRounds = {},
  numberRestrictions = [],
  onCancelTicket
}) {
  const { t } = useI18n();
  const rows = ledger.filter(
    (item) => !profile?.username || item.member === profile.username
  );
  const lotteryNameMap = {
    "th-lottery": "หวยไทย",
    "lao-lottery": "หวยลาวพัฒนา",
    "viet-special": "หวยฮานอย พิเศษ",
    "viet-standard": "หวยฮานอย",
    "viet-vip": "หวยฮานอย วีไอพี",
  };
  const betTypeLabelMap = {
    "three-top": "3 ตัวบน",
    "three-tod": "3 ตัวโต๊ด",
    "three-bottom": "3 ตัวล่าง",
    "three-front": "3 หัว",
    "three-front-tod": "3 หัวโต๊ด",
    "two-top": "2 ตัวบน",
    "two-bottom": "2 ตัวล่าง",
    "run-top": "วิ่งบน",
    "run-bottom": "วิ่งล่าง",
    standard: "สองตัว · 2 ตัวบน",
  };
  const resolvePayoutRate = (betType, number, lotteryId) => {
    const targetLottery = (lotteryId || "").toLowerCase();
    const list = numberRestrictions || [];
    const applicable = list.filter((nr) => {
      const sameLottery =
        !nr.lotteryCode ||
        nr.lotteryCode === "all" ||
        targetLottery === (nr.lotteryCode || "").toLowerCase();
      const sameBetType = !nr.betType || nr.betType === betType;
      return sameLottery && sameBetType;
    });
    const literal = applicable.find((nr) => {
      const raw = String(nr.number || "").trim();
      return raw && raw !== "*" && !raw.includes(",") && !raw.includes("-") && raw === String(number || "").trim() && nr.payoutRate != null;
    });
    if (literal?.payoutRate != null) return literal.payoutRate;
    const specific = applicable.find(
      (nr) =>
        nr?.number &&
        String(nr.number).trim() !== "*" &&
        matchesNumberRule(nr.number, number) &&
        nr.payoutRate != null
    );
    if (specific?.payoutRate != null) return specific.payoutRate;
    const wildcard = applicable.find(
      (nr) => String(nr.number || "").trim() === "*" && nr.payoutRate != null
    );
    if (wildcard?.payoutRate != null) return wildcard.payoutRate;
    if (betType && payoutOptionMap[betType]?.rate != null) {
      return payoutOptionMap[betType].rate;
    }
    return payoutOptionMap["two-top"]?.rate ?? null;
  };
  const resolveCloseTime = (item) => {
    if (!item?.lotteryId) return null;
    const target = lotteries.find(
      (lottery) => (lottery.id || lottery.code) === item.lotteryId
    );
    const rawClose = target?.closeTime;
    if (!rawClose) return null;
    const raw = String(rawClose);
    const match = raw.match(/T(\d{2}:\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})?/);
    const timePart = match?.[1] ?? "00:00";
    const offset = match?.[2] ?? "+07:00";
    const drawDate = item.drawDate || item.createdAt?.slice(0, 10);
    if (!drawDate) {
      const direct = new Date(raw);
      return Number.isNaN(direct.getTime()) ? null : direct;
    }
    const composed = new Date(`${drawDate}T${timePart}:00${offset}`);
    if (!Number.isNaN(composed.getTime())) return composed;
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  };
  const [detail, setDetail] = useState(null);
  return (
    <div className="panel">
      <h3>{t("tickets.latest", "รายการโพยล่าสุด")}</h3>
      <div className="ticket-list">
        {rows.map((item) => {
          const isWin = item.status === "won" || Number(item.credit ?? 0) > 0;
          const isLose = item.status === "lost" && !isWin;
          const isCancelled = item.status === "cancelled";
          const closeAt = resolveCloseTime(item);
          const cancelCutoff = closeAt
            ? closeAt.getTime() - 30 * 60 * 1000
            : null;
          const canCancel =
            !isWin &&
            !isLose &&
            !isCancelled &&
            (item.status == null || item.status === "pending") &&
            cancelCutoff != null &&
            Date.now() < cancelCutoff;
          return (
            <div key={item.id} className="ticket-card">
              <div className="ticket-head">
                <strong>โพยเลขที่ #{item.id}</strong>
                <span
                  className={`ticket-status ${
                    isWin ? "win" : isLose ? "lose" : isCancelled ? "cancelled" : "pending"
                  }`}
                >
                  {isWin
                    ? "ถูกรางวัล"
                    : isLose
                      ? "ไม่ถูกรางวัล"
                      : isCancelled
                        ? "ยกเลิกแล้ว"
                        : "รอดำเนินการ"}
                </span>
              </div>
              <div className="ticket-body">
                <div className="ticket-lottery">
                  <div className="lottery-name">
                    {lotteryNameMap[item.lotteryId] ?? item.lotteryId}
                  </div>
                  <div className="lottery-draw">
                    วันที่:{" "}
                    {item.drawDate || item.createdAt?.slice(0, 10) || "-"}
                  </div>
                </div>
                <div className="ticket-meta">
                  <div>
                    <small>ยอดแทง</small>
                    <strong>
                      {Number(item.debit ?? 0).toLocaleString()} 
                    </strong>
                  </div>
                  {/* <div>
                    <small>เรทจ่าย</small>
                    <strong>
                      {(() => {
                        const itemsInTicket = Array.isArray(item.items)
                          ? item.items
                          : [];
                        // พยายามหาเรทที่มาจากเลขอั้น/เรตพิเศษก่อน
                        let sampleRate = null;
                        for (const it of itemsInTicket) {
                          const rate = resolvePayoutRate(
                            it.betType || item.betType,
                            it.number,
                            item.lotteryId || it.lotteryId
                          );
                          if (rate != null) {
                            sampleRate = rate;
                            break;
                          }
                        }
                        if (sampleRate == null) {
                          const firstItem = itemsInTicket[0] || {};
                          sampleRate =
                            firstItem.payoutRate ??
                            firstItem.rate ??
                            resolvePayoutRate(
                              firstItem.betType || item.betType,
                              firstItem.number,
                              item.lotteryId
                            );
                        }
                        return sampleRate
                          ? Number(sampleRate).toLocaleString()
                          : "-";
                      })()}
                    </strong>
                  </div> */}
                  <div>
                    <small>ผลแพ้/ชนะ</small>
                    <strong>
                      {isWin
                        ? Number(item.credit ?? 0).toLocaleString() + " "
                        : isLose
                          ? "0"
                          : isCancelled
                            ? "ยกเลิก"
                            : "-"}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="ticket-foot">
                <div className="ticket-time">
                  ⌚ {new Date(item.createdAt).toLocaleString("th-TH")}
                </div>
                <div className="ticket-actions">
                  {canCancel && (
                    <button
                      type="button"
                      className="danger-btn"
                      onClick={async () => {
                        if (!onCancelTicket) return;
                        const ok = window.confirm(
                          `ยืนยันยกเลิกโพย #${item.id} ?`
                        );
                        if (!ok) return;
                        try {
                          await onCancelTicket(item.id);
                        } catch (err) {
                          console.error(err);
                          alert("ยกเลิกโพยไม่สำเร็จ");
                        }
                      }}
                    >
                      ยกเลิกโพย
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setDetail(item)}
                  >
                    รายละเอียด 🔍
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {!rows.length && <p className="empty-copy">ยังไม่มีรายการ</p>}
      </div>
      {detail && (
        <Modal
          open
          onCancel={() => setDetail(null)}
          footer={null}
          width={860}
          className="ticket-detail-modal"
          centered
          destroyOnClose
        >
          <div className="modal-header">
            <div>
              <h3>รายละเอียดโพย #{detail.id}</h3>
              <p className="sub">
                {lotteryNameMap[detail.lotteryId] ?? detail.lotteryId}
              </p>
            </div>
          </div>

          <div className="modal-body">
            <div className="number-list-header">
              <div className="number-card-left">
                <span className="number-col num">เลข</span>
                <span className="number-col type">ประเภท</span>
                <span className="number-col rate">เรทจ่าย</span>
                <span className="number-col status">สถานะ</span>
              </div>
              <div className="number-card-price">
                <span className="number-col amount">จำนวน</span>
                <span className="number-col receive">รับ</span>
              </div>
            </div>
            <div className="number-list cards">
              {(() => {
                const items = Array.isArray(detail.items) ? detail.items : [];
                const totalAmount = Number(detail.debit ?? 0);
                if (items.length) {
                  return (
                    <>
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className={`number-card ${
                            item.status === "won" || Number(item.credit ?? 0) > 0
                              ? "win"
                              : item.status === "lost"
                                ? "lose"
                                : "pending"
                          }`}
                        >
                          <div className="number-card-left">
                            <strong className="number-card-num">
                              {item.number}
                            </strong>
                            <small className="number-card-type">
                              {item.betTypeLabel ||
                                betTypeLabelMap[item.betType] ||
                                betTypeLabelMap.standard}
                            </small>
                            <small className="number-card-type">
                              จ่าย{" "}
                              {(() => {
                                const rate =
                                  item.payoutRate ??
                                  item.rate ??
                                  resolvePayoutRate(
                                    item.betType,
                                    item.number,
                                    detail.lotteryId
                                  );
                                return rate ? Number(rate).toLocaleString() : "-";
                              })()}
                            </small>
                            <span
                              className={`number-card-status ${
                                item.status === "won" || Number(item.credit ?? 0) > 0
                                  ? "win"
                                  : item.status === "lost"
                                    ? "lose"
                                    : "pending"
                              }`}
                            >
                              {item.status === "won" || Number(item.credit ?? 0) > 0
                                ? "ถูกรางวัล"
                                : item.status === "lost"
                                  ? "ไม่ถูกรางวัล"
                                  : "รอดำเนินการ"}
                            </span>
                          </div>
                          <div
                            className="number-card-price"
                            style={{ textAlign: "right" }}
                          >
                            <strong>
                              {Number(item.amount ?? 0).toLocaleString()}
                            </strong>
                            {(item.status === "won" ||
                              Number(item.credit ?? 0) > 0) && (
                              <div className="number-card-receive">
                                รับ{" "}
                                {Number(
                                  item.credit ??
                                    (item.amount ?? 0) *
                                      (item.payoutRate ?? item.rate ?? 0)
                                ).toLocaleString()}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  );
                }

                const nums = Array.isArray(detail.numbers)
                  ? detail.numbers
                  : [];
                const perUnit = nums.length
                  ? Number(detail.debit ?? 0) / nums.length
                  : 0;

                return nums.length ? (
                  <>
                    {nums.map((num, idx) => (
                      <div key={`${num}-${idx}`} className="number-card">
                        <div className="number-card-left">
                          <strong className="number-card-num">{num}</strong>
                          <small className="number-card-type">
                            สองตัว · 2 ตัวบน
                          </small>
                          <small className="number-card-type">
                            จ่าย{" "}
                            {(() => {
                              const rate = resolvePayoutRate(
                                "two-top",
                                num,
                                detail.lotteryId
                              );
                              return rate ? Number(rate).toLocaleString() : "-";
                            })()}
                          </small>
                        </div>
                        <div className="number-card-price">
                          <strong>
                            {perUnit ? perUnit.toLocaleString() : "-"}
                          </strong>
                        </div>
                      </div>
                    ))}
                    <div className="number-card total">
                      <strong>รวม</strong>
                      <strong>{totalAmount.toLocaleString()}</strong>
                    </div>
                  </>
                ) : (
                  <p className="empty-copy">ไม่มีเลขในโพย</p>
                );
              })()}
            </div>
          </div>

          <div className="modal-actions footer-between">
            <div className="footer-total">
              <span>ยอดรวม</span>
              <strong>{Number(detail.debit ?? 0).toLocaleString()} </strong>
            </div>

            <button
              className="secondary-btn ghost"
              type="button"
              onClick={() => setDetail(null)}
            >
              ปิด
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
