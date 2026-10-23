package com.heavyfocus.bezman;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;

import org.json.JSONObject;

import java.util.List;

public final class Notify {
    private Notify() {}

    static final String CH_ALARM = "alarm2";
    static final String CH_REMIND = "remind";
    static final String CH_FAMILY = "family";

    static NotificationManager nm(Context c) {
        return (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    public static void channels(Context c) {
        NotificationManager nm = nm(c);
        NotificationChannel a = new NotificationChannel(CH_ALARM, "שעון מעורר", NotificationManager.IMPORTANCE_HIGH);
        a.setSound(null, null);
        a.setBypassDnd(true);
        a.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(a);

        NotificationChannel r = new NotificationChannel(CH_REMIND, "תזכורות יציאה ומשימות", NotificationManager.IMPORTANCE_HIGH);
        r.enableVibration(true);
        r.setVibrationPattern(new long[]{0, 400, 200, 400});
        r.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
        r.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(r);

        NotificationChannel f = new NotificationChannel(CH_FAMILY, "עדכונים מהמשפחה", NotificationManager.IMPORTANCE_HIGH);
        nm.createNotificationChannel(f);
    }

    static int nid(String key) {
        return (key == null ? 0 : key.hashCode() & 0x3fffffff) + 2000;
    }

    static PendingIntent openApp(Context c) {
        Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, 901, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Reminder on the child's phone, optionally with a "יצאתי" / "סיימתי" button. */
    public static void remind(Context c, String key, String title, String text, String what, String ref, String occ) {
        Notification.Builder b = new Notification.Builder(c, CH_REMIND)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setColor(0xFF6C4BF5)
                .setContentIntent(openApp(c))
                .setAutoCancel(true);
        if (what != null) {
            Intent i = new Intent(c, AlarmReceiver.class).setAction(AlarmReceiver.ACT)
                    .putExtra("what", what).putExtra("ref", ref).putExtra("occ", occ).putExtra("key", key);
            PendingIntent pi = PendingIntent.getBroadcast(c, nid(key), i,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            String label = "left".equals(what) ? "יצאתי ✅" : "סיימתי ✅";
            b.addAction(new Notification.Action.Builder(null, label, pi).build());
        }
        try {
            nm(c).notify(nid(key), b.build());
        } catch (Exception ignored) {
        }
    }

    public static void praise(Context c, String key, int pts, String title) {
        Notification n = new Notification.Builder(c, CH_FAMILY)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(title + " \u200E+" + pts + " ⭐")
                .setContentText("כל הכבוד! ממשיכים ככה")
                .setColor(0xFF3DDC97)
                .setContentIntent(openApp(c))
                .setAutoCancel(true)
                .setTimeoutAfter(15_000)
                .build();
        try {
            nm(c).notify(nid(key), n);
        } catch (Exception ignored) {
        }
    }

    public static void cancel(Context c, String key) {
        if (key != null) nm(c).cancel(nid(key));
    }

    static void family(Context c, String key, String title, String text) {
        if (!Store.markNotified(c, key)) return;
        Notification n = new Notification.Builder(c, CH_FAMILY)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setColor(0xFF6C4BF5)
                .setContentIntent(openApp(c))
                .setAutoCancel(true)
                .build();
        try {
            nm(c).notify(nid(key), n);
        } catch (Exception ignored) {
        }
    }

    /** Shows notifications about things other family members did. */
    public static void onRemote(Context c, List<JSONObject[]> changes) {
        long now = System.currentTimeMillis();
        String me = Store.dev(c);
        boolean child = Store.isChild(c);
        String kid = Store.childName(c);
        if (kid.isEmpty()) kid = "הילדה";
        for (JSONObject[] ch : changes) {
            JSONObject old = ch[0], n = ch[1];
            if (!U.alive(n) || me.equals(n.optString("dev"))) continue;
            if (n.optLong("upd") < now - 12 * U.HOUR) continue;
            String kind = n.optString("kind");
            String id = n.optString("id");
            String title = n.optString("title");
            if (!child) {
                if ("log".equals(kind) && old == null) {
                    String type = n.optString("type");
                    String at = U.hhmm(n.optLong("at", now));
                    int pts = n.optInt("pts");
                    switch (type) {
                        case "woke":
                            family(c, id, "☀️ " + kid + " קמה (" + at + ")",
                                    (n.optBoolean("snoozed") ? "אחרי נודניק" : "בזמן, בלי נודניק") + " · \u200E+" + pts + " ⭐");
                            break;
                        case "wake_missed":
                            family(c, id, "⚠️ " + kid + " לא כיבתה את השעון המעורר",
                                    "השעון מצלצל כבר 10 דקות. אולי כדאי להעיר אותה");
                            break;
                        case "left":
                            int late = n.optInt("late");
                            family(c, id, "🚪 " + kid + " יצאה ל" + title + " (" + at + ")",
                                    late > 0 ? "באיחור של " + late + " דק׳ · \u200E+" + pts + " ⭐" : "בזמן! · \u200E+" + pts + " ⭐");
                            break;
                        case "leave_missed":
                            family(c, id, "⚠️ " + kid + " לא סימנה יציאה ל" + title,
                                    "עברו 10 דקות משעת היציאה");
                            break;
                        case "task_done":
                            family(c, id, "✅ " + kid + " סיימה: " + title,
                                    (n.optBoolean("late") ? "באיחור" : "בזמן") + " · \u200E+" + pts + " ⭐");
                            break;
                        case "bonus":
                            family(c, id, "🔥 " + kid + " השיגה " + title + "!", "בונוס \u200E+" + pts + " ⭐ · שווה מילה טובה");
                            break;
                        default:
                            break;
                    }
                } else if ("redeem".equals(kind) && "pending".equals(n.optString("status"))) {
                    family(c, id + ":pending", "🎁 " + kid + " רוצה לממש פרס",
                            title + " · " + n.optInt("cost") + " ⭐ – נכנסים לאפליקציה כדי לאשר");
                }
            } else {
                if (("task".equals(kind) || "event".equals(kind)) && old == null) {
                    family(c, id + ":new", "📌 חדש בלו״ז: " + title, "נוסף על ידי " + n.optString("by"));
                } else if ("reward".equals(kind) && old == null) {
                    family(c, id + ":new", "🎁 פרס חדש: " + title, "שווה " + n.optInt("cost") + " ⭐");
                } else if ("redeem".equals(kind) && old != null && !n.optString("status").equals(old.optString("status"))) {
                    if ("approved".equals(n.optString("status")))
                        family(c, id + ":ok", "🎉 אושר! " + title, "תהני!");
                    else if ("declined".equals(n.optString("status")))
                        family(c, id + ":no", "הבקשה ל" + title + " לא אושרה", "הנקודות חזרו אלייך");
                } else if ("log".equals(kind) && "gift".equals(n.optString("type")) && old == null) {
                    int pts = n.optInt("pts");
                    family(c, id, "💜 " + n.optString("by") + ": " + title,
                            pts > 0 ? "קיבלת \u200E+" + pts + " ⭐ בונוס" : "הודעה מההורים");
                }
            }
        }
    }
}
