// Deterministic synthetic fixtures. These values do not attest to official results.
import http from 'node:http';
const prize = (...values) => ({ number: values.map((value, i) => ({ value, round: i + 1 })) });
const fixtures = Object.fromEntries([
  ['2026-10-01', '402701'], ['2026-09-16', '730640']
].map(([date, first]) => [date, { date, data: { first: prize(first), last3f: prize('791', '912'), last3b: prize('058', '396'), last2: prize('70'), near1: prize() } }]));
http.createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const result = fixtures[`${body.year}-${body.month}-${body.date}`];
  const response = req.url.endsWith('getLatestLottery') ? fixtures['2026-10-01'] : { result };
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ response }));
}).listen(Number(process.env.MOCK_GLO_PORT || 4499), '127.0.0.1', () => console.log('Synthetic GLO fixture server ready'));
