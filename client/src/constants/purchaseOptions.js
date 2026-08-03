export const purchaseTabs = [
  { id: "panel", label: "เลือกจากแผง" },
  { id: "manual", label: "พิมพ์เลข" }
];

export const betSteps = [
  { id: "three", label: "สามตัว", order: 3, digits: 3, boardType: "three" },
  { id: "two", label: "สองตัว", order: 2, digits: 2, boardType: "two" },
  { id: "run", label: "เลขวิ่ง", order: 1, digits: 1, boardType: "run" }
];

export const betStepMap = betSteps.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export const payoutOptions = {
  three: [
    { id: "three-top", label: "3 ตัวบน", rate: 910 },
    { id: "three-tod", label: "3 ตัวบนโต๊ด", rate: 140 },
    { id: "three-bottom", label: "3 ตัวล่าง", rate: 170 },
    { id: "three-front", label: "3 หัว", rate: 450, lotteries: ["th-lottery"] },
    { id: "three-front-tod", label: "3 หัวโต๊ด", rate: 90, lotteries: ["th-lottery"] }
  ],
  two: [
    { id: "two-top", label: "2 ตัวบน", rate: 95 },
    { id: "two-bottom", label: "2 ตัวล่าง", rate: 95 }
  ],
  run: [
    { id: "run-top", label: "วิ่งบน", rate: 3.2 },
    { id: "run-bottom", label: "วิ่งล่าง", rate: 4.2 }
  ]
};

export const payoutOptionMap = Object.values(payoutOptions)
  .flat()
  .reduce((acc, option) => {
    acc[option.id] = option;
    return acc;
  }, {});

export const lotteryTitleMap = {
  "th-lottery": "หวยไทย",
  "gsb-lottery": "หวยออมสิน",
  "baac-lottery": "หวย ธกส",
  "lao-lottery": "หวยลาวพัฒนา",
  "lao-vip": "หวยลาว VIP",
  "lao-star": "หวยลาวสตาร์",
  "viet-special": "หวยฮานอย พิเศษ",
  "viet-standard": "หวยฮานอย",
  "viet-vip": "หวยฮานอย วีไอพี"
};
