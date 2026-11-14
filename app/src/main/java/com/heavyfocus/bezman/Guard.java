package com.heavyfocus.bezman;

import org.json.JSONObject;

/**
 * What a child's phone is allowed to change. Checked twice:
 * on the child's own phone before saving from the screen, and on every phone when changes arrive from the family.
 * Children can mark tasks, wake up, leave, ask for rewards and manage their own alarms –
 * but they can never approve, give themselves points, change points of a task or turn a parent setting.
 */
public final class Guard {
    private Guard() {}

    /** Max points a child's phone may write for things it records by itself. */
    static int maxSelf(String type) {
        switch (type) {
            case "woke":
            case "left":
                return 10;
            case "bonus":
                return 15;
            default:
                return 0;
        }
    }

    /** The member item of the phone that wrote this item, or null if not known (yet). */
    static JSONObject author(JSONObject all, JSONObject it) {
        String dev = it == null ? "" : it.optString("dev", "");
        return dev.isEmpty() ? null : all.optJSONObject("m_" + dev);
    }

    /** "parent", "child" or "" when the writing phone is not known yet. */
    static String role(JSONObject all, JSONObject it) {
        JSONObject m = author(all, it);
        return m == null ? "" : m.optString("role", "");
    }

    /**
     * May a child's phone (member m) write n, given that old is the version we have now (may be null)?
     * all = everything we know (used to look up rewards).
     */
    public static boolean childMay(JSONObject all, JSONObject m, JSONObject old, JSONObject n) {
        if (n == null) return false;
        String kind = n.optString("kind");
        String id = n.optString("id");
        String myKid = m == null ? "" : Store.memberKid(m);
        String myName = m == null ? "" : m.optString("name");
        String legacy = Store.legacyKid(all);
        boolean forMe = myKid.isEmpty() || Store.kidOf(n, legacy).equals(myKid);
        switch (kind) {
            case "member":
                // only the phone's own line (joining as a parent needs the parents' PIN on that phone)
                return id.equals("m_" + n.optString("dev"));
            case "device":
                return id.equals("dv:" + n.optString("dev"));
            case "score":
            case "sched":
                return forMe;
            case "alarm":
            case "event":
                return forMe;
            case "task": {
                if (!forMe) return false;
                if (old == null || !U.alive(old)) return n.optInt("pts", 5) <= 5; // a new task of my own: points are set by parents
                // only my own tasks, and never their points / photo rule
                if (!myName.isEmpty() && !myName.equals(old.optString("by"))) return false;
                return n.optInt("pts", 5) == old.optInt("pts", 5) && n.optBoolean("photo") == old.optBoolean("photo");
            }
            case "redeem": {
                if (!forMe) return false;
                if (old != null) return old.optString("status").equals(n.optString("status")) && n.optInt("cost") == old.optInt("cost");
                if (!"pending".equals(n.optString("status"))) return false;
                JSONObject rw = all.optJSONObject(n.optString("reward"));
                return n.optInt("cost") > 0 && (rw == null || n.optInt("cost") >= rw.optInt("cost"));
            }
            case "log": {
                if (!forMe) return false;
                String type = n.optString("type");
                int pts = n.optInt("pts", 0);
                if ("gift".equals(type)) return false;
                // what a parent already decided (or changed) stays
                if (old != null && U.alive(old) && ("approved".equals(old.optString("status")) || old.has("adjBy"))) return false;
                if ("task_done".equals(type)) {
                    // marked done: waits for a parent, no points yet
                    return "pending".equals(n.optString("status")) && pts == 0 && n.optInt("claim", 0) <= taskPts(all, n);
                }
                if ("task_missed".equals(type)) return pts <= 0;
                return pts <= maxSelf(type);
            }
            default:
                // rewards, the parents' PIN, colors chosen by parents, "not today" for a task …
                return false;
        }
    }

    static int taskPts(JSONObject all, JSONObject log) {
        JSONObject t = all.optJSONObject(log.optString("ref"));
        return t == null ? 999 : Store.taskBase(t);
    }

    /** For changes arriving from other phones: keep it unless a child's phone wrote something it may not. */
    public static boolean acceptRemote(JSONObject all, JSONObject old, JSONObject n) {
        JSONObject m = author(all, n);
        if (m == null) {
            // a phone we do not know yet; a member line may come in the same message
            return true;
        }
        if (!"child".equals(m.optString("role"))) return true;
        return childMay(all, m, old, n);
    }
}
