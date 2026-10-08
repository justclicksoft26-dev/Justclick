# Attendance Agent

يسحب البصمات من جهاز ZK على الشبكة المحلية ويرسلها للسيرفر على الـ VPS كل بضع دقائق، ويعمل كـ Windows Service.

## قبل التشغيل
1. على الـ VPS: تأكد من وجود `AGENT_API_KEY` في ملف `.env` الخاص بالسيرفر، ثم أعد تشغيل السيرفر.
2. على الجهاز المحلي (نفس شبكة جهاز البصمة): ثبّت Node.js 18 أو أحدث، وانسخ مجلد `agent`.
3. انسخ `agent.config.example.json` إلى `agent.config.json` واملأه:
   - `deviceIp` / `devicePort`: عنوان جهاز البصمة (المنفذ الافتراضي 4370).
   - `serverUrl`: رابط السيرفر (يفضل https).
   - `apiKey`: نفس قيمة `AGENT_API_KEY` في السيرفر.
   - `intervalMinutes`: فترة السحب بالدقائق.
4. `npm install` داخل مجلد `agent`.

## تجربة يدوية
```
npm run once
```
يسحب مرة واحدة ويطبع النتيجة. السجل في `logs/agent.log`.

## التثبيت كخدمة (Administrator)
```
npm run service:install
npm run service:uninstall
```
الخدمة اسمها `AttendanceAgent`، تبدأ مع ويندوز وتعيد التشغيل لو وقعت. من `services.msc` اضبط نوع التشغيل **Automatic (Delayed Start)**، وأوقف الـ Sleep من إعدادات الطاقة.

## ملاحظات
- لو السيرفر غير متاح تُعاد المحاولة تلقائيا في الدورة التالية ولا تضيع حركات.
- التكرار آمن: السيرفر يتجاهل أي حركة مكررة.
- `agent.config.json` يحتوي المفتاح السري، لا ترفعه على git.
