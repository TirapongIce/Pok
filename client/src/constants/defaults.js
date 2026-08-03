export const fallbackLotteries = [
  {
    id: "th-lottery",
    name: "หวยไทย",
    status: "open",
    group: "ประเทศไทย",
    flag: "🇹🇭",
    openTime: "2024-05-28T08:00:00+07:00",
    closeTime: "2024-06-01T15:00:00+07:00",
    description: "สลากกินแบ่งรัฐบาลไทย"
  },
  {
    id: "gsb-lottery",
    name: "หวยออมสิน",
    status: "open",
    group: "ประเทศไทย",
    flag: "🏦",
    openTime: "2024-05-28T08:00:00+07:00",
    closeTime: "2024-06-01T15:00:00+07:00",
    description: "หวยออมสิน"
  },
  {
    id: "baac-lottery",
    name: "หวย ธกส",
    status: "open",
    group: "ประเทศไทย",
    flag: "🏦",
    openTime: "2024-05-28T08:00:00+07:00",
    closeTime: "2024-06-01T15:00:00+07:00",
    description: "หวย ธกส"
  },
  {
    id: "lao-lottery",
    name: "หวยลาว",
    status: "open",
    group: "สปป.ลาว",
    flag: "🇱🇦",
    openTime: "2024-05-28T10:00:00+07:00",
    closeTime: "2024-05-30T20:00:00+07:00",
    description: "ลาวพัฒนา"
  },
  {
    id: "lao-vip",
    name: "หวยลาว VIP",
    status: "open",
    group: "สปป.ลาว",
    flag: "🇱🇦",
    openTime: "2024-05-28T10:00:00+07:00",
    closeTime: "2024-05-30T20:00:00+07:00",
    description: "ลาว VIP"
  },
  {
    id: "lao-star",
    name: "หวยลาวสตาร์",
    status: "open",
    group: "สปป.ลาว",
    flag: "🇱🇦",
    openTime: "2024-05-28T10:00:00+07:00",
    closeTime: "2024-05-30T20:00:00+07:00",
    description: "ลาวสตาร์"
  },
  {
    id: "viet-special",
    name: "หวยฮานอย พิเศษ",
    status: "open",
    group: "เวียดนาม",
    flag: "🇻🇳",
    openTime: "2024-05-28T01:00:00+07:00",
    closeTime: "2024-05-28T16:45:00+07:00",
    description: "ออกผลทุกวัน ~17:30 น."
  },
  {
    id: "viet-standard",
    name: "หวยฮานอย",
    status: "open",
    group: "เวียดนาม",
    flag: "🇻🇳",
    openTime: "2024-05-28T01:00:00+07:00",
    closeTime: "2024-05-28T17:45:00+07:00",
    description: "ออกผลทุกวัน ~18:30 น."
  },
  {
    id: "viet-vip",
    name: "หวยฮานอย วีไอพี",
    status: "open",
    group: "เวียดนาม",
    flag: "🇻🇳",
    openTime: "2024-05-28T01:00:00+07:00",
    closeTime: "2024-05-28T18:45:00+07:00",
    description: "ออกผลทุกวัน ~19:30 น."
  }
];

export const defaultResults = {
  "th-lottery": {
    title: "ผลหวยรัฐบาลไทย",
    drawDate: "2025-11-16",
    firstPrize: "458145",
    frontThree: ["242", "602"],
    backThree: ["239", "389"],
    twoDigits: "37",
    nearFirst: ["458144", "458146"]
  },
  "gsb-lottery": {
    title: "ผลหวยออมสิน",
    drawDate: "2025-11-16",
    firstPrize: "763895",
    frontThree: ["763", "895"],
    backThree: ["895", "763"],
    twoDigits: "95",
    nearFirst: ["763894", "763896"]
  },
  "baac-lottery": {
    title: "ผลหวย ธกส",
    drawDate: "2025-11-16",
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
