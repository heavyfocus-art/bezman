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
        setup(c, role, name, code, "f", "purple");
    }

    public static void setup(Context c, String role, String name, String code, String gender, String theme) {
        SharedPreferences.Editor e = p(c).edit();
        boolean newFamily = !code.equals(code(c));
        e.putString("role", role).putString("name", name).putString("code", code);
        if (newFamily) {
            e.putString("items", "{}").putString("outbox", "[]").putString("lastMsgId", "")
                    .putLong("lastSnapAt", System.currentTimeMillis()).putBoolean("needJoin", true)
                    .putLong("lastProc", System.currentTimeMillis());
        }
        e.commit();
        JSONObject old = items(c).optJSONObject("m_" + dev(c));
        JSONObject m = U.obj("id", "m_" + dev(c), "kind", "member", "role", role, "name", name);
        U.put(m, "by", name);
        if ("child".equals(role)) {
            U.put(m, "kid", kidId(name));
            U.put(m, "gender", "m".equals(gender) ? "m" : "f");
            U.put(m, "theme", okTheme(theme));
            U.put(m, "since", old != null && old.has("since") ? old.optLong("since") : System.currentTimeMillis());
        }
        upsertLocal(c, m);
    }

    /** The child changes her/his colors or gender (for the Hebrew texts). */
    public static void setProfile(Context c, String gender, String theme) {
        JSONObject m = items(c).optJSONObject("m_" + dev(c));
        if (m == null) return;
        if (gender != null && !gender.isEmpty()) U.put(m, "gender", "m".equals(gender) ? "m" : "f");
        if (theme != null && !theme.isEmpty()) U.put(m, "theme", okTheme(theme));
        if (!m.has("kid")) U.put(m, "kid", kidId(m.optString("name")));
        if (!m.has("since")) U.put(m, "since", 1);
        upsertLocal(c, m);
    }

    // ---------- several children ----------
    /** Stable id for a child, made from the name (same as in the screens). */
    public static String kidId(String name) {
        String n = name == null ? "" : name.trim().replaceAll("\\s+", " ").toLowerCase();
        int h = 0x811c9dc5;
        for (int i = 0; i < n.length(); i++) {
            h ^= n.charAt(i);
            h *= 0x01000193;
        }
        return "k_" + String.format("%08x", h);
    }

    static String memberKid(JSONObject m) {
        String k = m.optString("kid", "");
        return k.isEmpty() ? kidId(m.optString("name")) : k;
    }

    /** Data saved before there could be more than one child belongs to the first child who joined. */
    public static String legacyKid(JSONObject all) {
        String best = "";
        long bestSince = Long.MAX_VALUE;
        for (JSONObject m : list(all, "member")) {
            if (!"child".equals(m.optString("role"))) continue;
            long s = m.optLong("since", 0);
            if (s < bestSince) {
                bestSince = s;
                best = memberKid(m);
            }
        }
        return best;
    }

    public static String kidOf(JSONObject it, String legacy) {
        String k = it == null ? "" : it.optString("kid", "");
        return k.isEmpty() ? legacy : k;
    }

    static JSONObject kidMember(JSONObject all, String kid) {
        JSONObject best = null;
        for (JSONObject m : list(all, "member")) {
            if (!"child".equals(m.optString("role")) || !memberKid(m).equals(kid)) continue;
            if (best == null || m.optLong("upd") > best.optLong("upd")) best = m;
        }
        return best;
    }

    public static String kidName(JSONObject all, String kid) {
        JSONObject m = kidMember(all, kid);
        return m == null ? "הילד/ה" : m.optString("name", "הילד/ה");
    }

    public static boolean kidBoy(JSONObject all, String kid) {
        JSONObject m = kidMember(all, kid);
        return m != null && "m".equals(m.optString("gender"));
    }

    /** On a child's phone: which child am I. */
    public static String myKid(Context c) {
        JSONObject m = items(c).optJSONObject("m_" + dev(c));
        return m != null ? memberKid(m) : kidId(name(c));
    }

    public static boolean meBoy(Context c) {
        JSONObject m = items(c).optJSONObject("m_" + dev(c));
        return m != null && "m".equals(m.optString("gender"));
    }

    static String okTheme(String t) {
        return "yb".equals(t) || "orange".equals(t) ? t : "purple";
    }

    /** My colors: what I chose, unless a parent chose newer colors for me ("kt:<kid>"). */
    public static String myTheme(Context c) {
        JSONObject all = items(c);
        JSONObject m = all.optJSONObject("m_" + dev(c));
        String t = m == null ? "purple" : m.optString("theme", "purple");
        JSONObject kt = all.optJSONObject("kt:" + myKid(c));
        if (U.alive(kt) && (m == null || kt.optLong("upd") > m.optLong("upd"))) t = kt.optString("theme", t);
        return okTheme(t);
    }

    /** Is this item for me (on a child's phone)? */
    public static boolean mine(Context c, JSONObject all, JSONObject it) {
        return kidOf(it, legacyKid(all)).equals(myKid(c));
    }

    /** Ask the screen for fireworks + festive sound next time it shows. */
    public static void celebrate(Context c) {
        setLong(c, "celebrate", System.currentTimeMillis());
    }

    public static void reset(Context c) {
        String d = dev(c);
        p(c).edit().clear().putString("dev", d).commit();
    }

    // ---------- actions with points ----------
    static boolean has(JSONObject all, String id) {
        return U.alive(all.optJSONObject(id));
    }

    static JSONObject log(Context c, String id, String type, String ref, String occ, int pts, String title) {
        JSONObject l = U.obj("id", id, "kind", "log", "type", type, "ref", ref, "occ", occ,
                "pts", pts, "title", title, "at", System.currentTimeMillis());
        if (isChild(c)) U.put(l, "kid", myKid(c));
        return l;
    }

    /** She dismissed the wake alarm. Returns points earned (or -1 if already recorded). */
    public static int woke(Context c, String alarmId, String occ, String label) {
        JSONObject all = items(c);
        String id = "woke:" + alarmId + ":" + occ;
        if (has(all, id)) return -1;
        boolean snoozed = p(c).getBoolean("snz:" + alarmId + ":" + occ, false);
        boolean missed = has(all, "wakemiss:" + alarmId + ":" + occ);
        int pts = missed ? 3 : (snoozed ? 5 : 10);
        JSONObject l = log(c, id, "woke", alarmId, occ, pts, label);
        U.put(l, "snoozed", snoozed);
        upsertLocal(c, l);
        if (pts == 10) {
            celebrate(c);
            int streak = streak(c, items(c));
            if (streak > 0 && streak % 5 == 0) {
                upsertLocal(c, log(c, "bonus:" + myKid(c) + ":" + occ, "bonus", alarmId, occ, 15, "רצף של " + streak + " ימים"));
            }
        }
        afterLocalChange(c);
        return pts;
    }

    public static void snoozed(Context c, String alarmId, String occ, String label) {
        p(c).edit().putBoolean("snz:" + alarmId + ":" + occ, true).apply();
        upsertLocal(c, log(c, "snooze:" + alarmId + ":" + occ, "snooze", alarmId, occ, 0, label));
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
        JSONObject l = log(c, id, "left", eventId, occ, pts, ev.optString("title"));
        U.put(l, "late", now <= leave + 2 * U.MIN ? 0 : late);
        upsertLocal(c, l);
        if (pts == 10) celebrate(c);
        afterLocalChange(c);
        return pts;
    }

    /** Can she still mark this task? (nothing recorded yet, or a parent sent it back) */
    public static boolean taskOpen(JSONObject all, String taskId, String occ) {
        JSONObject r = all.optJSONObject("task:" + taskId + ":" + occ);
        return !U.alive(r) || "rejected".equals(r.optString("status"));
    }

    public static int taskBase(JSONObject t) {
        return Math.max(1, t.optInt("pts", 5));
    }

    /** Points taken off when a task is not done: half the task's points (at least 1). */
    public static int taskPenalty(JSONObject t) {
        return Math.max(1, taskBase(t) / 2);
    }

    /**
     * She marked a task as done. It waits for a parent's approval; the points are given on approval.
     * Returns the points she will get if approved, or -1.
     */
    public static int taskDone(Context c, String taskId, String occ, boolean withPhoto) {
        JSONObject all = items(c);
        JSONObject t = all.optJSONObject(taskId);
        String id = "task:" + taskId + ":" + occ;
        if (t == null || !taskOpen(all, taskId, occ)) return -1;
        int base = taskBase(t);
        int m = U.mins(t.optString("time"));
        long due = U.at(occ, m < 0 ? 23 * 60 + 59 : m);
        boolean onTime = System.currentTimeMillis() <= due;
        int claim = onTime ? base : Math.max(1, base / 2);
        JSONObject l = log(c, id, "task_done", taskId, occ, 0, t.optString("title"));
        U.put(l, "status", "pending");
        U.put(l, "claim", claim);
        U.put(l, "late", !onTime);
        U.put(l, "by", name(c));
        if (onTime) celebrate(c);
        if (withPhoto) {
            U.put(l, "photo", true);
            U.put(l, "photoBy", dev(c));
        }
        upsertLocal(c, l);
        afterLocalChange(c);
        return claim;
    }

    /** Task not done: she pressed "לא בוצע", or the day ended without marking it. */
    public static int taskMissed(Context c, String taskId, String occ, boolean auto) {
        JSONObject all = items(c);
        JSONObject t = all.optJSONObject(taskId);
        String id = "task:" + taskId + ":" + occ;
        if (t == null || !taskOpen(all, taskId, occ)) return 0;
        int pen = taskPenalty(t);
        JSONObject l = log(c, id, "task_missed", taskId, occ, -pen, t.optString("title"));
        U.put(l, "status", "missed");
        U.put(l, "auto", auto);
        U.put(l, "by", name(c));
        upsertLocal(c, l);
        afterLocalChange(c);
        return pen;
    }

    /** A parent approves (ok=true) or sends back (ok=false) a task she marked done. */
    public static boolean approve(Context c, String logId, boolean ok) {
        if (isChild(c) || !Pin.unlocked(c)) return false;
        JSONObject r = get(c, logId);
        if (!U.alive(r) || !"task_done".equals(r.optString("type"))) return false;
        if (!"pending".equals(r.optString("status"))) return false;
        U.put(r, "status", ok ? "approved" : "rejected");
        U.put(r, "pts", ok ? r.optInt("claim", 0) : 0);
        U.put(r, "approvedBy", name(c));
        U.put(r, "decidedAt", System.currentTimeMillis());
        upsertLocal(c, r);
        afterLocalChange(c);
        return true;
    }

    /** Automatic check: alarm rang 10 minutes ago and she did not stop it. */
    static void wakeMissed(Context c, String alarmId, String occ, String label) {
        JSONObject all = items(c);
        if (has(all, "woke:" + alarmId + ":" + occ) || has(all, "wakemiss:" + alarmId + ":" + occ)) return;
        upsertLocal(c, log(c, "wakemiss:" + alarmId + ":" + occ, "wake_missed", alarmId, occ, 0, label));
        afterLocalChange(c);
    }

    static void leaveMissed(Context c, String eventId, String occ, String title) {
        JSONObject all = items(c);
        if (has(all, "left:" + eventId + ":" + occ) || has(all, "leavemiss:" + eventId + ":" + occ)) return;
        upsertLocal(c, log(c, "leavemiss:" + eventId + ":" + occ, "leave_missed", eventId, occ, 0, title));
        afterLocalChange(c);
    }

    // ---------- score ----------
    /** Days in a row (with an alarm) that she woke up on time without snooze. */
    static int streak(Context c, JSONObject all) {
        String me = myKid(c), legacy = legacyKid(all);
        List<JSONObject> alarms = new ArrayList<>();
        for (JSONObject a : list(all, "alarm")) if (kidOf(a, legacy).equals(me)) alarms.add(a);
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
        String me = myKid(c), legacy = legacyKid(all);
        int pts = 0;
        Iterator<String> it = all.keys();
        while (it.hasNext()) {
            JSONObject o = all.optJSONObject(it.next());
            if (!U.alive(o)) continue;
            if (!kidOf(o, legacy).equals(me)) continue;
            String k = o.optString("kind");
            if ("log".equals(k)) pts += o.optInt("pts", 0);
            else if ("redeem".equals(k) && !"declined".equals(o.optString("status"))) pts -= o.optInt("cost", 0);
        }
        int streak = streak(c, all);
        String sid = "score:" + me;
        JSONObject old = all.optJSONObject(sid);
        if (old != null && old.optInt("pts") == pts && old.optInt("streak") == streak) return;
        upsertLocal(c, U.obj("id", sid, "kind", "score", "kid", me, "pts", pts, "streak", streak));
    }

    /** After anything changed on this device: update score, alarms, send to family, refresh screen. */
    public static void afterLocalChange(Context c) {
        recomputeScore(c);
        Sched.reschedule(c);
        Sync.flushAsync(c);
        MainActivity.refreshUi();
    }
}
