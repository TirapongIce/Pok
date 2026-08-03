# Lottery Sync System PRD
**สำหรับทีมผู้พัฒนาคนถัดไป**

---

## 📋 Overview

ระบบนี้มีฟีเจอร์การ **Sync ผลหวยอัตโนมัติและแบบ manual** สำหรับหวยไทยและหวยลาว เพื่อให้ระบบสามารถดึงผลรางวัลจากแหล่งภายนอก และจัดเก็บไว้ในฐานข้อมูล เพื่อใช้ประเมินผลเดิมพันของผู้ใช้

---

## 🎯 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DemoPok Lottery System                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐        ┌──────────────────────┐       │
│  │  Thai Lottery   │        │  Laotian Lottery     │       │
│  │  External API   │        │  Manual Seed Scripts │       │
│  └────────┬────────┘        └──────────┬───────────┘       │
│           │                            │                   │
│           └──────────────┬─────────────┘                   │
│                          │                                 │
│                  ┌───────▼────────┐                        │
│                  │ Admin Endpoint │                        │
│                  │  /api/admin/   │                        │
│                  │  sync/         │                        │
│                  │  thai-lottery  │                        │
│                  └───────┬────────┘                        │
│                          │                                 │
│              ┌───────────▼───────────┐                     │
│              │  upsertLotteryResult  │                     │
│              │  (Repository Layer)   │                     │
│              └───────────┬───────────┘                     │
│                          │                                 │
│          ┌───────────────▼───────────────┐                │
│          │   lottery_results table       │                │
│          │   (PostgreSQL Database)       │                │
│          └───────────────────────────────┘                │
│                                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 🇹🇭 Thai Lottery Sync Flow

### Data Source
- **External API**: `https://lotto.api.rayriffy.com`
- **Endpoint**: `/list/{page}` (list draw IDs) + `/lotto/{id}` (detailed results)

### Implementation Location
- **Service**: `server/src/services/thaiLottoSync.js` → `syncThaiLottoFromApi()`
- **Admin Endpoint**: `POST /api/admin/sync/thai-lottery`
- **Repository**: `managementRepository.js` → `upsertLotteryResult()`

### Process Flow

#### Step 1: Fetch Draw IDs
```javascript
// Fetches latest draw IDs from API
const ids = await fetchThaiDrawIds({ pages: 2, max: 10 });
// Returns array of draw IDs like: ["221215", "221201", ...]
```

#### Step 2: Parse Date from ID
```javascript
// Thai ID format: DDMMYEEE (YYYY+543 in Thai calendar)
// Example: "121225" = Dec 12, 2568 Thai (2025 AD)
function toIsoDateFromId(id) {
  // "121225" → "2025-12-12"
  return `${year}-${month}-${day}`;
}
```

#### Step 3: Fetch & Parse Detailed Result
```javascript
// API response format
{
  status: "success",
  response: {
    date: "12 ธันวาคม 2568",  // Thai format
    prizes: [{
      number: "123456"  // First prize
    }],
    runningNumbers: [
      { number: ["111", "222"] },  // Front 3-digit
      { number: ["333", "444"] },  // Back 3-digit
      { number: "55" }  // 2-digit
    ],
    nearbyNumber: ["999", "888"]  // Near first
  }
}
```

#### Step 4: Transform & Store
```javascript
// Transformed payload
{
  lotteryCode: "th-lottery",
  drawDate: "2025-12-12",  // ISO format
  firstPrize: "123456",
  frontThree: ["111", "222"],
  backThree: ["333", "444"],
  twoDigits: "55",
  nearFirst: ["999", "888"]
}
// → upsertLotteryResult() → lottery_results table
```

### Request to Admin Endpoint
```bash
POST /api/admin/sync/thai-lottery
Headers:
  x-session-token: <admin-token>
  Content-Type: application/json

Body:
{
  "pages": 2,      # Number of API pages to fetch
  "max": 10        # Max draws to sync
}

Response:
{
  "totalFetched": 10,
  "saved": 8,
  "results": [...],  # Saved records
  "skipped": [...]   # Failed records with reasons
}
```

### Validation Rules
- ✅ Skip draws with masked numbers (xxxx) - future draws
- ✅ Skip duplicate drawDates (prevent duplicates)
- ✅ Extract drawDate from Thai date string or ID
- ✅ Handle missing prize data gracefully

---

## 🇱🇦 Laotian Lottery Manual Sync Flow

### Data Source
- **Input**: Raw Thai text in seed scripts
- **Location**: `server/scripts/seedLao*.js` files

### Supported Lottery Types

| Code | Name | Script | Prize Structure |
|------|------|--------|-----------------|
| `lao-lottery` | Standard | `seedLaoResults.js` | 4-digit, 3-digit, 2-digit |
| `lao-vip` | VIP | `seedLaoResults.js` (section 2) | 4-digit, 3-digit, 2-digit |
| `lao-star` | Star | `seedLaoResults.js` (section 3) | 4-digit, 3-digit, 2-digit |

### Implementation Location
- **Scripts**: `server/scripts/seedLao*.js`, `seedViet*.js`
- **Entry Point**: `node scripts/seedLaoResults.js`
- **Function**: Parses raw text → transforms → calls `upsertLotteryResult()`

### Text Format (Input)

```
ตรวจหวยลาว งวดประจำวันที่ 12 ธันวาคม 2568
เลข 4 ตัว : 4546
เลข 3 ตัว : 546
เลข 2 ตัว : 46

ตรวจหวยลาว งวดประจำวันที่ 10 ธันวาคม 2568
เลข 4 ตัว : 7817
เลข 3 ตัว : 817
เลข 2 ตัว : 17
```

### Parse Algorithm

```javascript
function parseLaoHistoryRaw() {
  // 1. Split by "ตรวจหวยลาว งวดประจำวันที่"
  // 2. For each block:
  //    - Extract date: "12 ธันวาคม 2568"
  //    - Convert to ISO: "2025-12-12"
  //    - Extract 4-digit, 3-digit, 2-digit numbers
  // 3. Transform to:
  //    {
  //      lotteryCode: "lao-lottery",
  //      drawDate: "2025-12-12",
  //      firstPrize: "4546",        // 4-digit
  //      frontThree: ["546"],       // 3-digit (as single array)
  //      twoDigits: "46"            // 2-digit
  //    }
  // 4. Call upsertLotteryResult()
}
```

### Run Seed Script
```bash
cd server
npm run seed:lao
# or
node scripts/seedLaoResults.js
```

### Validation & Error Handling
- ✅ Parse Thai date strings
- ✅ Handle month name → month number conversion
- ✅ Convert Buddhist year (YY+543) to AD
- ✅ Skip malformed entries
- ✅ Warn on duplicate drawDates

---

## 📊 Data Model - lottery_results Table

### Schema
```sql
CREATE TABLE lottery_results (
  id SERIAL PRIMARY KEY,
  lottery_code VARCHAR(50),        -- "th-lottery", "lao-lottery", "viet-standard", etc.
  draw_date DATE,                  -- ISO format: YYYY-MM-DD
  
  -- Prize numbers
  first_prize VARCHAR(20),         -- 6-digit Thai / 4-digit Lao
  front_three_a VARCHAR(10),       -- 1st "3-ตัว หน้า"
  front_three_b VARCHAR(10),       -- 2nd "3-ตัว หน้า"
  back_three_a VARCHAR(10),        -- 1st "3-ตัว หลัง"
  back_three_b VARCHAR(10),        -- 2nd "3-ตัว หลัง"
  two_digits VARCHAR(10),          -- 2-digit prize
  three_digits VARCHAR(10),        -- 3-digit (Viet only)
  near_first_a VARCHAR(10),        -- Near first (1st)
  near_first_b VARCHAR(10),        -- Near first (2nd)
  
  -- Flexible storage
  extra JSON,                       -- Additional data (future use)
  
  -- Metadata
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  UNIQUE (lottery_code, draw_date)  -- One result per lottery per day
);
```

### Object Representation (JavaScript)

```javascript
{
  lotteryCode: "th-lottery",
  drawDate: "2025-12-12",
  
  // Prize data
  firstPrize: "123456",
  frontThree: ["111", "222"],      // Array of up to 2
  backThree: ["333", "444"],       // Array of up to 2
  twoDigits: "55",
  threeDigits: null,               // Viet only
  nearFirst: ["999", "888"],       // Array of up to 2
  
  // Extra flexible field
  extra: {
    source: "api",
    fetchedAt: "2025-12-15T10:45:00Z"
  }
}
```

---

## 🔌 API Endpoints

### Admin: Sync Thai Lottery
```
POST /api/admin/sync/thai-lottery
Authentication: x-session-token (admin only)

Request Body:
{
  "pages": 2,      // API pages to fetch (default: 2)
  "max": 10        // Max draws per page (default: 5)
}

Response 200:
{
  "totalFetched": 10,
  "saved": 8,
  "results": [
    {
      "lotteryCode": "th-lottery",
      "drawDate": "2025-12-12",
      "firstPrize": "123456",
      ...
    }
  ],
  "skipped": [
    {
      "id": "121225",
      "reason": "missing draw date or masked numbers"
    }
  ]
}

Response 503 (No DB):
{
  "message": "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน"
}

Response 403 (Not Admin):
{
  "message": "ต้องเป็นผู้ดูแลระบบ"
}
```

### Admin: Manually Upsert Lottery Result
```
POST /api/admin/lottery-results
Authentication: x-session-token (admin only)

Request Body:
{
  "lotteryCode": "lao-lottery",
  "drawDate": "2025-12-12",
  "firstPrize": "4546",
  "frontThree": ["546"],
  "backThree": [],
  "twoDigits": "46",
  "nearFirst": []
}

Response 200:
{
  "lotteryCode": "lao-lottery",
  "drawDate": "2025-12-12",
  "firstPrize": "4546",
  ...
}
```

### Public: Get Latest Results
```
GET /api/latest-results?codes=th-lottery,lao-lottery
No authentication required

Response 200:
{
  "th-lottery": {
    "lotteryCode": "th-lottery",
    "drawDate": "2025-12-12",
    "firstPrize": "123456",
    ...
  },
  "lao-lottery": {
    "lotteryCode": "lao-lottery",
    "drawDate": "2025-12-10",
    "firstPrize": "7817",
    ...
  }
}
```

---

## 🎲 Lottery Code Mapping

```javascript
const lotteryCodeMap = {
  "th-lottery": "Thai National Lottery",
  "lao-lottery": "Lao Lottery",
  "lao-vip": "Lao VIP",
  "lao-star": "Lao Star",
  "viet-standard": "Vietnam Standard",
  "viet-special": "Vietnam Special",
  "viet-vip": "Vietnam VIP"
};

const lotteryKind = {
  "th-lottery": "thai",
  "lao-*": "lao",
  "viet-*": "viet"
};
```

---

## 🔄 Evaluation Flow (After Sync)

Once results are synced to `lottery_results` table, the system can evaluate tickets:

### Step 1: Fetch Synced Result
```javascript
const result = await fetchResultForDraw("th-lottery", "2025-12-12");
// Returns: { firstPrize: "123456", backThree: ["333", "444"], ... }
```

### Step 2: Evaluate User Tickets
```javascript
POST /api/admin/lottery-results/{lotteryCode}/{drawDate}/evaluate

// Evaluates all tickets for this lottery/date against synced result
// Updates ticket statuses: "won", "lost"
// Calculates payouts
```

### Step 3: Mark Payouts
Admin manually confirms wins via UI, triggering:
```
POST /api/admin/tickets/{ticketId}/confirm-win
```

---

## 📦 Repository Functions (Server-Side)

### Core Functions in managementRepository.js

```javascript
// ✅ Store/update result
await upsertLotteryResult({
  lotteryCode: "th-lottery",
  drawDate: "2025-12-12",
  firstPrize: "123456",
  frontThree: ["111", "222"],
  backThree: ["333", "444"],
  twoDigits: "55",
  nearFirst: ["999", "888"]
})

// ✅ Fetch latest result for a lottery
const result = await fetchLatestResults(["th-lottery", "lao-lottery"])
// Returns: { "th-lottery": {...}, "lao-lottery": {...} }

// ✅ Fetch result for specific draw
const result = await fetchResultForDraw("th-lottery", "2025-12-12")
// Returns: { lotteryCode, drawDate, firstPrize, ... }
```

### Service Functions in thaiLottoSync.js

```javascript
// ✅ Full sync from Thai API
const result = await syncThaiLottoFromApi({ pages: 2, max: 10 })
// Returns: { totalFetched, saved, results, skipped }

// ✅ Helper: Fetch draw IDs from API
const ids = await fetchThaiDrawIds({ pages: 2, max: 20 })

// ✅ Helper: Transform API response to payload
const payload = mapThaiResponseToPayload(apiResponse)

// ✅ Helper: Parse Thai date string
const isoDate = toIsoDate("12 ธันวาคม 2568")  // "2025-12-12"
```

---

## 🚀 How to Extend (For Next Dev Team)

### Adding a New Lottery Type (e.g., Myanmar)

#### 1. Create Service Layer
```javascript
// server/src/services/myanmarLottoSync.js
export async function syncMyanmarLottoFromApi() {
  // Fetch from Myanmar API
  // Parse date & numbers
  // Transform to standard payload
  // Call upsertLotteryResult()
  return { saved, skipped, ... }
}
```

#### 2. Add Admin Endpoint
```javascript
// In server/src/index.js
app.post("/api/admin/sync/myanmar-lottery", async (req, res) => {
  // Auth check
  // Call syncMyanmarLottoFromApi()
  // Return result
})
```

#### 3. Or Create Seed Script
```javascript
// server/scripts/seedMyanmarResults.js
import { upsertLotteryResult } from "../src/repositories/managementRepository.js"

// Parse Myanmar data
// Call upsertLotteryResult in loop
// Log results
```

#### 4. Add Lottery Record
```javascript
app.post("/api/admin/lotteries", async (req, res) => {
  // Create entry in lotteries table
  await upsertLottery({
    code: "myanmar-lottery",
    name: "Myanmar Lottery",
    kind: "myanmar",
    openTime: "2025-12-10T13:00:00Z",
    closeTime: "2025-12-10T14:00:00Z",
    status: "open"
  })
})
```

### Testing Sync Flow

```bash
# 1. Start server
npm run dev --prefix server

# 2. Admin login
curl -X POST http://localhost:4001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"Sup3rDemo!"}'

# 3. Get session token from response
# → x-session-token: abc123...

# 4. Trigger Thai sync
curl -X POST http://localhost:4001/api/admin/sync/thai-lottery \
  -H "x-session-token: abc123..." \
  -H "Content-Type: application/json" \
  -d '{"pages":1,"max":5}'

# 5. Check results
curl http://localhost:4001/api/latest-results?codes=th-lottery
```

---

## 🐛 Troubleshooting

### Problem: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" (DB not ready)
**Solution**: Set DB env vars:
```bash
export DB_HOST=localhost
export DB_USER=postgres
export DB_PASSWORD=pass
export DB_NAME=huay_aud_db
export DB_PORT=5432
```

### Problem: "ต้องเป็นผู้ดูแลระบบ" (Not admin)
**Solution**: Login with admin account, get x-session-token

### Problem: Sync returns 0 saved but totalFetched > 0
**Possible causes**:
- All draws have masked numbers (future draws)
- All draws already synced (duplicate drawDates)
- API format changed
- Date parsing failed

**Debug**: Check `skipped` array for detailed reasons

### Problem: Thai API is down
**Fallback**: Use seed scripts to manually input data, or implement different API source

---

## 📚 Key Files Reference

| File | Purpose |
|------|---------|
| `server/src/services/thaiLottoSync.js` | Thai API sync logic |
| `server/src/repositories/managementRepository.js` | Database queries |
| `server/scripts/seedLaoResults.js` | Lao manual data |
| `server/src/index.js` | API endpoints |
| `server/schema.sql` | Database schema |
| `server/src/data.js` | Demo fallback data |

---

## ✅ Checklist for Handoff

- [ ] Thai sync endpoint tested and working
- [ ] Lao seed script runs without errors
- [ ] Results stored in lottery_results table
- [ ] Latest results API returns correct data
- [ ] Evaluation logic tested
- [ ] Admin panel shows synced results
- [ ] DB schema includes all lottery codes
- [ ] Error handling covers edge cases
- [ ] Thai date parsing handles all formats
- [ ] Documentation updated for new dev team

---

**Version**: 1.0  
**Last Updated**: Dec 28, 2024  
**Owner**: DemoPok Dev Team  
**Next Team**: [Your Team Name]
