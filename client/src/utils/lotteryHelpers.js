export function padNumber(value, digits) {
  return value.toString().padStart(digits, "0");
}

export function generateRandomNumbers(count, digits, pool = []) {
  const source = pool.length > 0 ? pool : Array.from({ length: 10 ** digits }, (_, idx) => padNumber(idx, digits));
  const result = new Set();
  while (result.size < count && result.size < source.length) {
    const pick = source[Math.floor(Math.random() * source.length)];
    result.add(pick);
  }
  return Array.from(result);
}

export function generatePermutations(value) {
  if (!value) return [];
  const chars = value.split("");
  const used = new Array(chars.length).fill(false);
  const results = new Set();

  function dfs(path) {
    if (path.length === chars.length) {
      results.add(path.join(""));
      return;
    }
    for (let i = 0; i < chars.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      path.push(chars[i]);
      dfs(path);
      path.pop();
      used[i] = false;
    }
  }

  dfs([]);
  return Array.from(results);
}

export function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatDrawDateLabel(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

export function getTimeRemaining(closeTime) {
  if (!closeTime) {
    return { total: 0, days: 0, hours: "00", minutes: "00", seconds: "00" };
  }
  const total = new Date(closeTime).getTime() - Date.now();
  const safe = Math.max(total, 0);
  const days = Math.floor(safe / (1000 * 60 * 60 * 24));
  const hours = String(Math.floor((safe % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))).padStart(2, "0");
  const minutes = String(Math.floor((safe % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, "0");
  const seconds = String(Math.floor((safe % (1000 * 60)) / 1000)).padStart(2, "0");
  return { total, days, hours, minutes, seconds };
}

export function formatBetNumbers(value) {
  if (!value) return "-";
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.join(", ");
      }
    } catch {
      // ignore parse failure and fall back to the raw string
    }
    return value;
  }
  return "-";
}
