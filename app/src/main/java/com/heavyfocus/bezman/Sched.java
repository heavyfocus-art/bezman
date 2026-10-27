package com.heavyfocus.bezman;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;

/**
 * Works out every alarm / reminder in the coming days and asks Android to wake the app for the next one.
 * Runs only on the child's phone.
 */
public final class Sched {
    private Sched() {}

    public static final String ALARM = "ALARM";         // wake-up alarm rings
    public static final String WAKE_CHECK = "WAKE_CHECK"; // 10 min later: did she stop it?
    public static final String PREP = "PREP";           // start getting ready
    public static final String LEAVE_SOON = "LEAVE_SOON"; // 5 minutes to leave
    public static final String LEAVE = "LEAVE";         // time to leave
    public static final String LEAVE_CHECK = "LEAVE_CHECK"; // 10 min after leave time
    public static final String TASK_SOON = "TASK_SOON"; // 30 min before task due
    public static final String TASK_DUE = "TASK_DUE";   // task due
    public static final String TASK_END = "TASK_END";   // end of the day: not marked = not done

    public static final class T {
        public final long time;
        public final String type, id, occ, title;
        public final long extra;

        T(long time, String type, String id, String occ, String title, long extra) {
            this.time = time;
            this.type = type;
            this.id = id;
            this.occ = occ;
            this.title = title;
            this.extra = extra;
        }
    }

    static List<JSONObject> mineOnly(Context c, JSONObject all, String kind) {
        String me = Store.myKid(c), legacy = Store.legacyKid(all);
        List<JSONObject> out = new ArrayList<>();
        for (JSONObject o : Store.list(all, kind)) if (Store.kidOf(o, legacy).equals(me)) out.add(o);
        return out;
    }

    /** All triggers with from < time <= to, sorted. */
    public static List<T> compute(Context c, long from, long to) {
        List<T> out = new ArrayList<>();
        JSONObject all = Store.items(c);
        List<JSONObject> alarms = mineOnly(c, all, "alarm");
        List<JSONObject> events = mineOnly(c, all, "event");
        List<JSONObject> tasks = mineOnly(c, all, "task");

        Calendar d = U.startOfDay(from);
        d.add(Calendar.DAY_OF_MONTH, -1);
        Calendar end = U.startOfDay(to);
        end.add(Calendar.DAY_OF_MONTH, 1);
        while (!d.after(end)) {
            String occ = U.occ(d);
            for (JSONObject a : alarms) {
                if (!a.optBoolean("on", true) || !U.occursOn(a, d) || U.isOff(all, a.optString("id"), occ)) continue;
                int m = U.mins(a.optString("time"));
                if (m < 0) continue;
                long t = U.at(d, m);
                String label = a.optString("label", "");
                out.add(new T(t, ALARM, a.optString("id"), occ, label, t));
                out.add(new T(t + 10 * U.MIN, WAKE_CHECK, a.optString("id"), occ, label, t));
            }
            for (JSONObject e : events) {
                if (!U.occursOn(e, d) || U.isOff(all, e.optString("id"), occ)) continue;
                long leave = U.leaveAt(e, occ);
                if (leave == 0) continue;
                String title = e.optString("title");
                int prep = Math.max(0, e.optInt("prep", 0));
                long prepAt = leave - prep * U.MIN;
                if (prep >= 10) out.add(new T(prepAt, PREP, e.optString("id"), occ, title, leave));
                if (leave - 5 * U.MIN > prepAt) out.add(new T(leave - 5 * U.MIN, LEAVE_SOON, e.optString("id"), occ, title, leave));
                out.add(new T(leave, LEAVE, e.optString("id"), occ, title, leave));
                out.add(new T(leave + 10 * U.MIN, LEAVE_CHECK, e.optString("id"), occ, title, leave));
            }
            for (JSONObject k : tasks) {
                if (!U.occursOn(k, d) || U.isOff(all, k.optString("id"), occ)) continue;
                int m = U.mins(k.optString("time"));
                if (m < 0) continue;
                long due = U.at(d, m);
                String title = k.optString("title");
                out.add(new T(due - 30 * U.MIN, TASK_SOON, k.optString("id"), occ, title, due));
                out.add(new T(due, TASK_DUE, k.optString("id"), occ, title, due));
                out.add(new T(U.at(d, 23 * 60 + 59), TASK_END, k.optString("id"), occ, title, due));
            }
            d.add(Calendar.DAY_OF_MONTH, 1);
        }
        List<T> res = new ArrayList<>();
        for (T t : out) if (t.time > from && t.time <= to) res.add(t);
        Collections.sort(res, (a, b) -> Long.compare(a.time, b.time));
        return res;
    }

    static PendingIntent firePi(Context c, int req) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(AlarmReceiver.FIRE);
        return PendingIntent.getBroadcast(c, req, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static PendingIntent showPi(Context c) {
        Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, 900, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** A real "alarm clock" alarm: most reliable, shows in the status bar. */
    static void setClock(Context c, long t, PendingIntent pi) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        try {
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(t, showPi(c)), pi);
        } catch (Exception e) {
            setExact(c, t, pi);
        }
    }

    static void setExact(Context c, long t, PendingIntent pi) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi);
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi);
            }
        } catch (Exception e) {
            try {
                am.set(AlarmManager.RTC_WAKEUP, t, pi);
            } catch (Exception ignored) {
            }
        }
    }

    /**
     * The wake-up alarm itself: Android wakes us straight into "ring this alarm" (with its id and day),
     * so it rings even if a reminder was handled a few seconds before it.
     */
    static PendingIntent ringPi(Context c, T t) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(AlarmReceiver.RING);
        if (t != null) {
            i.putExtra("id", t.id).putExtra("occ", t.occ).putExtra("label", t.title).putExtra("at", t.time);
        }
        return PendingIntent.getBroadcast(c, 100, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** True only for the first caller for this alarm on this day (so it never rings twice). */
    static boolean claim(Context c, String id, String occ) {
        return Store.markNotified(c, "ring:" + id + ":" + occ);
    }

    static boolean rung(Context c, String id, String occ) {
        return Store.wasNotified(c, "ring:" + id + ":" + occ);
    }

    /** Is this alarm still wanted on that day (not deleted, not switched off, not off for the day)? */
    static boolean stillDue(Context c, String id, String occ) {
        JSONObject all = Store.items(c);
        JSONObject a = all.optJSONObject(id);
        if (!U.alive(a) || !a.optBoolean("on", true) || U.isOff(all, id, occ)) return false;
        java.util.Calendar d = U.dayOf(occ);
        if (d == null || !U.occursOn(a, d)) return false;
        return Store.kidOf(a, Store.legacyKid(all)).equals(Store.myKid(c));
    }

    /** Starts ringing and records that it rang (the parents see it, or see that the phone blocked it). */
    static void ring(Context c, String id, String occ, String label) {
        boolean ok = AlarmService.start(c, id, occ, label);
        try {
            Store.rang(c, id, occ, label, ok);
        } catch (Exception ignored) {
        }
    }

    public static synchronized void reschedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent piR = firePi(c, 101);
        am.cancel(firePi(c, 100)); // older versions woke the wake-up alarm through FIRE
        am.cancel(ringPi(c, null));
        am.cancel(piR);
        if (!Store.isChild(c)) return;
        long now = System.currentTimeMillis();
        long floor = Math.max(Store.getLong(c, "lastProc"), now - U.MIN);
        if (floor > now + 2 * U.MIN) floor = now - U.MIN; // clock went back
        T nextA = null, nextR = null;
        // Alarms: the next one that did not ring yet (independent of the reminders' progress).
        for (T t : compute(c, now - U.MIN, now + 3 * U.DAY)) {
            if (ALARM.equals(t.type) && !rung(c, t.id, t.occ)) {
                nextA = t;
                break;
            }
        }
        for (T t : compute(c, floor, now + 3 * U.DAY)) {
            if (!ALARM.equals(t.type)) {
                nextR = t;
                break;
            }
        }
        if (nextA != null) setClock(c, nextA.time, ringPi(c, nextA));
        if (nextR != null) setExact(c, nextR.time, piR);
    }

    /** Called when Android wakes us: handle everything that is due now. */
    public static synchronized void process(Context c) {
        long now = System.currentTimeMillis();
        long last = Store.getLong(c, "lastProc");
        if (last > now + 2 * U.MIN) last = now - U.MIN;
        long from = Math.max(last, now - 5 * U.MIN);
        long to = now + 30_000;
        List<T> due = Store.isChild(c) ? compute(c, from, to) : new ArrayList<>();
        Store.setLong(c, "lastProc", to);
        for (T t : due) {
            // A wake-up alarm is never rung early; its own exact "ring" wake-up handles it.
            if (ALARM.equals(t.type) && t.time > now + 2000) continue;
            try {
                handle(c, t);
            } catch (Exception ignored) {
            }
        }
        reschedule(c);
    }

    static void handle(Context c, T t) {
        JSONObject all = Store.items(c);
        switch (t.type) {
            case ALARM:
                if (claim(c, t.id, t.occ)) ring(c, t.id, t.occ, t.title);
                break;
            case WAKE_CHECK:
                if (!Store.has(all, "woke:" + t.id + ":" + t.occ)) Store.wakeMissed(c, t.id, t.occ, t.title);
                break;
            case PREP:
                if (!Store.has(all, "left:" + t.id + ":" + t.occ)) {
                    long left = Math.max(0, (t.extra - System.currentTimeMillis()) / U.MIN);
                    Notify.remind(c, "ev:" + t.id + ":" + t.occ, "⏳ מתחילים להתארגן: " + t.title,
                            "יוצאים ב-" + U.hhmm(t.extra) + " (בעוד " + left + " דק׳)", null, null, null);
                }
                break;
            case LEAVE_SOON:
                if (!Store.has(all, "left:" + t.id + ":" + t.occ)) {
                    Notify.remind(c, "ev:" + t.id + ":" + t.occ, "🎒 עוד 5 דקות יוצאים: " + t.title,
                            "נעליים, תיק, טלפון – ויוצאים ב-" + U.hhmm(t.extra), "left", t.id, t.occ);
                }
                break;
            case LEAVE:
                if (!Store.has(all, "left:" + t.id + ":" + t.occ)) {
                    Notify.remind(c, "ev:" + t.id + ":" + t.occ, "🚪 זמן לצאת! " + t.title,
                            "לוחצים \"יצאתי\" ומקבלים 10 נקודות ⭐", "left", t.id, t.occ);
                }
                break;
            case LEAVE_CHECK:
                if (!Store.has(all, "left:" + t.id + ":" + t.occ)) Store.leaveMissed(c, t.id, t.occ, t.title);
                break;
            case TASK_SOON:
            case TASK_DUE: {
                if (!Store.taskOpen(all, t.id, t.occ)) break;
                JSONObject task = all.optJSONObject(t.id);
                boolean photo = task != null && task.optBoolean("photo");
                String act = photo ? null : "task";
                if (TASK_SOON.equals(t.type)) {
                    Notify.remind(c, "tk:" + t.id + ":" + t.occ, "📝 עוד חצי שעה: " + t.title,
                            "לסיים עד " + U.hhmm(t.extra) + " ולקבל את כל הנקודות" + (photo ? " · צריך תמונה 📷" : ""),
                            act, t.id, t.occ);
                } else {
                    Notify.remind(c, "tk:" + t.id + ":" + t.occ, "⏰ הגיע הזמן: " + t.title,
                            photo ? "מצלמים ומסמנים \"בוצע\" באפליקציה 📷" : "סיימת? לוחצים \"בוצע\"", act, t.id, t.occ);
                }
                break;
            }
            case TASK_END:
                if (Store.taskOpen(all, t.id, t.occ)) Store.taskMissed(c, t.id, t.occ, true);
                break;
            default:
                break;
        }
    }

    // ---------- snooze & test ----------
    static void scheduleSnooze(Context c, String alarmId, String occ, String label, long at) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(AlarmReceiver.RING)
                .putExtra("id", alarmId).putExtra("occ", occ).putExtra("label", label);
        PendingIntent pi = PendingIntent.getBroadcast(c, 102, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        setClock(c, at, pi);
    }

    static void scheduleTest(Context c) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(AlarmReceiver.RING)
                .putExtra("id", "test").putExtra("occ", "test").putExtra("label", "בדיקת שעון מעורר");
        PendingIntent pi = PendingIntent.getBroadcast(c, 103, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        setClock(c, System.currentTimeMillis() + 10_000, pi);
    }
}
