const flowSteps = [
  { id: "lottery", label: "เลือกหวย" },
  { id: "promo", label: "ปกติ / โปรโมชัน" },
  { id: "numbers", label: "กดเลข & ใส่ราคา" },
  { id: "submit", label: "ส่งโพย" },
];

export default function PurchaseFlowSteps({
  activeId = "lottery",
  completedIds = [],
}) {
  return (
    <div className="purchase-flow" aria-label="ขั้นตอนการแทงหวย">
      {flowSteps.map((step, index) => {
        const isDone = completedIds.includes(step.id);
        const isActive = step.id === activeId;
        return (
          <div
            key={step.id}
            className={`purchase-flow-step ${isDone ? "done" : ""} ${
              isActive ? "active" : ""
            }`}
            aria-current={isActive ? "step" : undefined}
          >
            <span className="flow-index">{index + 1}</span>
            <span className="flow-label">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
