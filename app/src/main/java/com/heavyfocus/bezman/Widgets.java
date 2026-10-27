package com.heavyfocus.bezman;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Home-screen widgets ("ישומונים").
 * "הדבר הבא": on a child's phone a countdown to the next thing (with "יצאתי" / "בוצע"); on a parent's phone a line per child.
 * "היום": today's list; on a parent's phone one part per child.
 */
public final class Widgets {
    private Widgets() {}

    static final String[] DAYS_LONG = {"ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"};

    /** Redraws every widget of the app (safe from any thread). */
    public static void updateAll(Context c) {
        try {
            Context ac = c.getApplicationContext();
            AppWidgetManager m = AppWidgetManager.getInstance(ac);
            int[] next = m.getAppWidgetIds(new ComponentName(ac, NextWidget.class));
            int[] day = m.getAppWidgetIds(new ComponentName(ac, DayWidget.class));
            if (next.length > 0) {
                RemoteViews v = buildNext(ac);
                for (int id : next) m.updateAppWidget(id, v);
            }
            if (day.length > 0) {
                RemoteViews v = buildDay(ac);
                for (int id : day) m.updateAppWidget(id, v);
            }
        } catch (Exception ignored) {
        }
    }

    // ------------------------------------------------------------------ data

    static final class Kid {
        String kid, name, theme = "purple";
        boolean boy;
        long since = Long.MAX_VALUE, upd;
    }

    static final class Row {
        String type, title, time, mark, occ;
        JSONObject it;
        long t, start, leave;
        boolean done, open;
    }

    /** The children of the family, oldest member first. */
    static List<Kid> kids(JSONObject all) {
        List<Kid> out = new ArrayList<>();
        for (JSONObject m : Store.list(all, "member")) {
            if (!"child".equals(m.optString("role"))) continue;
            String k = Store.memberKid(m);
            Kid cur = null;
            for (Kid x : out) if (x.kid.equals(k)) cur = x;
            if (cur == null) {
                cur = new Kid();
                cur.kid = k;
                out.add(cur);
            }
            cur.since = Math.min(cur.since, m.optLong("since", 0));
            if (cur.name == null || m.optLong("upd") > cur.upd) {
                cur.name = m.optString("name", "");
                cur.theme = m.optString("theme", "purple");
                cur.boy = "m".equals(m.optString("gender"));
                cur.upd = m.optLong("upd");
            }
        }
        for (Kid k : out) {
            JSONObject kt = all.optJSONObject("kt:" + k.kid);
            if (U.alive(kt) && kt.optLong("upd") > k.upd) k.theme = kt.optString("theme", k.theme);
        }
        Collections.sort(out, (a, b) -> Long.compare(a.since, b.since));
        return out;
    }

    static int[] score(JSONObject all, String kid, String legacy) {
        JSONObject s = all.optJSONObject("score:" + kid);
        if (!U.alive(s) && kid.equals(legacy)) s = all.optJSONObject("score");
        if (!U.alive(s)) return new int[]{0, 0};
        return new int[]{s.optInt("pts"), s.optInt("streak")};
    }

    static boolean has(JSONObject all, String id) {
        return U.alive(all.optJSONObject(id));
    }

    /** open | pending | approved | rejected | missed (same as the screens). */
    static String taskState(JSONObject log) {
        if (!U.alive(log)) return "open";
        if ("task_missed".equals(log.optString("type"))) return "missed";
        String st = log.optString("status");
        if ("pending".equals(st)) return "pending";
        if ("rejected".equals(st)) return "rejected";
        return "approved";
    }

    /** A child's day (without things a parent turned off for that day), sorted by time. */
    static List<Row> agenda(JSONObject all, String kid, String legacy, Calendar day) {
        String occ = U.occ(day);
        List<Row> rows = new ArrayList<>();
        for (JSONObject a : Store.list(all, "alarm")) {
            String id = a.optString("id");
            int m = U.mins(a.optString("time"));
            if (!Store.kidOf(a, legacy).equals(kid) || !a.optBoolean("on", true) || m < 0
                    || !U.occursOn(a, day) || U.isOff(all, id, occ)) continue;
            Row r = new Row();
            r.type = "alarm";
            r.it = a;
            r.occ = occ;
            r.t = U.at(day, m);
            r.time = a.optString("time");
            String label = a.optString("label", "");
            r.title = "⏰ השכמה" + (label.isEmpty() ? "" : " · " + label);
            boolean woke = has(all, "woke:" + id + ":" + occ), miss = has(all, "wakemiss:" + id + ":" + occ);
            r.mark = woke ? "☀️" : miss ? "⚠️" : "";
            r.done = woke || miss;
            rows.add(r);
        }
        for (JSONObject e : Store.list(all, "event")) {
            String id = e.optString("id");
            int m = U.mins(e.optString("start"));
            if (!Store.kidOf(e, legacy).equals(kid) || m < 0 || !U.occursOn(e, day) || U.isOff(all, id, occ)) continue;
            Row r = new Row();
            r.type = "event";
            r.it = e;
            r.occ = occ;
            r.start = U.at(day, m);
            r.leave = r.start - Math.max(0, e.optInt("travel", 0)) * U.MIN;
            r.t = r.leave;
            r.time = U.hhmm(r.leave);
            r.title = "🎒 " + e.optString("title");
            boolean left = has(all, "left:" + id + ":" + occ), miss = has(all, "leavemiss:" + id + ":" + occ);
            r.mark = left ? "✓" : miss ? "⚠️" : "";
            r.done = left || miss;
            rows.add(r);
        }
        for (JSONObject k : Store.list(all, "task")) {
            String id = k.optString("id");
            if (!Store.kidOf(k, legacy).equals(kid) || !U.occursOn(k, day) || U.isOff(all, id, occ)) continue;
            int m = U.mins(k.optString("time"));
            Row r = new Row();
            r.type = "task";
            r.it = k;
            r.occ = occ;
            r.t = U.at(day, m >= 0 ? m : 23 * 60 + 59);
            r.time = m >= 0 ? k.optString("time") : "—";
            r.title = "📝 " + k.optString("title");
            String st = taskState(all.optJSONObject("task:" + id + ":" + occ));
            switch (st) {
                case "approved": r.mark = "✓"; break;
                case "pending": r.mark = "⏳"; break;
                case "missed": r.mark = "✕"; break;
                case "rejected": r.mark = "↩️"; break;
                default: r.mark = "○"; break;
            }
            r.open = "open".equals(st) || "rejected".equals(st);
            r.done = !r.open;
            rows.add(r);
        }
        Collections.sort(rows, (a, b) -> Long.compare(a.t, b.t));
        return rows;
    }

    // ------------------------------------------------------------------ looks

    static int bgFor(String theme) {
        if ("yb".equals(theme)) return R.drawable.wg_bg_yb;
        if ("orange".equals(theme)) return R.drawable.wg_bg_orange;
        return R.drawable.wg_bg_purple;
    }

    static int kidColor(String theme) {
        if ("yb".equals(theme)) return 0xFFC79A00;
        if ("orange".equals(theme)) return 0xFFE2650F;
        return 0xFF7A5AF5;
    }

    static PendingIntent openApp(Context c) {
        return Notify.openApp(c);
    }

    static String dateLine(Calendar d) {
        return "יום " + DAYS_LONG[U.dow(d)] + " " + d.get(Calendar.DAY_OF_MONTH) + "/" + (d.get(Calendar.MONTH) + 1);
    }

    // ------------------------------------------------------------------ "הדבר הבא"

    static RemoteViews buildNext(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_next);
        v.setOnClickPendingIntent(R.id.root, openApp(c));
        v.setViewVisibility(R.id.act, View.GONE);
        v.setViewVisibility(R.id.now, View.GONE);
        v.removeAllViews(R.id.kids);
        JSONObject all = Store.items(c);
        String legacy = Store.legacyKid(all);
        long now = System.currentTimeMillis();
        Calendar today = U.startOfDay(now);

        if (Store.code(c).isEmpty()) {
            v.setTextViewText(R.id.lbl, "⏰ בזמן");
            v.setTextViewText(R.id.what, "פותחים את האפליקציה ומצטרפים למשפחה");
            v.setViewVisibility(R.id.countrow, View.GONE);
            v.setViewVisibility(R.id.sub, View.GONE);
            v.setTextViewText(R.id.pts, "");
            return v;
        }

        if (!Store.isChild(c)) return parentNext(c, v, all, legacy, today, now);

        String me = Store.myKid(c);
        v.setInt(R.id.root, "setBackgroundResource", bgFor(Store.myTheme(c)));
        int[] sc = score(all, me, legacy);
        v.setTextViewText(R.id.pts, "⭐ ‎" + sc[0] + (sc[1] > 0 ? "  ·  🔥 " + sc[1] : ""));

        Row next = null;
        long target = 0;
        String what = "", sub = "", lbl = "⏰ הדבר הבא";
        for (Row r : agenda(all, me, legacy, today)) {
            if (r.done) continue;
            if ("alarm".equals(r.type) && r.t > now) {
                next = r; target = r.t; what = r.title;
                sub = "השעון יצלצל ב-" + r.time;
                break;
            }
            if ("event".equals(r.type) && r.start > now) {
                next = r; target = r.leave; what = r.title;
                sub = "יוצאים ב-" + U.hhmm(r.leave) + " · מתחיל ב-" + r.it.optString("start");
                lbl = "🚪 יוצאים בעוד";
                break;
            }
            if ("task".equals(r.type) && r.open && r.t > now - 3 * U.HOUR) {
                next = r; target = r.t; what = r.title;
                sub = "לסיים עד " + r.time + " · " + Store.taskBase(r.it) + "⭐";
                lbl = "📝 נשאר";
                break;
            }
        }
        if (next == null) {
            Calendar tm = (Calendar) today.clone();
            tm.add(Calendar.DAY_OF_MONTH, 1);
            for (Row r : agenda(all, me, legacy, tm)) {
                if ("alarm".equals(r.type)) {
                    next = r; target = r.t; what = "⏰ השכמה מחר";
                    sub = "השעון יצלצל ב-" + r.time;
                    lbl = "🌙 עד ההשכמה";
                    break;
                }
            }
        }
        if (next == null) {
            v.setTextViewText(R.id.lbl, "🌈 הדבר הבא");
            v.setTextViewText(R.id.what, "אין כלום כרגע");
            v.setViewVisibility(R.id.countrow, View.GONE);
            v.setTextViewText(R.id.sub, "אפשר לנוח 😊");
            return v;
        }
        v.setTextViewText(R.id.lbl, lbl);
        v.setTextViewText(R.id.what, what);
        v.setTextViewText(R.id.sub, sub);
        v.setViewVisibility(R.id.countrow, View.VISIBLE);
        if (target > now) {
            v.setViewVisibility(R.id.count, View.VISIBLE);
            v.setChronometer(R.id.count, SystemClock.elapsedRealtime() + (target - now), null, true);
            v.setChronometerCountDown(R.id.count, true);
        } else {
            v.setViewVisibility(R.id.count, View.GONE);
            v.setViewVisibility(R.id.now, View.VISIBLE);
            v.setTextViewText(R.id.now, "event".equals(next.type) ? "זמן לצאת!" : "עבר הזמן");
        }

        // a button right on the home screen
        String act = null, label = null;
        if ("event".equals(next.type) && next.occ.equals(U.occ(now)) && now >= next.leave - U.HOUR) {
            act = "left";
            label = "יצאתי ✅";
        } else if ("task".equals(next.type) && next.occ.equals(U.occ(now)) && !next.it.optBoolean("photo")) {
            act = "task";
            label = "בוצע ✅";
        }
        if (act != null) {
            String id = next.it.optString("id");
            String key = ("left".equals(act) ? "ev:" : "tk:") + id + ":" + next.occ;
            Intent i = new Intent(c, AlarmReceiver.class).setAction(AlarmReceiver.ACT)
                    .putExtra("what", act).putExtra("ref", id).putExtra("occ", next.occ).putExtra("key", key);
            PendingIntent pi = PendingIntent.getBroadcast(c, 7700, i,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            v.setTextViewText(R.id.act, label);
            v.setOnClickPendingIntent(R.id.act, pi);
            v.setViewVisibility(R.id.act, View.VISIBLE);
        }
        return v;
    }

    static RemoteViews parentNext(Context c, RemoteViews v, JSONObject all, String legacy, Calendar today, long now) {
        v.setInt(R.id.root, "setBackgroundResource", R.drawable.wg_bg_purple);
        v.setTextViewText(R.id.lbl, "👨‍👩‍👧 בזמן · " + dateLine(today));
        v.setViewVisibility(R.id.countrow, View.GONE);
        v.setViewVisibility(R.id.kids, View.VISIBLE);
        int pending = 0;
        for (JSONObject l : Store.list(all, "log")) {
            if ("task_done".equals(l.optString("type")) && "pending".equals(l.optString("status"))) pending++;
        }
        for (JSONObject r : Store.list(all, "redeem")) if ("pending".equals(r.optString("status"))) pending++;
        List<Kid> ks = kids(all);
        if (ks.isEmpty()) {
            v.setTextViewText(R.id.what, "אף ילד עוד לא מחובר");
            v.setTextViewText(R.id.sub, "");
            v.setTextViewText(R.id.pts, "");
            return v;
        }
        v.setTextViewText(R.id.what, pending > 0 ? "📝 " + pending + " מחכים לאישור שלך" : "✓ אין מה לאשר");
        v.setViewVisibility(R.id.sub, View.GONE);
        for (Kid k : ks) {
            List<Row> rows = agenda(all, k.kid, legacy, today);
            int tasks = 0, done = 0;
            String nextTxt = "";
            for (Row r : rows) {
                if ("task".equals(r.type)) {
                    tasks++;
                    if ("✓".equals(r.mark) || "⏳".equals(r.mark)) done++;
                }
                if (nextTxt.isEmpty() && !r.done && (("event".equals(r.type) && r.start > now) || (!"event".equals(r.type) && r.t > now))) {
                    nextTxt = r.time + " " + r.title;
                }
            }
            int[] sc = score(all, k.kid, legacy);
            RemoteViews line = new RemoteViews(c.getPackageName(), R.layout.widget_kid);
            line.setTextViewText(R.id.kname, "● " + k.name);
            line.setTextColor(R.id.kname, "yb".equals(k.theme) ? 0xFFFFD200 : Color.WHITE);
            line.setTextViewText(R.id.kinfo, "⭐ ‎" + sc[0] + (tasks > 0 ? " · ✓ " + done + "/" + tasks : "")
                    + (nextTxt.isEmpty() ? "" : "\nהבא: " + nextTxt));
            line.setTextColor(R.id.kinfo, 0xE6FFFFFF);
            v.addView(R.id.kids, line);
        }
        v.setTextViewText(R.id.pts, "");
        return v;
    }

    // ------------------------------------------------------------------ "היום"

    static RemoteViews buildDay(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_day);
        v.setOnClickPendingIntent(R.id.root, openApp(c));
        v.removeAllViews(R.id.list);
        JSONObject all = Store.items(c);
        String legacy = Store.legacyKid(all);
        long now = System.currentTimeMillis();
        Calendar today = U.startOfDay(now);
        v.setTextViewText(R.id.title, "📅 " + dateLine(today));

        if (Store.code(c).isEmpty()) {
            v.setTextViewText(R.id.hpts, "");
            v.addView(R.id.list, note(c, "פותחים את בזמן ומצטרפים למשפחה"));
            return v;
        }

        if (Store.isChild(c)) {
            String me = Store.myKid(c);
            v.setInt(R.id.head, "setBackgroundResource", bgFor(Store.myTheme(c)));
            int[] sc = score(all, me, legacy);
            v.setTextViewText(R.id.hpts, "⭐ ‎" + sc[0]);
            List<Row> rows = agenda(all, me, legacy, today);
            if (rows.isEmpty()) v.addView(R.id.list, note(c, "🌈 אין כלום היום"));
            int shown = 0;
            for (Row r : rows) {
                if (shown >= 9) break;
                v.addView(R.id.list, row(c, r, now));
                shown++;
            }
            if (rows.size() > shown) v.addView(R.id.list, note(c, "ועוד " + (rows.size() - shown) + "…"));
            return v;
        }

        // parent: one part per child
        v.setInt(R.id.head, "setBackgroundResource", R.drawable.wg_bg_purple);
        v.setTextViewText(R.id.hpts, "");
        List<Kid> ks = kids(all);
        if (ks.isEmpty()) {
            v.addView(R.id.list, note(c, "אף ילד עוד לא מחובר"));
            return v;
        }
        int per = ks.size() == 1 ? 9 : ks.size() == 2 ? 4 : 3;
        for (Kid k : ks) {
            List<Row> rows = agenda(all, k.kid, legacy, today);
            int tasks = 0, done = 0;
            for (Row r : rows) {
                if (!"task".equals(r.type)) continue;
                tasks++;
                if ("✓".equals(r.mark) || "⏳".equals(r.mark)) done++;
            }
            int[] sc = score(all, k.kid, legacy);
            RemoteViews head = new RemoteViews(c.getPackageName(), R.layout.widget_kid);
            head.setTextViewText(R.id.kname, "● " + k.name);
            head.setTextColor(R.id.kname, kidColor(k.theme));
            head.setTextViewText(R.id.kinfo, "⭐ ‎" + sc[0] + (tasks > 0 ? " · ✓ " + done + "/" + tasks : ""));
            v.addView(R.id.list, head);
            if (rows.isEmpty()) v.addView(R.id.list, note(c, "אין כלום היום"));
            // show what is still ahead first, then what's done
            List<Row> order = new ArrayList<>();
            for (Row r : rows) if (!r.done) order.add(r);
            for (Row r : rows) if (r.done) order.add(r);
            int shown = 0;
            for (Row r : order) {
                if (shown >= per) break;
                v.addView(R.id.list, row(c, r, now));
                shown++;
            }
            if (order.size() > shown) v.addView(R.id.list, note(c, "ועוד " + (order.size() - shown) + "…"));
        }
        return v;
    }

    static RemoteViews row(Context c, Row r, long now) {
        RemoteViews x = new RemoteViews(c.getPackageName(), R.layout.widget_row);
        x.setTextViewText(R.id.rtime, r.time);
        x.setTextViewText(R.id.rtitle, r.title);
        x.setTextViewText(R.id.rmark, r.mark == null ? "" : r.mark);
        boolean late = !r.done && "task".equals(r.type) && now > r.t;
        int ink = r.done ? 0xFF9A96B2 : 0xFF241C4F;
        x.setTextColor(R.id.rtitle, ink);
        x.setTextColor(R.id.rtime, ink);
        x.setTextColor(R.id.rmark, late ? 0xFFE5484D : "✓".equals(r.mark) ? 0xFF11784F : 0xFF6C4BF5);
        if (late) x.setTextViewText(R.id.rmark, "!");
        return x;
    }

    static RemoteViews note(Context c, String text) {
        RemoteViews x = new RemoteViews(c.getPackageName(), R.layout.widget_kid);
        x.setTextViewText(R.id.kname, "");
        x.setViewVisibility(R.id.kname, View.GONE);
        x.setTextViewText(R.id.kinfo, text);
        x.setTextColor(R.id.kinfo, 0xFF8D88A8);
        return x;
    }

    static String two(int n) {
        return String.format(Locale.US, "%02d", n);
    }
}
