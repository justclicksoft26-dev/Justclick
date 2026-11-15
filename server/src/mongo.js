// One MongoDB connection shared by the web check-in (/api/attendance) and its report.
//   WEB_MONGO_URI   mongodb URI, may contain <db_username> / <db_password> placeholders
//   WEB_MONGO_USER, WEB_MONGO_PASS   filled into the placeholders
import dns from 'node:dns';
import { MongoClient } from 'mongodb';

let dbP;
export function getDb() {
  dbP ??= (async () => {
    let uri = process.env.WEB_MONGO_URI;
    if (!uri) throw new Error('WEB_MONGO_URI غير مضبوط في ملف .env');
    uri = uri
      .replace('<db_username>', encodeURIComponent(process.env.WEB_MONGO_USER ?? ''))
      .replace('<db_password>', encodeURIComponent(process.env.WEB_MONGO_PASS ?? ''));
    dns.setServers(['8.8.8.8', '1.1.1.1']); // some resolvers refuse SRV lookups
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    const db = client.db();
    // idempotent: same keys/options as the ones created earlier by attendance-system
    await Promise.all([
      db.collection('otps').createIndex({ email: 1 }, { unique: true }),
      db.collection('otps').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 600 }),
      db.collection('employees').createIndex({ email: 1 }, { unique: true }),
      db.collection('attendance_logs').createIndex({ email: 1, date: 1, type: 1 }, { unique: true }),
    ]);
    return db;
  })();
  dbP.catch(() => { dbP = undefined; }); // retry on the next request
  return dbP;
}
