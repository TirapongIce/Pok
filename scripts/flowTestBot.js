#!/usr/bin/env node
import crypto from "node:crypto";

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
  if (token) finalHeaders["x-session-token"] = token;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: finalHeaders
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Request ${path} failed (${res.status}): ${text || "unknown"}`);
  }
  try {
    return JSON.parse(text || "null");
  } catch {
    return text;
  }
}

async function login(username, password) {
  return request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
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

async function purchase(token, payload) {
  return request("/api/purchases", { method: "POST", token, body: JSON.stringify(payload) });
}

async function main() {
  console.log("Flow test bot starting...");

  // 1) Admin login
  const adminSession = await login(ADMIN_USER, ADMIN_PASS);
  const adminToken = adminSession.token;
  console.log(`Logged in as admin: ${adminSession.profile.username}`);

  // 2) Create a new user
  const testUsername = `botuser_${Date.now().toString(36)}`;
  const testPassword = "DemoUser123!";
  console.log(`Creating test user '${testUsername}'`);
  const created = await createUser(adminToken, { username: testUsername, password: testPassword, role: "agent", creditLimit: 100000 });
  console.log("Created user:", created);

  // 3) Add credit (deposit) to the user
  console.log("Depositing credit to user...");
  const depositInfo = await deposit(adminToken, created.id, 20000);
  console.log("Deposit result:", depositInfo);

  // 4) Login as the created user
  const userSession = await login(testUsername, testPassword);
  const userToken = userSession.token;
  console.log(`Logged in as user: ${userSession.profile.username}`);

  // 5) Prepare purchase: thai lottery, standard payouts
  // We'll buy one 3-digit (three-top), one 2-digit (two-top), and one 1-digit (run-top)
  const items = [
    { number: "258", betType: "three-top", amount: 100 },
    { number: "71", betType: "two-top", amount: 50 },
    { number: "5", betType: "run-top", amount: 20 }
  ];
  const bets = items.map((i) => i.number);
  const gross = items.reduce((s, it) => s + Number(it.amount || 0), 0);

  const payload = {
    lotteryId: "th-lottery",
    bets,
    amount: gross,
    promotionCode: null,
    meta: {
      grossAmount: gross,
      netAmount: gross,
      betTypes: Array.from(new Set(items.map((i) => i.betType))),
      category: "mixed",
      items
    }
  };

  console.log("Submitting purchase:", payload);
  const ticket = await purchase(userToken, payload);
  console.log("Purchase result:", ticket);

  console.log("Flow test completed.");
}

main().catch((err) => {
  console.error("Flow bot failed:", err);
  process.exit(1);
});
