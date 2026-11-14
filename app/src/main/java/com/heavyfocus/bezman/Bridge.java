package com.heavyfocus.bezman;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.security.SecureRandom;

/** What the screens (HTML/JS) can ask the phone to do. */
public class Bridge {
    static final String APK_URL = "https://github.com/heavyfocus-art/bezman/releases/latest/download/bezman.apk";
    final MainActivity a;
    final Context c;

    Bridge(MainActivity a) {
        this.a = a;
        this.c = a.getApplicationContext();
    }

    @JavascriptInterface
    public String state() {
        JSONObject me = U.obj("role", Store.role(c), "name", Store.name(c), "dev", Store.dev(c),
                "code", Store.code(c), "lastSync", Store.getLong(c, "lastSync"),
                "ringtone", Store.getStr(c, "ringtoneName"),
                "unlocked", Pin.unlocked(c), "pinSet", Pin.exists(c),
                "live", Store.p(c).getBoolean("live", true),
                "latest", Store.getStr(c, "latestVer"), "syncErr", Store.getStr(c, "syncErr"),
                "sendOk", Store.getLong(c, "lastSendOk"), "recvOk", Store.getLong(c, "lastRecvOk"),
                "outbox", Store.outbox(c).size(), "netTest", Store.getStr(c, "netTest"),
                "netTestAt", Store.getLong(c, "netTestAt"),
                "session", Pin.session(c), "lockOn", Pin.lockOn(c), "lockMin", Pin.lockMin(c),
                "bio", Pin.bioOn(c), "bioAvail", a.bioAvailable(), "pinWait", Pin.waitSec(c),
                "pattern", Pin.patternOn(c));
        if (Store.isChild(c)) {
            U.put(me, "kid", Store.myKid(c));
            U.put(me, "theme", Store.myTheme(c));
            U.put(me, "gender", Store.meBoy(c) ? "m" : "f");
        }
        long cel = Store.getLong(c, "celebrate");
        boolean celebrate = cel > 0 && System.currentTimeMillis() - cel < 12 * U.HOUR;
        if (cel > 0) Store.setLong(c, "celebrate", 0);
        return U.obj("items", Store.items(c), "me", me, "version", BuildConfig.VERSION_NAME,
                "apk", APK_URL, "now", System.currentTimeMillis(), "celebrate", celebrate,
                "fromPlay", fromPlay(c)).toString();
    }

    @JavascriptInterface
    public String upsert(String json) {
        if (!Store.isChild(c) && !Pin.canAct(c)) return state(); // locked parent phone
        try {
            JSONArray arr = json.trim().startsWith("[") ? new JSONArray(json) : new JSONArray().put(new JSONObject(json));
            if (Store.isChild(c)) arr = childOnly(arr);
            if (arr.length() == 0) return state();
            Store.upsertLocal(c, arr);
            Store.afterLocalChange(c);
        } catch (Exception ignored) {
        }
        return state();
    }

    /** On a child's phone: drops changes only parents may make (points, approvals, parent settings). */
    JSONArray childOnly(JSONArray arr) {
        JSONObject all = Store.items(c);
        JSONObject me = all.optJSONObject("m_" + Store.dev(c));
        JSONArray ok = new JSONArray();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject it = arr.optJSONObject(i);
            if (it == null) continue;
            JSONObject probe;
            try {
                probe = new JSONObject(it.toString());
            } catch (Exception e) {
                continue;
            }
            U.put(probe, "dev", Store.dev(c));
            if (Guard.childMay(all, me, all.optJSONObject(it.optString("id")), probe)) ok.put(it);
            else toast("רק ההורים יכולים לשנות את זה 🔒");
        }
        return ok;
    }

    @JavascriptInterface
    public String setup(String role, String name, String code) {
        Store.setup(c, role, name.trim(), normCode(code));
        Store.afterLocalChange(c);
        Sync.syncAsync(c);
        LiveService.start(c);
        return state();
    }

    static String normCode(String code) {
        StringBuilder sb = new StringBuilder();
        for (char ch : code.toUpperCase().toCharArray()) if (Character.isLetterOrDigit(ch)) sb.append(ch);
        return sb.toString();
    }

    @JavascriptInterface
    public String setup2(String role, String name, String code, String gender, String theme) {
        Store.setup(c, role, name.trim(), normCode(code), gender, theme);
        Store.afterLocalChange(c);
        Sync.syncAsync(c);
        LiveService.start(c);
        return state();
    }

    @JavascriptInterface
    public String setProfile(String gender, String theme) {
        Store.setProfile(c, gender, theme);
        Store.afterLocalChange(c);
        return state();
    }

    @JavascriptInterface
    public String newCode() {
        String abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        SecureRandom r = new SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 10; i++) sb.append(abc.charAt(r.nextInt(abc.length())));
        return sb.toString();
    }

    /** Connection check in the settings; the result arrives in state().netTest. */
    @JavascriptInterface
    public void netTest() {
        Store.setStr(c, "netTest", "running");
        MainActivity.refreshUi();
        new Thread(() -> {
            Store.setStr(c, "netTest", Sync.netTest());
            Store.setLong(c, "netTestAt", System.currentTimeMillis());
            MainActivity.refreshUi();
        }).start();
    }

    @JavascriptInterface
    public void syncNow() {
        Sync.syncAsync(c);
    }

    /** what: "left" | "task". Returns points earned, or -1 if already recorded. */
    @JavascriptInterface
    public int action(String what, String ref, String occ) {
        int pts = -1;
        switch (what) {
            case "left":
                pts = Store.left(c, ref, occ);
                Notify.cancel(c, "ev:" + ref + ":" + occ);
                break;
            case "task":
                pts = Store.taskDone(c, ref, occ, false);
                Notify.cancel(c, "tk:" + ref + ":" + occ);
                break;
            case "missed":
                pts = Store.taskMissed(c, ref, occ, false);
                Notify.cancel(c, "tk:" + ref + ":" + occ);
                break;
            case "approve":
            case "reject":
                if (!Pin.canAct(c)) break;
                pts = Store.approve(c, ref, "approve".equals(what)) ? 1 : -1;
                Notify.cancel(c, "appr:" + ref);
                break;
            default:
                break;
        }
        return pts;
    }

    /** A parent decides on a task marked done: ok = approve with pts points (may be 0 or minus), !ok = send back. */
    @JavascriptInterface
    public boolean decide(String logId, boolean ok, int pts) {
        if (!Pin.canAct(c)) return false;
        boolean done = Store.decide(c, logId, ok, pts);
        if (done) Notify.cancel(c, "appr:" + logId);
        return done;
    }

    /** A parent changes the points of a task that was already decided. */
    @JavascriptInterface
    public boolean adjust(String logId, int pts) {
        return Pin.canAct(c) && Store.adjust(c, logId, pts);
    }

    @JavascriptInterface
    public void share(String text) {
        Intent wa = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
        wa.setPackage("com.whatsapp");
        try {
            a.startActivity(wa);
        } catch (Exception e) {
            Intent any = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
            try {
                a.startActivity(Intent.createChooser(any, "שיתוף"));
            } catch (Exception ignored) {
            }
        }
    }

    @JavascriptInterface
    public String perms() {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        boolean notif = nm.areNotificationsEnabled();
        boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        boolean full = Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent();
        boolean battery = pm.isIgnoringBatteryOptimizations(c.getPackageName());
        return U.obj("notif", notif, "exact", exact, "full", full, "battery", battery,
                "samsung", "samsung".equalsIgnoreCase(Build.MANUFACTURER)).toString();
    }

    @JavascriptInterface
    public void fixPerm(String which) {
        String pkg = c.getPackageName();
        Intent i;
        switch (which) {
            case "notif":
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
                break;
            case "exact":
                i = new Intent("android.settings.REQUEST_SCHEDULE_EXACT_ALARM", Uri.parse("package:" + pkg));
                break;
            case "full":
                i = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT", Uri.parse("package:" + pkg));
                break;
            case "battery":
                i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg));
                break;
            default:
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
        }
        try {
            a.startActivity(i);
        } catch (Exception e) {
            try {
                a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)));
            } catch (Exception ignored) {
            }
        }
    }

    /** Take / choose a photo, then the task is marked done with it. mode: "camera" | "gallery". */
    @JavascriptInterface
    public void takePhoto(String taskId, String occ, String mode) {
        a.runOnUiThread(() -> a.startPhoto(taskId, occ, mode));
    }

    /** The task photo as an image the screen can show, or "" if not on this phone (yet). */
    @JavascriptInterface
    public String photo(String logId) {
        return Photos.dataUrl(c, logId);
    }

    // ---------- parents' PIN ----------
    @JavascriptInterface
    public boolean setPin(String newPin, String oldPin) {
        return Pin.set(c, newPin, oldPin);
    }

    /** Unlocks this parent phone (after joining, or the app lock). */
    @JavascriptInterface
    public boolean unlockPin(String pin) {
        boolean ok = Pin.unlocked(c) ? Pin.openSession(c, pin) : Pin.unlock(c, pin);
        if (ok) Store.afterLocalChange(c);
        return ok;
    }

    /** Unlock pattern (drawn dots "1".."9") for this phone's app lock. */
    @JavascriptInterface
    public boolean setPattern(String pat) {
        return Pin.setPattern(c, pat);
    }

    @JavascriptInterface
    public boolean clearPattern() {
        return Pin.clearPattern(c);
    }

    @JavascriptInterface
    public boolean unlockPattern(String pat) {
        boolean ok = Pin.openSessionPattern(c, pat);
        if (ok) Store.afterLocalChange(c);
        return ok;
    }

    /** Seconds to wait after too many wrong codes (0 = may try). */
    @JavascriptInterface
    public int pinWait() {
        return Pin.waitSec(c);
    }

    @JavascriptInterface
    public boolean pinWeak(String pin) {
        return Pin.weak(pin == null ? "" : pin.trim());
    }

    /** App lock on a parent's phone: on/off and after how many minutes away. */
    @JavascriptInterface
    public boolean setLock(boolean on, int minutes) {
        if (!Pin.canAct(c)) return false;
        Pin.setLock(c, on, minutes);
        return true;
    }

    @JavascriptInterface
    public boolean setBio(boolean on) {
        if (!Pin.canAct(c)) return false;
        Pin.setBio(c, on && a.bioAvailable());
        return true;
    }

    @JavascriptInterface
    public void lockNow() {
        Pin.lockNow();
        MainActivity.refreshUi();
    }

    /** Opens the app lock with fingerprint / face (if the parent turned it on). */
    @JavascriptInterface
    public void bio() {
        if (Pin.bioOn(c) && Pin.unlocked(c)) a.runOnUiThread(a::askBio);
    }

    /** Only checks (used on a child's phone before leaving the family). */
    @JavascriptInterface
    public boolean checkPin(String pin) {
        return Pin.check(c, pin);
    }

    @JavascriptInterface
    public void lockParent() {
        Pin.lock(c);
    }

    // ---------- personal design (this phone only) ----------
    @JavascriptInterface
    public String getPrefs() {
        return Store.getStr(c, "uiPrefs");
    }

    @JavascriptInterface
    public void setPrefs(String json) {
        Store.setStr(c, "uiPrefs", json == null ? "" : json);
    }

    @JavascriptInterface
    public void setTextZoom(int z) {
        final int zz = Math.max(70, Math.min(160, z));
        a.runOnUiThread(() -> a.web.getSettings().setTextZoom(zz));
    }

    // ---------- microphone ----------
    @JavascriptInterface
    public void voice() {
        a.runOnUiThread(a::startVoice);
    }

    @JavascriptInterface
    public void setBars(String hex) {
        try {
            a.setBars(android.graphics.Color.parseColor(hex));
        } catch (Exception ignored) {
        }
    }

    /** Was this copy installed from Google Play? (then updates come from Play, not from the APK link) */
    static boolean fromPlay(Context c) {
        try {
            String inst;
            if (Build.VERSION.SDK_INT >= 30) inst = c.getPackageManager().getInstallSourceInfo(c.getPackageName()).getInstallingPackageName();
            else inst = c.getPackageManager().getInstallerPackageName(c.getPackageName());
            return "com.android.vending".equals(inst);
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public void openUpdate() {
        String url = fromPlay(c) ? "market://details?id=" + c.getPackageName() : APK_URL;
        try {
            a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            try {
                a.startActivity(new Intent(Intent.ACTION_VIEW,
                        Uri.parse("https://play.google.com/store/apps/details?id=" + c.getPackageName())));
            } catch (Exception ignored) {
            }
        }
    }

    @JavascriptInterface
    public void setLive(boolean on) {
        Store.p(c).edit().putBoolean("live", on).apply();
        if (on) LiveService.start(c);
        else LiveService.stopIt(c);
    }

    /** Opens the phone's own list of alarm sounds. */
    @JavascriptInterface
    public void pickRingtone() {
        String cur = Store.getStr(c, "ringtone");
        Intent i = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER)
                .putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM | RingtoneManager.TYPE_RINGTONE)
                .putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "צלצול לשעון המעורר")
                .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
                .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
                .putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI,
                        cur.isEmpty() ? RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) : Uri.parse(cur));
        a.runOnUiThread(() -> {
            try {
                a.startActivityForResult(i, MainActivity.REQ_RINGTONE);
            } catch (Exception e) {
                toast("לא נמצאה רשימת צלצולים בטלפון");
            }
        });
    }

    /** Lets her choose any song / sound file from the phone. */
    @JavascriptInterface
    public void pickSong() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("audio/*");
        a.runOnUiThread(() -> {
            try {
                a.startActivityForResult(i, MainActivity.REQ_SONG);
            } catch (Exception e) {
                toast("לא ניתן לפתוח את הקבצים");
            }
        });
    }

    /** Plays the chosen sound for 5 seconds. */
    @JavascriptInterface
    public void previewRingtone() {
        a.runOnUiThread(() -> {
            try {
                String cur = Store.getStr(c, "ringtone");
                Uri u = cur.isEmpty() ? RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) : Uri.parse(cur);
                final android.media.Ringtone r = RingtoneManager.getRingtone(c, u);
                if (r == null) return;
                r.play();
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(r::stop, 5000);
            } catch (Exception ignored) {
            }
        });
    }

    @JavascriptInterface
    public void testAlarm() {
        Sched.scheduleTest(c);
    }

    @JavascriptInterface
    public void toast(String s) {
        a.runOnUiThread(() -> Toast.makeText(c, s, Toast.LENGTH_SHORT).show());
    }

    @JavascriptInterface
    public void openUrl(String url) {
        try {
            a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public String reset() {
        if (!Store.isChild(c) && !Store.role(c).isEmpty() && Pin.unlocked(c) && !Pin.session(c)) return state();
        LiveService.stopIt(c);
        Store.reset(c);
        Sched.reschedule(c);
        return state();
    }
}
