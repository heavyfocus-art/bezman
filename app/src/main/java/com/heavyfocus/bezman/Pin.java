package com.heavyfocus.bezman;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import org.json.JSONObject;

import java.security.MessageDigest;
import java.security.SecureRandom;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * Parents' PIN. Only a hash is kept (item "pin", shared with the family).
 * Needed to join the family as a parent, to open the app on a parent's phone (app lock),
 * and, on a child's phone, to leave the family.
 * Wrong guesses are limited: after 5 wrong codes the phone waits, longer each time.
 */
public final class Pin {
    private Pin() {}

    static final int ITER = 20000;
    static final int FREE_TRIES = 5;

    static String hash(String pin, String salt) {
        try {
            PBEKeySpec spec = new PBEKeySpec(("bezman-pin:" + pin).toCharArray(),
                    Base64.decode(salt, Base64.NO_WRAP), ITER, 256);
            byte[] h = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            return Base64.encodeToString(h, Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }

    static JSONObject item(Context c) {
        JSONObject p = Store.get(c, "pin");
        return U.alive(p) && !p.optString("hash").isEmpty() ? p : null;
    }

    public static boolean exists(Context c) {
        return item(c) != null;
    }

    // ---------- limited guesses ----------
    /** Seconds to wait before the next try (0 = may try now). */
    public static int waitSec(Context c) {
        long until = Store.getLong(c, "pinWaitUntil");
        long left = until - System.currentTimeMillis();
        return left > 0 ? (int) Math.ceil(left / 1000.0) : 0;
    }

    static void failed(Context c) {
        SharedPreferences p = Store.p(c);
        int n = p.getInt("pinFails", 0) + 1;
        SharedPreferences.Editor e = p.edit().putInt("pinFails", n);
        if (n >= FREE_TRIES) {
            // 30 s, 1 min, 2 min … up to 30 min
            long wait = Math.min(30 * U.MIN, 30_000L << Math.min(10, n - FREE_TRIES));
            e.putLong("pinWaitUntil", System.currentTimeMillis() + wait);
        }
        e.apply();
    }

    static void succeeded(Context c) {
        Store.p(c).edit().putInt("pinFails", 0).putLong("pinWaitUntil", 0).apply();
    }

    /** Checks the PIN, counting wrong guesses. False while the phone must wait. */
    public static boolean check(Context c, String pin) {
        JSONObject p = item(c);
        if (p == null || pin == null || waitSec(c) > 0) return false;
        String h = hash(pin.trim(), p.optString("salt"));
        boolean ok = !h.isEmpty() && MessageDigest.isEqual(h.getBytes(), p.optString("hash").getBytes());
        if (ok) succeeded(c);
        else failed(c);
        return ok;
    }

    /** Too easy to guess: all the same digit, or counting up / down (1234, 9876). */
    public static boolean weak(String pin) {
        if (pin == null || !pin.matches("\\d{4,8}")) return true;
        boolean same = true, up = true, down = true;
        for (int i = 1; i < pin.length(); i++) {
            int a = pin.charAt(i - 1), b = pin.charAt(i);
            if (b != a) same = false;
            if (b != a + 1) up = false;
            if (b != a - 1) down = false;
        }
        return same || up || down;
    }

    /** Sets or changes the PIN. Changing needs the old one. */
    public static boolean set(Context c, String newPin, String oldPin) {
        if (Store.isChild(c) || !unlocked(c)) return false;
        if (newPin == null || weak(newPin.trim())) return false;
        if (exists(c) && !check(c, oldPin)) return false;
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        String s = Base64.encodeToString(salt, Base64.NO_WRAP);
        JSONObject p = U.obj("id", "pin", "kind", "config", "salt", s, "hash", hash(newPin.trim(), s));
        Store.upsertLocal(c, p);
        sessionOk = true;
        Store.afterLocalChange(c);
        return true;
    }

    // ---------- joining as a parent ----------
    /** A parent phone that joined with the family code stays locked until the PIN is entered. */
    public static boolean unlocked(Context c) {
        return Store.p(c).getBoolean("pinOk", true);
    }

    public static void lock(Context c) {
        Store.p(c).edit().putBoolean("pinOk", false).apply();
    }

    public static boolean unlock(Context c, String pin) {
        if (!check(c, pin)) return false;
        Store.p(c).edit().putBoolean("pinOk", true).apply();
        sessionOk = true;
        return true;
    }

    /** Family without a PIN: unlock once the family data has arrived (so it isn't a lone new phone). */
    public static void autoUnlockIfNoPin(Context c) {
        if (unlocked(c) || Store.isChild(c) || exists(c)) return;
        int others = 0;
        String me = "m_" + Store.dev(c);
        for (JSONObject m : Store.list(Store.items(c), "member")) if (!me.equals(m.optString("id"))) others++;
        if (others > 0) Store.p(c).edit().putBoolean("pinOk", true).apply();
    }

    // ---------- app lock on a parent's phone ----------
    /** Unlocked since the app process started (a restart always locks again). */
    static volatile boolean sessionOk = false;
    static volatile long awayAt = 0;

    /** Is the app lock on? (default: on, once there is a PIN) */
    public static boolean lockOn(Context c) {
        return Store.p(c).getBoolean("appLock", true);
    }

    /** Minutes away from the app before it locks again. */
    public static int lockMin(Context c) {
        return Store.p(c).getInt("appLockMin", 1);
    }

    public static void setLock(Context c, boolean on, int minutes) {
        Store.p(c).edit().putBoolean("appLock", on).putInt("appLockMin", Math.max(1, Math.min(60, minutes))).apply();
    }

    public static boolean bioOn(Context c) {
        return Store.p(c).getBoolean("bio", false);
    }

    public static void setBio(Context c, boolean on) {
        Store.p(c).edit().putBoolean("bio", on).apply();
    }

    /** Does this phone need the PIN (or fingerprint) before showing the parents' screens? */
    static boolean lockApplies(Context c) {
        return !Store.isChild(c) && !Store.role(c).isEmpty() && exists(c) && lockOn(c);
    }

    /** The parent screens may be used right now. */
    public static boolean session(Context c) {
        return !lockApplies(c) || sessionOk;
    }

    /** Parent actions (approve, change points, edit tasks…) are allowed right now. */
    public static boolean canAct(Context c) {
        return !Store.isChild(c) && unlocked(c) && session(c);
    }

    /** The app went to the background. */
    public static void away() {
        awayAt = System.currentTimeMillis();
    }

    /** The app came back: lock again if it was away long enough. */
    public static void back(Context c) {
        if (sessionOk && awayAt > 0 && System.currentTimeMillis() - awayAt >= lockMin(c) * U.MIN) sessionOk = false;
        awayAt = 0;
    }

    public static void lockNow() {
        sessionOk = false;
    }

    /** Opens the app lock with the PIN. */
    public static boolean openSession(Context c, String pin) {
        if (!check(c, pin)) return false;
        sessionOk = true;
        return true;
    }

    // ---------- drawing a pattern instead of typing the PIN (this phone only) ----------
    /** A pattern = the dots in the order they were drawn, "1".."9", 4 to 9 dots, each dot once. */
    static boolean okPattern(String p) {
        if (p == null || !p.matches("[1-9]{4,9}")) return false;
        for (int i = 0; i < p.length(); i++) if (p.indexOf(p.charAt(i)) != i) return false;
        return true;
    }

    public static boolean patternOn(Context c) {
        return !Store.getStr(c, "patHash").isEmpty();
    }

    /** Sets this phone's unlock pattern (only while the parent screens are open). */
    public static boolean setPattern(Context c, String pat) {
        if (!canAct(c) || !exists(c) || !okPattern(pat)) return false;
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        String s = Base64.encodeToString(salt, Base64.NO_WRAP);
        Store.p(c).edit().putString("patSalt", s).putString("patHash", hash("pattern:" + pat, s)).apply();
        return true;
    }

    public static boolean clearPattern(Context c) {
        if (!canAct(c)) return false;
        Store.p(c).edit().remove("patSalt").remove("patHash").apply();
        return true;
    }

    /** Opens the app lock with the pattern. Wrong patterns count like wrong PINs. */
    public static boolean openSessionPattern(Context c, String pat) {
        if (!patternOn(c) || !unlocked(c) || waitSec(c) > 0 || pat == null) return false;
        String h = hash("pattern:" + pat, Store.getStr(c, "patSalt"));
        boolean ok = !h.isEmpty() && MessageDigest.isEqual(h.getBytes(), Store.getStr(c, "patHash").getBytes());
        if (ok) {
            succeeded(c);
            sessionOk = true;
        } else failed(c);
        return ok;
    }

    /** Opened with the phone's fingerprint / face. */
    static void openSessionBio() {
        sessionOk = true;
    }
}
