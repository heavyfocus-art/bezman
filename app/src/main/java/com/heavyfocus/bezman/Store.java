package com.heavyfocus.bezman;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;

/**
 * All app data lives here as a map id -> item (JSON). Every item has "kind" and "upd" (last change time).
 * Devices exchange items and keep the newest version of each one (last write wins).
 */
public final class Store {
    private Store() {}

    static final Object LOCK = new Object();

    static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences("bezman", Context.MODE_PRIVATE);
    }

    // ---------- identity ----------
    public static String role(Context c) { return p(c).getString("role", ""); }
    public static boolean isChild(Context c) { return "child".equals(role(c)); }
    public static String name(Context c) { return p(c).getString("name", ""); }
    public static String code(Context c) { return p(c).getString("code", ""); }

    public static String dev(Context c) {
        String d = p(c).getString("dev", null);
        if (d == null) {
            d = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
            p(c).edit().putString("dev", d).apply();
        }
        return d;
    }

    public static long getLong(Context c, String k) { return p(c).getLong(k, 0); }
    public static void setLong(Context c, String k, long v) { p(c).edit().putLong(k, v).apply(); }
    public static String getStr(Context c, String k) { return p(c).getString(k, ""); }
    public static void setStr(Context c, String k, String v) { p(c).edit().putString(k, v).apply(); }

    // ---------- items ----------
    public static JSONObject items(Context c) {
        synchronized (LOCK) {
            try {
                return new JSONObject(p(c).getString("items", "{}"));
            } catch (Exception e) {
                return new JSONObject();
            }
        }
    }

    private static void saveItems(Context c, JSONObject all) {
        p(c).edit().putString("items", all.toString()).commit();
    }

    public static JSONObject get(Context c, String id) {
        return items(c).optJSONObject(id);
    }

    public static List<JSONObject> list(JSONObject all, String kind) {
        List<JSONObject> out = new ArrayList<>();
        Iterator<String> it = all.keys();
        while (it.hasNext()) {
            JSONObject o = all.optJSONObject(it.next());
            if (U.alive(o) && kind.equals(o.optString("kind"))) out.add(o);
        }
        return out;
    }

    /** Saves items changed on this device. Returns the stored versions. */
    public static List<JSONObject> upsertLocal(Context c, JSONArray arr) {
        List<JSONObject> out = new ArrayList<>();
        synchronized (LOCK) {
            JSONObject all = items(c);
            long now = System.currentTimeMillis();
            List<String> ids = new ArrayList<>();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject it = arr.optJSONObject(i);
                if (it == null) continue;
                String id = it.optString("id", "");
                if (id.isEmpty()) continue;
                JSONObject old = all.optJSONObject(id);
                long upd = now;
                if (old != null) upd = Math.max(now, old.optLong("upd") + 1);
                U.put(it, "upd", upd);
                U.put(it, "dev", dev(c));
                if (!it.has("by")) U.put(it, "by", old != null ? old.optString("by", name(c)) : name(c));
                U.put(all, id, it);
                ids.add(id);
                out.add(it);
            }
            saveItems(c, all);
            addOutbox(c, ids);
        }
        return out;
    }

    public static List<JSONObject> upsertLocal(Context c, JSONObject one) {
        JSONArray a = new JSONArray();
        a.put(one);
        return upsertLocal(c, a);
    }

    /** Merges items that came from other devices. Returns pairs {old (may be null), new} of what changed. */
    public static List<JSONObject[]> mergeRemote(Context c, JSONArray arr) {
        List<JSONObject[]> changed = new ArrayList<>();
        synchronized (LOCK) {
            JSONObject all = items(c);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject in = arr.optJSONObject(i);
                if (in == null) continue;
                String id = in.optString("id", "");
                if (id.isEmpty()) continue;
                JSONObject old = all.optJSONObject(id);
                boolean take;
                if (old == null) take = true;
                else {
                    long a = in.optLong("upd"), b = old.optLong("upd");
                    take = a > b || (a == b && in.toString().compareTo(old.toString()) > 0);
                }
                if (take) {
                    U.put(all, id, in);
                    changed.add(new JSONObject[]{old, in});
                }
            }
            if (!changed.isEmpty()) saveItems(c, all);
        }
        return changed;
    }

    // ---------- outbox (items waiting to be sent) ----------
    static void addOutbox(Context c, List<String> ids) {
        if (ids.isEmpty()) return;
        try {
            JSONArray ob = new JSONArray(p(c).getString("outbox", "[]"));
            for (String id : ids) ob.put(id);
            p(c).edit().putString("outbox", ob.toString()).commit();
        } catch (Exception ignored) {
        }
    }

    static List<String> outbox(Context c) {
        List<String> out = new ArrayList<>();
        try {
            JSONArray ob = new JSONArray(p(c).getString("outbox", "[]"));
            for (int i = 0; i < ob.length(); i++) {
                String s = ob.optString(i);
                if (!out.contains(s)) out.add(s);
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    static void removeOutbox(Context c, List<String> sent) {
        synchronized (LOCK) {
            List<String> cur = outbox(c);
            cur.removeAll(sent);
            JSONArray a = new JSONArray();
            for (String s : cur) a.put(s);
            p(c).edit().putString("outbox", a.toString()).commit();
        }
    }

    // ---------- "already notified" memory ----------
    static boolean markNotified(Context c, String key) {
        synchronized (LOCK) {
            try {
                JSONArray a = new JSONArray(p(c).getString("notified", "[]"));
                for (int i = 0; i < a.length(); i++) if (key.equals(a.optString(i))) return false;
                JSONArray b = new JSONArray();
                int start = Math.max(0, a.length() - 300);
                for (int i = start; i < a.length(); i++) b.put(a.optString(i));
                b.put(key);
                p(c).edit().putString("notified", b.toString()).apply();
                return true;
            } catch (Exception e) {
                return true;
            }
        }
    }

    // ---------- setup ----------
    public static void setup(Context c, String role, String name, String code) {
        SharedPreferences.Editor e = p(c).edit();
        boolean newFamily = !code.equals(code(c));
        e.putString("role", role).putString("name", name).putString("code", code);
        if (newFamily) {
            e.putString("items", "{}").putString("outbox", "[]").putString("lastMsgId", "")
                    .putLong("lastSnapAt", System.currentTimeMillis()).putBoolean("needJoin", true)
                    .putLong("lastProc", System.currentTimeMillis());
        }
        e.commit();
        JSONObject m = U.obj("id", "m_" + dev(c), "kind", "member", "role", role, "name", name);
        U.put(m, "by", name);
        upsertLocal(c, m);
    }

    public static void reset(Context c) {
        String d = dev(c);
        p(c).edit().clear().putString("dev", d).commit();
    }

    public static String childName(Context c) {
        for (JSONObject m : list(items(c), "member")) {
            if ("child".equals(m.optString("role"))) return m.optString("name", "");
        }
        return isChild(c) ? name(c) : "";
    }

    // ---------- actions with points ----------
    static boolean has(JSONObject all, String id) {
        return U.alive(all.optJSONObject(id));
    }

    static JSONObject log(String id, String type, String ref, String occ, int pts, String title) {
        return U.obj("id", id, "kind", "log", "type", type, "ref", ref, "occ", occ,
                "pts", pts, "title", title, "at", System.currentTimeMillis());
    }

    /** She dismissed the wake alarm. Returns points earned (or -1 if already recorded). */
    public static int woke(Context c, String alarmId, String occ, String label) {
        JSONObject all = items(c);
        String id = "woke:" + alarmId + ":" + occ;
        if (has(all, id)) return -1;
        boolean snoozed = p(c).getBoolean("snz:" + alarmId + ":" + occ, false);
        boolean missed = has(all, "wakemiss:" + alarmId + ":" + occ);
        int pts = missed ? 3 : (snoozed ? 5 : 10);
        JSONObject l = log(id, "woke", alarmId, occ, pts, label);
        U.put(l, "snoozed", snoozed);
        upsertLocal(c, l);
        if (pts == 10) {
            int streak = streak(c, items(c));
            if (streak > 0 && streak % 5 == 0) {
                upsertLocal(c, log("bonus:" + occ, "bonus", alarmId, occ, 15, "רצף של " + streak + " ימים"));
            }
        }
        afterLocalChange(c);
        return pts;
    }

    public static void snoozed(Context c, String alarmId, String occ, String label) {
        p(c).edit().putBoolean("snz:" + alarmId + ":" + occ, true).apply();
        upsertLocal(c, log("snooze:" + alarmId + ":" + occ, "snooze", alarmId, occ, 0, label));
        afterLocalChange(c);
    }

    public static boolean wasSnoozed(Context c, String alarmId, String occ) {
        return p(c).getBoolean("snz:" + alarmId + ":" + occ, false);
    }

    /** She pressed "I left". */
    public static int left(Context c, String eventId, String occ) {
        JSONObject all = items(c);
        JSONObject ev = all.optJSONObject(eventId);
        String id = "left:" + eventId + ":" + occ;
        if (ev == null || has(all, id)) return -1;
        long leave = U.leaveAt(ev, occ);
        long now = System.currentTimeMillis();
        int late = (int) Math.max(0, (now - leave) / U.MIN);
        int pts = now <= leave + 2 * U.MIN ? 10 : (now <= leave + 10 * U.MIN ? 5 : 2);
        JSONObject l = log(id, "left", eventId, occ, pts, ev.optString("title"));
        U.put(l, "late", now <= leave + 2 * U.MIN ? 0 : late);
        upsertLocal(c, l);
        afterLocalChange(c);
        return pts;
    }

    /** She finished a task. */
    public static int taskDone(Context c, String taskId, String occ) {
        JSONObject all = items(c);
        JSONObject t = all.optJSONObject(taskId);
        String id = "task:" + taskId + ":" + occ;
        if (t == null || has(all, id)) return -1;
        int base = Math.max(1, t.optInt("pts", 5));
        int m = U.mins(t.optString("time"));
        long due = U.at(occ, m < 0 ? 23 * 60 + 59 : m);
        boolean onTime = System.currentTimeMillis() <= due;
        int pts = onTime ? base : Math.max(1, base / 2);
        JSONObject l = log(id, "task_done", taskId, occ, pts, t.optString("title"));
        U.put(l, "late", !onTime);
        upsertLocal(c, l);
        afterLocalChange(c);
        return pts;
    }

    /** Automatic check: alarm rang 10 minutes ago and she did not stop it. */
    static void wakeMissed(Context c, String alarmId, String occ, String label) {
        JSONObject all = items(c);
        if (has(all, "woke:" + alarmId + ":" + occ) || has(all, "wakemiss:" + alarmId + ":" + occ)) return;
        upsertLocal(c, log("wakemiss:" + alarmId + ":" + occ, "wake_missed", alarmId, occ, 0, label));
        afterLocalChange(c);
    }

    static void leaveMissed(Context c, String eventId, String occ, String title) {
        JSONObject all = items(c);
        if (has(all, "left:" + eventId + ":" + occ) || has(all, "leavemiss:" + eventId + ":" + occ)) return;
        upsertLocal(c, log("leavemiss:" + eventId + ":" + occ, "leave_missed", eventId, occ, 0, title));
        afterLocalChange(c);
    }

    // ---------- score ----------
    /** Days in a row (with an alarm) that she woke up on time without snooze. */
    static int streak(Context c, JSONObject all) {
        List<JSONObject> alarms = list(all, "alarm");
        Calendar d = U.startOfDay(System.currentTimeMillis());
        int streak = 0;
        for (int i = 0; i < 400; i++) {
            String occ = U.occ(d);
            boolean hasAlarm = false, ok = false;
            for (JSONObject a : alarms) {
                if (!a.optBoolean("on", true) || !U.occursOn(a, d)) continue;
                hasAlarm = true;
                JSONObject w = all.optJSONObject("woke:" + a.optString("id") + ":" + occ);
                if (U.alive(w) && w.optInt("pts") >= 10) ok = true;
            }
            if (hasAlarm) {
                if (ok) streak++;
                else if (i > 0) break;
            }
            d.add(Calendar.DAY_OF_MONTH, -1);
        }
        return streak;
    }

    /** The child's phone keeps the official score and shares it as item "score". */
    static void recomputeScore(Context c) {
        if (!isChild(c)) return;
        JSONObject all = items(c);
        int pts = 0;
        Iterator<String> it = all.keys();
        while (it.hasNext()) {
            JSONObject o = all.optJSONObject(it.next());
            if (!U.alive(o)) continue;
            String k = o.optString("kind");
            if ("log".equals(k)) pts += o.optInt("pts", 0);
            else if ("redeem".equals(k) && !"declined".equals(o.optString("status"))) pts -= o.optInt("cost", 0);
        }
        int streak = streak(c, all);
        JSONObject old = all.optJSONObject("score");
        if (old != null && old.optInt("pts") == pts && old.optInt("streak") == streak) return;
        upsertLocal(c, U.obj("id", "score", "kind", "score", "pts", pts, "streak", streak));
    }

    /** After anything changed on this device: update score, alarms, send to family, refresh screen. */
    public static void afterLocalChange(Context c) {
        recomputeScore(c);
        Sched.reschedule(c);
        Sync.flushAsync(c);
        MainActivity.refreshUi();
    }
}
