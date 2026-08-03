import CountdownBadge from "./CountdownBadge";
import { formatDateTime } from "../utils/lotteryHelpers";

const fallbackPromotions = [
  {
    code: "normal-full",
    title: "จ่ายปกติ",
    description: "รับอัตราจ่ายเต็มทุกรายการ",
    discount_percent: 0,
  },
];

export default function PurchaseSelector({
  lotteries = [],
  promotions = [],
  selection = { lotteryId: "", promotionCode: "", confirmed: false },
  onSelectionChange,
  onConfirm,
  hidePromotionChoice = false
}) {
  const { lotteryId, promotionCode } = selection;
  const effectivePromotions = hidePromotionChoice
    ? []
    : promotions.length
      ? promotions
      : fallbackPromotions;
  const selectedLottery = lotteries.find((lottery) => lottery.id === lotteryId);
  const selectedPromotion = effectivePromotions.find(
    (promo) => promo.code === promotionCode
  );

  const ready =
    Boolean(lotteryId) &&
    (hidePromotionChoice || Boolean(selectedPromotion)) &&
    selectedLottery?.status === "open";
  const handleLotterySelect = (id) => {
    const target = lotteries.find((lottery) => lottery.id === id);
    if (target?.status === "closed") return;
    onSelectionChange?.({ lotteryId: id });
  };

  const handlePromotionSelect = (code) => {
    onSelectionChange?.({ promotionCode: code });
  };

  const handleConfirm = () => {
    if (!ready) return;
    onConfirm?.({ lotteryId, promotionCode });
  };

  return (
    <section className="panel purchase-selection-panel theme-light">
      <header className="purchase-selection-header">
        <div>
          <h2>เลือกประเภทหวยที่ต้องการแทง</h2>
          <small>
            เลือกผู้ให้บริการหวยที่ต้องการก่อน
            จากนั้นเลือกโปรโมชันเพื่อเข้าสู่หน้ากรอกตัวเลข
          </small>
        </div>
      </header>

      <div className="lottery-module-grid">
        {lotteries.map((lottery) => {
          const isSelected = lottery.id === lotteryId;
          const isClosed = lottery.status === "closed";
          return (
            <button
              key={lottery.id}
              type="button"
              className={`lottery-module-card ${isSelected ? "selected" : ""} ${
                isClosed ? "closed" : ""
              }`}
              onClick={() => handleLotterySelect(lottery.id)}
              disabled={isClosed}
            >
              <div className="lottery-card-header">
                <div className="lottery-card-flag">{lottery.flag || "🎯"}</div>
                <div className="lottery-card-head">
                  <span
                    className={`lottery-status-pill ${
                      isClosed ? "status-closed" : "status-open"
                    }`}
                  >
                    {isClosed ? "ปิดรับรอบนี้แล้ว" : "เปิดรับแทง"}
                  </span>
                  <strong>{lottery.name}</strong>
                  <small>
                    {lottery.description ||
                      "เลือกรอบหวยเพื่อเข้าสู่ขั้นตอนถัดไป"}
                  </small>
                </div>
              </div>
              <div className="lottery-card-meta">
                <div>
                  <span>เปิดรับ</span>
                  <strong>{formatDateTime(lottery.openTime)}</strong>
                </div>
                <div>
                  <span>ปิดรับ</span>
                  <strong>{formatDateTime(lottery.closeTime)}</strong>
                </div>
              </div>
              <div className="lottery-card-description">
                <p>{lottery.extra || "อัปเดตงวดตามเวลาระบบ"}</p>
              </div>
              <div className="lottery-card-foot">
                {isClosed ? (
                  <span className="countdown offline">ปิดรับรอบนี้แล้ว</span>
                ) : (
                  <CountdownBadge closeTime={lottery.closeTime} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {!hidePromotionChoice && (
        <div className="promotion-choice-panel">
          <div className="promotion-choice-head">
            <h3>เลือกรูปแบบการเล่น</h3>
            <small>เลือกได้ 1 แบบต่อโพย (ปกติ หรือ ลด 30%)</small>
          </div>
          <div className="promotion-choice-grid">
            {effectivePromotions.map((promo) => {
              const isSelected = promo.code === promotionCode;
              return (
                <button
                  type="button"
                  key={promo.code}
                  className={`promo-option ${isSelected ? "selected" : ""}`}
                  onClick={() => handlePromotionSelect(promo.code)}
                >
                  <span>{promo.title}</span>
                  <small>
                    {promo.discount_percent
                      ? `ลด ${promo.discount_percent}%`
                      : "อัตราจ่ายเต็ม"}
                  </small>
                  {promo.description && <p>{promo.description}</p>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* <div className="purchase-selection-summary">
        <div>
          <span>หวยที่เลือก</span>
          <strong>{selectedLottery?.name ?? "ยังไม่ได้เลือก"}</strong>
        </div>
        <div>
          <span>โปรโมชัน</span>
          <strong>
            {selectedPromotion
              ? `${selectedPromotion.title}${selectedPromotion.discount_percent ? `` : ""}`
              : "ยังไม่ได้เลือก"}
          </strong>
        </div>
      </div> */}

      <div className="purchase-selection-actions">
        <button
          type="button"
          className="primary-btn"
          disabled={!ready}
          onClick={handleConfirm}
        >
          ไปกดเลข
        </button>
      </div>
    </section>
  );
}
