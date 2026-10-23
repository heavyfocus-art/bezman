package com.heavyfocus.bezman;

import android.content.Context;
import android.util.Base64;

import org.json.JSONObject;

import java.security.MessageDigest;
import java.security.SecureRandom;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * Parents' PIN. Only a hash is kept (item "pin", shared with the family).
 * Needed to join the family as a parent and, on a child's phone, to leave the family.
 */
public final class Pin {
    private Pin() {}

    static final int ITER = 20000;

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

    public static boolean check(Context c, String pin) {
        JSONObject p = item(c);
        if (p == null || pin == null) return false;
        String h = hash(pin.trim(), p.optString("salt"));
        return !h.isEmpty() && MessageDigest.isEqual(h.getBytes(), p.optString("hash").getBytes());
    }

    /** Sets or changes the PIN. Changing needs the old one. */
    public static boolean set(Context c, String newPin, String oldPin) {
        if (Store.isChild(c) || !unlocked(c)) return false;
        if (newPin == null || !newPin.trim().matches("\\d{4,8}")) return false;
        if (exists(c) && !check(c, oldPin)) return false;
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        String s = Base64.encodeToString(salt, Base64.NO_WRAP);
        JSONObject p = U.obj("id", "pin", "kind", "config", "salt", s, "hash", hash(newPin.trim(), s));
        Store.upsertLocal(c, p);
        Store.afterLocalChange(c);
        return true;
    }

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
}
