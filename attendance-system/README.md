# Attendance System (React + Node)

Flow: email (@horizon.sch.sa) -> OTP by email -> attendance page with 4 periods
(8-10, 10-12, 12-2, 2-4). The current period (Asia/Riyadh time, decided by the server) is
auto-selected, the others are disabled. Employee clicks Present / Absent and it is stored in MongoDB
(`MONGODB_URI` in `server/.env`, collection `attendances`: email, date, slot, status, recordedAt, ip, userAgent).
One record per employee per period.

## Run

```bash
# terminal 1
cd server
cp .env.example .env     # set JWT_SECRET and SMTP_* 
npm install
npm start

# terminal 2
cd client
npm install
npm run dev              # http://localhost:5173
```

If `SMTP_HOST` is empty the OTP is printed in the server console (dev only).
Requires a running MongoDB (local or Atlas).
