import { useEffect, useState } from "react";
import { getTimeRemaining } from "../utils/lotteryHelpers";

export default function CountdownBadge({ closeTime }) {
  const [remaining, setRemaining] = useState(() => getTimeRemaining(closeTime));

  useEffect(() => {
    setRemaining(getTimeRemaining(closeTime));
  }, [closeTime]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(getTimeRemaining(closeTime));
    }, 100000);
    return () => clearInterval(timer);
  }, [closeTime]);

  if (!closeTime) return null;
  if (remaining.total <= 0) {
    return <span className="countdown offline">ปิดรับรอบนี้แล้ว</span>;
  }

  return (
    <span className="countdown">
      ⏱ ปิดรับใน {remaining.days ? `${remaining.days} วัน ` : ""}
      {remaining.hours}:{remaining.minutes}:{remaining.seconds}
    </span>
  );
}
