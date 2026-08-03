import NewsPanel from "./NewsPanel";
import { formatDrawDateLabel } from "../utils/lotteryHelpers";
import { defaultResults } from "../constants/defaults";

export default function HomeHub({
  profile,
  summary,
  announcements,
  shortcuts,
  onSelectShortcut,
  thaiResult,
  laoResult,
  latestResults = {}
}) {
  const creditLimit = Number(profile?.creditLimit ?? 0);
  const creditUsed = Number(profile?.creditUsed ?? 0);
  const creditAvailable = Number(
    typeof profile?.creditAvailable === "number" ? profile.creditAvailable : creditLimit - creditUsed
  );
  const resultsMap = {
    ...defaultResults,
    ...latestResults,
    "th-lottery": thaiResult || latestResults["th-lottery"] || defaultResults["th-lottery"],
    "lao-lottery": laoResult || latestResults["lao-lottery"] || defaultResults["lao-lottery"]
  };

  const cards = [
    { id: "th-lottery", type: "thai" },
    { id: "gsb-lottery", type: "thai" },
    { id: "baac-lottery", type: "thai" },
    { id: "lao-lottery", type: "lao" },
    { id: "lao-vip", type: "lao" },
    { id: "lao-star", type: "lao" },
    { id: "viet-special", type: "viet" },
    { id: "viet-standard", type: "viet" },
    { id: "viet-vip", type: "viet" }
  ].filter((c) => resultsMap[c.id]);

  const renderCard = (card) => {
    const res = resultsMap[card.id];
    if (!res) return null;
    const dateLabel = formatDrawDateLabel(res.drawDate);
    if (card.type === "thai") {
      const thaiTwoTop = res?.firstPrize ? res.firstPrize.slice(-2) : "";
      const frontThree =
        res.firstPrize && res.firstPrize.length >= 3
          ? [res.firstPrize.slice(0, 3)]
          : (Array.isArray(res.frontThree) && res.frontThree.length ? res.frontThree : []) || [];
      const backThree = res.backThree || [];
      return (
        <div key={card.id} className="result-card">
          <div className="result-header">
            <strong>{res.title || "ผลหวยรัฐบาลไทย"}</strong>
            <small>{dateLabel}</small>
          </div>
          <div className="result-content">
            <div className="thai-result-main shared-primary">
              <span>รางวัลที่ 1</span>
              <strong>{res.firstPrize}</strong>
            </div>
            <div className="thai-result-sub shared-secondary">
              <div>
                <span>เลขหัว 3 ตัว</span>
                <strong>{frontThree.join("  ")}</strong>
              </div>
              <div>
                <span>เลขท้าย 3 ตัว</span>
                <strong>{backThree.join("  ")}</strong>
              </div>
              <div>
                <span>เลขท้าย 2 ตัวบน</span>
                <strong>{thaiTwoTop}</strong>
              </div>
              <div>
                <span>เลขท้าย 2 ตัว</span>
                <strong>{res.twoDigits}</strong>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const isLao = card.type === "lao";
    const title = res.title || (isLao ? "ผลหวยลาวพัฒนา" : "ผลหวยฮานอย");
    const three = res.threeDigits || res.threeDigitsTop || res.firstPrize || "";
    const twoBottom =
      res.twoDigits ||
      res.twoBottom ||
      (res.extra && (res.extra.twoBottom || res.extra.twoDigits)) ||
      "";
    const twoTop =
      (res.extra && (res.extra.twoTop || res.extra.twoDigits)) ||
      (three ? three.slice(-2) : "");

    return (
      <div key={card.id} className="result-card">
        <div className="result-header">
          <strong>{title}</strong>
          <small>{dateLabel}</small>
        </div>
        <div className="result-content">
          <div className="thai-result-main shared-primary">
            <span>{isLao ? "รางวัลที่ 1" : "เลข 3 ตัวบน"}</span>
            <strong>{three}</strong>
          </div>
          <div className="thai-result-sub shared-secondary">
            <div>
              <span>2 ตัวบน</span>
              <strong>{twoTop}</strong>
            </div>
            <div>
              <span>2 ตัวล่าง</span>
              <strong>{twoBottom}</strong>
            </div>
          </div>
        </div>
      </div>
    );
  };
  return (
    <div className="home-hub">
      <div className="panel home-hero">
        <div className="home-hero-card">
          <small>ยินดีต้อนรับ</small>
          <h2>{profile?.username ?? "Guest"}</h2>
          <p>เครดิตคงเหลือ {creditAvailable.toLocaleString()} </p>
        </div>
        <div className="home-hero-card">
          <small>ยอดโพยวันนี้</small>
          <strong>{Number(summary?.todayStake ?? 0).toLocaleString()}</strong>
          <p>ยอดแทงรวมในรอบวัน</p>
        </div>
        <div className="home-hero-card">
          <small>ข่าวล่าสุด</small>
          <p>{announcements?.[0]?.title ?? "ยังไม่มีข่าวใหม่"}</p>
        </div>
      </div>
      <div className="panel">
        <h3>เมนูด่วน</h3>
        <div className="shortcut-grid">
          {shortcuts.map((item) => (
            <button key={item.id} className="shortcut-card" type="button" onClick={() => onSelectShortcut?.(item)}>
              <span className="shortcut-icon">{item.icon}</span>
              <strong>{item.label}</strong>
            </button>
          ))}
        </div>
      </div>
      <div className="panel result-panel">
        <h3>ผลหวยล่าสุด</h3>
        <div className="result-grid latest-multi">
          {cards.map((card) => renderCard(card))}
        </div>
      </div>
      <NewsPanel announcements={announcements} />
    </div>
  );
}
