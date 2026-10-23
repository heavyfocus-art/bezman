package com.heavyfocus.bezman;

import android.content.Context;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Family sync with no server setup: encrypted messages through the free public relay ntfy.sh.
 * The family code is the secret: it picks the (hidden) channel name and the encryption key.
 */
public final class Sync {
    private Sync() {}

    static final String BASE = "https://ntfy.sh/";
    static final int MAX_MSG = 3200;
    static final ExecutorService EX = Executors.newSingleThreadExecutor();
    static final SecureRandom RND = new SecureRandom();

    // ---------- crypto ----------
    static byte[] sha(String s) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
    }

    static String topic(String code) throws Exception {
        byte[] h = sha("bezman-topic:" + code);
        StringBuilder sb = new StringBuilder("bezman_");
        for (int i = 0; i < 12; i++) sb.append(String.format("%02x", h[i]));
        return sb.toString();
    }

    static String encrypt(String code, String json) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        GZIPOutputStream gz = new GZIPOutputStream(bo);
        gz.write(json.getBytes(StandardCharsets.UTF_8));
        gz.close();
        byte[] plain = bo.toByteArray();
        byte[] iv = new byte[12];
        RND.nextBytes(iv);
        Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
        ci.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(sha("bezman-key:" + code), "AES"), new GCMParameterSpec(128, iv));
        byte[] ct = ci.doFinal(plain);
        byte[] all = new byte[iv.length + ct.length];
        System.arraycopy(iv, 0, all, 0, iv.length);
        System.arraycopy(ct, 0, all, iv.length, ct.length);
        return Base64.encodeToString(all, Base64.NO_WRAP);
    }

    static byte[] encryptBytes(String code, byte[] plain) throws Exception {
        byte[] iv = new byte[12];
        RND.nextBytes(iv);
        Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
        ci.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(sha("bezman-key:" + code), "AES"), new GCMParameterSpec(128, iv));
        byte[] ct = ci.doFinal(plain);
        byte[] all = new byte[iv.length + ct.length];
        System.arraycopy(iv, 0, all, 0, iv.length);
        System.arraycopy(ct, 0, all, iv.length, ct.length);
        return all;
    }

    static byte[] decryptBytes(String code, byte[] all) {
        try {
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.DECRYPT_MODE, new SecretKeySpec(sha("bezman-key:" + code), "AES"),
                    new GCMParameterSpec(128, all, 0, 12));
            return ci.doFinal(all, 12, all.length - 12);
        } catch (Exception e) {
            return null;
        }
    }

    static String decrypt(String code, String b64) {
        try {
            byte[] all = Base64.decode(b64, Base64.NO_WRAP);
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.DECRYPT_MODE, new SecretKeySpec(sha("bezman-key:" + code), "AES"),
                    new GCMParameterSpec(128, all, 0, 12));
            byte[] plain = ci.doFinal(all, 12, all.length - 12);
            GZIPInputStream gz = new GZIPInputStream(new ByteArrayInputStream(plain));
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = gz.read(buf)) > 0) bo.write(buf, 0, n);
            return new String(bo.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    // ---------- network ----------
    static boolean post(String topic, String body) {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(BASE + topic).openConnection();
            con.setConnectTimeout(15000);
            con.setReadTimeout(15000);
            con.setRequestMethod("POST");
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
            byte[] b = body.getBytes(StandardCharsets.UTF_8);
            con.setFixedLengthStreamingMode(b.length);
            OutputStream os = con.getOutputStream();
            os.write(b);
            os.close();
            int code = con.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception e) {
            return false;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    /** Sends items, split into small encrypted messages. */
    static boolean publishItems(String code, List<JSONObject> items, String prefix) throws Exception {
        String topic = topic(code);
        JSONArray cur = new JSONArray();
        String curEnc = null;
        for (JSONObject it : items) {
            JSONArray test = new JSONArray(cur.toString());
            test.put(it);
            String enc = encrypt(code, test.toString());
            if (prefix.length() + enc.length() > MAX_MSG && cur.length() > 0) {
                if (!post(topic, prefix + curEnc)) return false;
                cur = new JSONArray();
                cur.put(it);
                curEnc = encrypt(code, cur.toString());
            } else {
                cur = test;
                curEnc = enc;
            }
        }
        if (cur.length() > 0 && !post(topic, prefix + curEnc)) return false;
        return true;
    }

    /** Sends whatever changed on this phone and was not sent yet. */
    public static synchronized boolean flush(Context c) {
        String code = Store.code(c);
        if (code.isEmpty()) return false;
        List<String> ids = Store.outbox(c);
        if (ids.isEmpty()) return true;
        JSONObject all = Store.items(c);
        List<JSONObject> items = new ArrayList<>();
        for (String id : ids) {
            JSONObject o = all.optJSONObject(id);
            if (o != null) items.add(o);
        }
        try {
            if (publishItems(code, items, "BZ1:")) {
                Store.removeOutbox(c, ids);
                return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    public static void flushAsync(Context c) {
        final Context ac = c.getApplicationContext();
        EX.execute(() -> flush(ac));
    }

    /** Full copy of the family data, so phones that were off for a while catch up. */
    static void snapshot(Context c) {
        String code = Store.code(c);
        if (code.isEmpty()) return;
        JSONObject all = Store.items(c);
        long cutoff = System.currentTimeMillis() - 21 * U.DAY;
        List<JSONObject> items = new ArrayList<>();
        Iterator<String> it = all.keys();
        while (it.hasNext()) {
            JSONObject o = all.optJSONObject(it.next());
            if (o == null) continue;
            if (o.optLong("upd") < cutoff && ("log".equals(o.optString("kind")) || o.optBoolean("del"))) continue;
            items.add(o);
        }
        try {
            if (publishItems(code, items, "BZ1S:")) Store.setLong(c, "lastSnapAt", System.currentTimeMillis());
        } catch (Exception ignored) {
        }
    }

    /** Reads new messages from the family channel and merges them. */
    static List<JSONObject[]> poll(Context c, boolean[] wantSnap) {
        List<JSONObject[]> changes = new ArrayList<>();
        String code = Store.code(c);
        if (code.isEmpty()) return changes;
        HttpURLConnection con = null;
        try {
            String since = Store.getStr(c, "lastMsgId");
            if (since.isEmpty()) since = "all";
            con = (HttpURLConnection) new URL(BASE + topic(code) + "/json?poll=1&since=" + since).openConnection();
            con.setConnectTimeout(15000);
            con.setReadTimeout(20000);
            if (con.getResponseCode() != 200) return changes;
            InputStream is = con.getInputStream();
            BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            String line, lastId = null;
            String me = Store.dev(c);
            long lastSnap = Store.getLong(c, "lastSnapAt");
            while ((line = br.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                JSONObject m;
                try {
                    m = new JSONObject(line);
                } catch (Exception e) {
                    continue;
                }
                if (!"message".equals(m.optString("event"))) continue;
                lastId = m.optString("id", lastId);
                long time = m.optLong("time") * 1000L;
                String msg = m.optString("message", "");
                String data = null;
                if (msg.startsWith("BZ1R:")) {
                    if (!msg.substring(5).equals(me) && time > lastSnap) wantSnap[0] = true;
                    continue;
                } else if (msg.startsWith("BZ1S:")) {
                    data = decrypt(code, msg.substring(5));
                    if (data != null && time > lastSnap) lastSnap = time;
                } else if (msg.startsWith("BZ1:")) {
                    data = decrypt(code, msg.substring(4));
                }
                if (data == null) continue;
                try {
                    changes.addAll(Store.mergeRemote(c, new JSONArray(data)));
                } catch (Exception ignored) {
                }
            }
            br.close();
            if (lastId != null) Store.setStr(c, "lastMsgId", lastId);
            Store.setLong(c, "lastSnapAt", lastSnap);
        } catch (Exception ignored) {
        } finally {
            if (con != null) con.disconnect();
        }
        return changes;
    }

    /** Full sync round: send, receive, react, and share a full copy now and then. */
    public static synchronized void syncNow(Context c) {
        if (Store.code(c).isEmpty()) return;
        flush(c);
        boolean[] wantSnap = {false};
        List<JSONObject[]> changes = poll(c, wantSnap);
        if (!changes.isEmpty()) {
            Notify.onRemote(c, changes);
            Store.recomputeScore(c);
            Sched.reschedule(c);
            MainActivity.refreshUi();
        }
        if (Store.p(c).getBoolean("needJoin", false)) {
            try {
                if (post(topic(Store.code(c)), "BZ1R:" + Store.dev(c))) {
                    Store.p(c).edit().putBoolean("needJoin", false).apply();
                }
            } catch (Exception ignored) {
            }
        }
        Pin.autoUnlockIfNoPin(c);
        try {
            Photos.catchUp(c);
        } catch (Exception ignored) {
        }
        long since = System.currentTimeMillis() - Store.getLong(c, "lastSnapAt");
        if (wantSnap[0] || since > 6 * U.HOUR) snapshot(c);
        flush(c);
        Store.setLong(c, "lastSync", System.currentTimeMillis());
        MainActivity.refreshUi();
    }

    public static void syncAsync(Context c) {
        final Context ac = c.getApplicationContext();
        EX.execute(() -> syncNow(ac));
    }
}
