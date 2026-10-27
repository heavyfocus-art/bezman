package com.heavyfocus.bezman;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/** Small date / time / json helpers. Day index: 0 = Sunday ... 6 = Saturday (same as JS getDay). */
public final class U {
    private U() {}

    public static final long MIN = 60_000L;
    public static final long HOUR = 60 * MIN;
    public static final long DAY = 24 * HOUR;

    public static String occ(Calendar c) {
        return String.format(Locale.US, "%04d-%02d-%02d",
                c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    public static String occ(long t) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(t);
        return occ(c);
    }

    public static Calendar startOfDay(long t) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(t);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c;
    }

    /** Parses "yyyy-MM-dd" to the start of that day, or null. */
    public static Calendar dayOf(String occ) {
        try {
            String[] p = occ.split("-");
            Calendar c = Calendar.getInstance();
            c.clear();
            c.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]), 0, 0, 0);
            return c;
        } catch (Exception e) {
            return null;
        }
    }

    public static int dow(Calendar c) {
        return c.get(Calendar.DAY_OF_WEEK) - 1;
    }

    /** "HH:MM" -> minutes since midnight, -1 if invalid. */
    public static int mins(String hhmm) {
        if (hhmm == null) return -1;
        try {
            String[] p = hhmm.trim().split(":");
            int h = Integer.parseInt(p[0]);
            int m = Integer.parseInt(p[1]);
            if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
            return h * 60 + m;
        } catch (Exception e) {
            return -1;
        }
    }

    /** Time of day (minutes, may be negative or > 1440) on the given day. */
    public static long at(Calendar day, int minutes) {
        Calendar c = (Calendar) day.clone();
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        c.add(Calendar.MINUTE, minutes);
        return c.getTimeInMillis();
    }

    public static long at(String occ, int minutes) {
        Calendar d = dayOf(occ);
        if (d == null) return 0;
        return at(d, minutes);
    }

    public static String hhmm(long t) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(t);
        return String.format(Locale.US, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE));
    }

    /** Does an alarm / event / task happen on this day? One-off items have "date", repeating ones "days". */
    public static boolean occursOn(JSONObject it, Calendar day) {
        String date = it.optString("date", "");
        if (date.length() > 0) return date.equals(occ(day));
        JSONArray days = it.optJSONArray("days");
        if (days == null) return false;
        int d = dow(day);
        for (int i = 0; i < days.length(); i++) {
            if (days.optInt(i, -1) == d) return true;
        }
        return false;
    }

    public static boolean alive(JSONObject it) {
        return it != null && !it.optBoolean("del", false);
    }

    /** A parent turned this alarm / task / event off for one day only (item "off:<id>:<day>"). */
    public static boolean isOff(JSONObject all, String id, String occ) {
        return all != null && alive(all.optJSONObject("off:" + id + ":" + occ));
    }

    public static void put(JSONObject o, String k, Object v) {
        try {
            o.put(k, v);
        } catch (Exception ignored) {
        }
    }

    public static JSONObject obj(Object... kv) {
        JSONObject o = new JSONObject();
        for (int i = 0; i + 1 < kv.length; i += 2) put(o, String.valueOf(kv[i]), kv[i + 1]);
        return o;
    }

    /** Leave time (millis) of an event on a given day. */
    public static long leaveAt(JSONObject ev, String occ) {
        int start = mins(ev.optString("start"));
        if (start < 0) return 0;
        return at(occ, start - Math.max(0, ev.optInt("travel", 0)));
    }
}
