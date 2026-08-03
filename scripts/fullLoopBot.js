#!/usr/bin/env node
const crypto = require("node:crypto");

if (typeof fetch !== "function") {
  console.error("This bot requires Node.js 18+ with the global fetch API.");
  process.exit(1);
}

const BASE_URL = process.env.HUAY_AUD_API || "http://localhost:4001";
const ADMIN_USER = process.env.HUAY_SUPERADMIN_USER || "superadmin";
const ADMIN_PASS = process.env.HUAY_SUPERADMIN_PASSWORD || "Sup3rDemo!";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function request(path, { token, headers, ...options } = {}) {
  const finalHeaders = {
    "Content-Type": "application/json",
    ...(headers || {})
  };
  if (token) {
    finalHeaders["x-session-token"] = token;
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: finalHeaders
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Request ${path} failed (${response.status}): ${errorText || "unknown error"}`);
  }
  return response.json();
}

async function login(username, password) {
  const body = JSON.stringify({ username, password: sha256(password) });
  return request("/api/auth/login", { method: "POST", body });
}

async function createUser(token, { username, password, role = "agent", creditLimit = 0 }) {
  const body = JSON.stringify({ username, password, role, creditLimit });
  return request("/api/admin/users", { method: "POST", token, body });
}

async function deposit(token, userId, amount) {
  return request(`/api/admin/users/${userId}/deposit`, {
    method: "POST",
    token,
    body: JSON.stringify({ amount })
  });
}

async function withdraw(token, userId, amount) {
  return request(`/api/admin/users/${userId}/withdraw`, {
    method: "POST",
    token,
    body: JSON.stringify({ amount })
  });
}

async function addRestriction(token, payload) {
  return request("/api/admin/number-restrictions", {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

async function saveResult(token, payload) {
  return request("/api/admin/lottery-results", {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

async function purchase(token, payload) {
  return request("/api/purchases", {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

async function main() {
  console.log("🤖  Running ระบบหวย full-loop bot...");
  const summary = {
    createdUser: null,
    credit: {},
    tickets: [],
    restrictions: [],
    latestResults: {}
  };

  const adminSession = await login(ADMIN_USER, ADMIN_PASS);
  const adminToken = adminSession.token;
  console.log(`✅ Logged in as ${adminSession.profile.username}`);

  const newUsername = `bot${Date.now().toString(36)}`;
  const newPassword = "DemoBot123!";
  const newUser = await createUser(adminToken, {
    username: newUsername,
    password: newPassword,
    role: "agent",
    creditLimit: 80000
  });
  summary.createdUser = { id: newUser.id, username: newUsername };
  console.log(`👤 Created test user ${newUsername} (id ${newUser.id})`);

  const depositInfo = await deposit(adminToken, newUser.id, 20000);
  console.log(`💰 Deposit: credit used ${Number(depositInfo.creditUsed).toLocaleString()}`);

  const withdrawInfo = await withdraw(adminToken, newUser.id, 5000);
  console.log(`📤 Withdraw: credit used ${Number(withdrawInfo.creditUsed).toLocaleString()}`);
  summary.credit = {
    limit: withdrawInfo.creditLimit,
    used: withdrawInfo.creditUsed
  };

  const agentSession = await login(newUsername, newPassword);
  const agentToken = agentSession.token;
  console.log(`🎯 Logged in as ${newUsername} for betting`);

  const thaiTicket = await purchase(agentToken, {
    lotteryId: "th-lottery",
    bets: ["123", "456", "78"],
    amount: 250,
    meta: {
      betTypes: ["three-top", "two-bottom", "run-top"],
      category: "three",
      options: { reverse: true },
      items: [
        { number: "123", betType: "three-top", amount: 150 },
        { number: "456", betType: "two-bottom", amount: 50 },
        { number: "78", betType: "run-top", amount: 50 }
      ]
    }
  });
  console.log(`🧾 Thai ticket created: ${thaiTicket.id}`);
  summary.tickets.push({ lottery: "th-lottery", id: thaiTicket.id, amount: thaiTicket.amount });

  const laoTicket = await purchase(agentToken, {
    lotteryId: "lao-lottery",
    bets: ["321", "55", "7"],
    amount: 180,
    meta: {
      betTypes: ["three-top", "two-top", "run-bottom"],
      category: "three",
      options: { reverse: false },
      items: [
        { number: "321", betType: "three-top", amount: 100 },
        { number: "55", betType: "two-top", amount: 50 },
        { number: "7", betType: "run-bottom", amount: 30 }
      ]
    }
  });
  console.log(`🧾 Lao ticket created: ${laoTicket.id}`);
  summary.tickets.push({ lottery: "lao-lottery", id: laoTicket.id, amount: laoTicket.amount });

  const restrictionPayloads = [
    { lotteryCode: "th-lottery", betType: "three-top", number: "999", payoutRate: 450, note: "เลขดังลดจ่าย" },
    { lotteryCode: "lao-lottery", betType: "two-bottom", number: "12", payoutRate: 65, note: "จำกัดยอดบิล" }
  ];
  for (const payload of restrictionPayloads) {
    await addRestriction(adminToken, payload);
  }
  const thaiRestrictionList = await request("/api/lotteries/th-lottery/restrictions");
  const laoRestrictionList = await request("/api/lotteries/lao-lottery/restrictions");
  summary.restrictions = [...thaiRestrictionList, ...laoRestrictionList];
  console.log(`🚧 Recorded ${summary.restrictions.length} number restrictions`);

  const today = new Date().toISOString().slice(0, 10);
  await saveResult(adminToken, {
    lotteryCode: "th-lottery",
    drawDate: today,
    firstPrize: "987654",
    frontThree: ["111", "222"],
    backThree: ["333", "444"],
    twoDigits: "55",
    nearFirst: ["987653", "987655"]
  });
  await saveResult(adminToken, {
    lotteryCode: "lao-lottery",
    drawDate: today,
    threeDigits: "025",
    twoDigits: "25"
  });

  const latestResults = await request("/api/lottery-results/latest");
  summary.latestResults = latestResults;
  console.log("🏁 Latest results synced.");

  console.log("\n==== BOT SUMMARY ====");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("Bot failed:", err);
  process.exit(1);
});
