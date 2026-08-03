export const lotteries = [
  {
    id: "th-lottery",
    name: "หวยไทย",
    type: "government",
    group: "ประเทศไทย",
    status: "open",
    openTime: "2024-05-28T20:00:00+07:00",
    closeTime: "2024-06-01T14:30:00+07:00",
    description: "สลากกินแบ่งรัฐบาลไทย เปิดรับแทงทุกวันที่ 1 และ 16",
    minBet: 10,
    maxBet: 20000,
    payout: {
      threeDigits: 900,
      twoDigits: 95
    }
  },
  {
    id: "gsb-lottery",
    name: "หวยออมสิน",
    type: "government",
    group: "ประเทศไทย",
    status: "open",
    openTime: "2024-05-28T20:00:00+07:00",
    closeTime: "2024-06-01T14:30:00+07:00",
    description: "หวยออมสิน เปิดรับแทงทุกวันที่ 1 และ 16",
    minBet: 10,
    maxBet: 20000,
    payout: {
      threeDigits: 900,
      twoDigits: 95
    }
  },
  {
    id: "baac-lottery",
    name: "หวย ธกส",
    type: "government",
    group: "ประเทศไทย",
    status: "open",
    openTime: "2024-05-28T20:00:00+07:00",
    closeTime: "2024-06-01T14:30:00+07:00",
    description: "หวย ธกส เปิดรับแทงทุกวันที่ 1 และ 16",
    minBet: 10,
    maxBet: 20000,
    payout: {
      threeDigits: 900,
      twoDigits: 95
    }
  },
  {
    id: "lao-lottery",
    name: "หวยลาว",
    type: "international",
    group: "สปป.ลาว",
    status: "open",
    openTime: "2024-05-28T21:30:00+07:00",
    closeTime: "2024-05-30T19:45:00+07:00",
    description: "ลาวพัฒนา ออกผลทุกวันจันทร์ พุธ ศุกร์",
    minBet: 5,
    maxBet: 10000,
    payout: {
      threeDigits: 750,
      twoDigits: 90
    }
  },
  {
    id: "lao-vip",
    name: "หวยลาว VIP",
    type: "international",
    group: "สปป.ลาว",
    status: "open",
    openTime: "2024-05-28T21:30:00+07:00",
    closeTime: "2024-05-30T19:45:00+07:00",
    description: "ลาว VIP ออกผลทุกวันจันทร์ พุธ ศุกร์",
    minBet: 5,
    maxBet: 10000,
    payout: {
      threeDigits: 750,
      twoDigits: 90
    }
  },
  {
    id: "lao-star",
    name: "หวยลาวสตาร์",
    type: "international",
    group: "สปป.ลาว",
    status: "open",
    openTime: "2024-05-28T21:30:00+07:00",
    closeTime: "2024-05-30T19:45:00+07:00",
    description: "ลาวสตาร์ ออกผลทุกวันจันทร์ พุธ ศุกร์",
    minBet: 5,
    maxBet: 10000,
    payout: {
      threeDigits: 750,
      twoDigits: 90
    }
  },
  {
    id: "viet-special",
    name: "หวยฮานอย พิเศษ",
    type: "international",
    group: "เวียดนาม",
    status: "open",
    openTime: "2024-05-28T01:00:00+07:00",
    closeTime: "2024-05-28T16:45:00+07:00",
    description: "ฮานอยพิเศษ เปิด 01:00 ปิด 16:45 ออกผล ~17:30",
    minBet: 5,
    maxBet: 15000,
    payout: {
      threeDigits: 800,
      twoDigits: 92
    }
  },
  {
    id: "viet-standard",
    name: "หวยฮานอย",
    type: "international",
    group: "เวียดนาม",
    status: "open",
    openTime: "2024-05-28T01:00:00+07:00",
    closeTime: "2024-05-28T17:45:00+07:00",
    description: "ฮานอยปกติ เปิด 01:00 ปิด 17:45 ออกผล ~18:30",
    minBet: 5,
    maxBet: 15000,
    payout: {
      threeDigits: 800,
      twoDigits: 92
    }
  },
  {
    id: "viet-vip",
    name: "หวยฮานอย วีไอพี",
    type: "international",
    group: "เวียดนาม",
    status: "open",
    openTime: "2024-05-28T01:00:00+07:00",
    closeTime: "2024-05-28T18:45:00+07:00",
    description: "ฮานอย VIP เปิด 01:00 ปิด 18:45 ออกผล ~19:30",
    minBet: 5,
    maxBet: 15000,
    payout: {
      threeDigits: 820,
      twoDigits: 92
    }
  }
];

export const users = [
  {
    id: "agent-01",
    username: "agentmaster",
    role: "agent",
    creditLimit: 150000,
    creditUsed: 32500,
    children: [
      { id: "member-01", username: "mthai", creditLimit: 20000, creditUsed: 8000 },
      { id: "member-02", username: "msingapore", creditLimit: 15000, creditUsed: 2500 }
    ]
  },
  {
    id: "admin-01",
    username: "superadmin",
    role: "admin",
    creditLimit: 500000,
    creditUsed: 127000,
    children: []
  }
];

export const announcements = [
  {
    id: "ann-01",
    title: "โปรโมชันพิเศษ",
    body: "ปรับอัตราจ่ายหวยรัฐบาลไทย 3 ตัวบน 950  สำหรับโพยวันนี้",
    level: "info",
    expiresAt: "2024-05-31T23:59:00+07:00"
  },
  {
    id: "ann-02",
    title: "แจ้งเตือนปิดปรับปรุง",
    body: "ระบบฝาก-ถอน จะปิดให้บริการ 02:00-03:00 น. คืนนี้",
    level: "warning",
    expiresAt: "2024-05-29T03:00:00+07:00"
  }
];

export const purchaseHistory = [
  {
    id: "ticket-001",
    member: "mthai",
    lotteryId: "th-lottery",
    betNumbers: ["123", "45"],
    amount: 200,
    potentialPayout: 1810,
    status: "pending",
    createdAt: "2024-05-28T12:00:00+07:00"
  },
  {
    id: "ticket-002",
    member: "msingapore",
    lotteryId: "lao-lottery",
    betNumbers: ["777", "21"],
    amount: 150,
    potentialPayout: 1275,
    status: "won",
    createdAt: "2024-05-27T19:15:00+07:00"
  }
];

export const defaultResults = {
  "th-lottery": {
    title: "ผลหวยรัฐบาลไทย",
    drawDate: "2025-12-01",
    firstPrize: "458145",
    frontThree: ["242", "602"],
    backThree: ["239", "389"],
    twoDigits: "37",
    nearFirst: ["458144", "458146"]
  },
  "gsb-lottery": {
    title: "ผลหวยออมสิน",
    drawDate: "2025-12-01",
    firstPrize: "763895",
    frontThree: ["763", "895"],
    backThree: ["895", "763"],
    twoDigits: "95",
    nearFirst: ["763894", "763896"]
  },
  "baac-lottery": {
    title: "ผลหวย ธกส",
    drawDate: "2025-12-01",
    firstPrize: "284516",
    frontThree: ["284", "516"],
    backThree: ["516", "284"],
    twoDigits: "16",
    nearFirst: ["284515", "284517"]
  },
  "lao-lottery": {
    title: "ผลหวยลาวพัฒนา",
    drawDate: "2025-11-26",
    threeDigits: "541",
    twoDigits: "41",
    extra: ["41", "09", "08", "16", "15"]
  },
  "lao-vip": {
    title: "ผลหวยลาว VIP",
    drawDate: "2025-11-26",
    threeDigits: "782",
    twoDigits: "82",
    extra: ["82", "19", "07", "24", "33"]
  },
  "lao-star": {
    title: "ผลหวยลาวสตาร์",
    drawDate: "2025-11-26",
    threeDigits: "546",
    twoDigits: "46",
    extra: ["46", "19", "06", "14", "30"]
  },
  "viet-standard": {
    title: "ผลหวยฮานอย",
    drawDate: "2025-12-13",
    threeDigits: "671",
    twoDigits: "41",
    extra: {
      twoTop: "71",
      twoBottom: "41"
    }
  },
  "viet-special": {
    title: "ผลหวยฮานอย พิเศษ",
    drawDate: "2025-12-13",
    threeDigits: "671",
    twoDigits: "41",
    extra: {
      twoTop: "71",
      twoBottom: "41"
    }
  },
  "viet-vip": {
    title: "ผลหวยฮานอย วีไอพี",
    drawDate: "2025-12-13",
    threeDigits: "611",
    twoDigits: "37",
    extra: {
      twoTop: "11",
      twoBottom: "37"
    }
  }
};
