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
    static final String CH_RING = "alarm_ring";
    static final int ID_RING = 1003;
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

        // Backup for the wake-up alarm when Android does not let the app start its ringing service:
        // the notification itself rings (again and again) on the alarm sound.
        NotificationChannel rg = new NotificationChannel(CH_RING, "שעון מעורר – צלצול גיבוי", NotificationManager.IMPORTANCE_HIGH);
        rg.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        rg.enableVibration(true);
        rg.setVibrationPattern(new long[]{0, 800, 600, 800});
        rg.setBypassDnd(true);
        rg.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(rg);

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
            String label = "left".equals(what) ? "יצאתי ✅" : "בוצע ✅";
            b.addAction(new Notification.Action.Builder(null, label, pi).build());
        }
        try {
            nm(c).notify(nid(key), b.build());
        } catch (Exception ignored) {
        }
    }

    /** Ringing notification (repeats its alarm sound until opened) that opens the alarm screen. */
    static void alarmFallback(Context c, String id, String occ, String label) {
        Intent full = new Intent(c, AlarmActivity.class)
                .putExtra("id", id == null ? "" : id).putExtra("occ", occ == null ? "" : occ)
                .putExtra("label", label == null ? "" : label)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        PendingIntent fpi = PendingIntent.getActivity(c, 8, full,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(c, CH_RING)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle("⏰ בוקר טוב! זמן לקום")
                .setContentText(label == null || label.isEmpty() ? "לוחצים כאן כדי לכבות" : label)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setFullScreenIntent(fpi, true)
                .setContentIntent(fpi)
                .setOngoing(true)
                .setColor(0xFFFF7A59)
                .build();
        n.flags |= Notification.FLAG_INSISTENT;
        try {
            nm(c).notify(ID_RING, n);
        } catch (Exception ignored) {
        }
    }

    static void cancelAlarmFallback(Context c) {
        try {
            nm(c).cancel(ID_RING);
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

    /** Short confirmation on her phone: the task went to her parents for approval. */
    public static void sent(Context c, String key) {
        Notification n = new Notification.Builder(c, CH_FAMILY)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle("נשלח להורים לאישור 💌")
                .setContentText("הנקודות יתווספו כשההורים יאשרו")
                .setColor(0xFF6C4BF5)
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

    /** Parent notification with "approve" / "not approved" buttons for a task she marked done. */
    static void approval(Context c, String logId, String key, String title, String text) {
        if (!Store.markNotified(c, key)) return;
        Notification.Builder b = new Notification.Builder(c, CH_FAMILY)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setColor(0xFF6C4BF5)
                .setContentIntent(openApp(c))
                .setAutoCancel(true);
        String nkey = "appr:" + logId;
        for (int k = 0; k < 2; k++) {
            boolean ok = k == 0;
            Intent i = new Intent(c, AlarmReceiver.class).setAction(AlarmReceiver.ACT)
                    .putExtra("what", ok ? "approve" : "reject").putExtra("ref", logId).putExtra("occ", "")
                    .putExtra("key", nkey);
            PendingIntent pi = PendingIntent.getBroadcast(c, nid(nkey) + k, i,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            b.addAction(new Notification.Action.Builder(null, ok ? "לאשר ✅" : "לא אושר ❌", pi).build());
        }
        try {
            nm(c).notify(nid(nkey), b.build());
        } catch (Exception ignored) {
        }
    }

    /** Shows notifications about things other family members did. */
    public static void onRemote(Context c, List<JSONObject[]> changes) {
        long now = System.currentTimeMillis();
        String me = Store.dev(c);
        boolean child = Store.isChild(c);
        JSONObject all = Store.items(c);
        String legacy = Store.legacyKid(all);
        String myKid = child ? Store.myKid(c) : "";
        boolean meBoy = child && Store.meBoy(c);
        for (JSONObject[] ch : changes) {
            JSONObject old = ch[0], n = ch[1];
            boolean alarmGone = n != null && n.optBoolean("del") && "alarm".equals(n.optString("kind"));
            if ((!U.alive(n) && !alarmGone) || me.equals(n.optString("dev"))) continue;
            if (n.optLong("upd") < now - 12 * U.HOUR) continue;
            String kind = n.optString("kind");
            if ("member".equals(kind) || "score".equals(kind)) continue;
            String kidId = Store.kidOf(n, legacy);
            if (child && !kidId.equals(myKid)) continue; // about another child
            String kid = Store.kidName(all, kidId);
            final boolean boy = Store.kidBoy(all, kidId);
            java.util.function.BiFunction<String, String, String> g = (f, m) -> boy ? m : f;
            String id = n.optString("id");
            String title = n.optString("title");
            String type0 = n.optString("type");
            boolean taskLog = "log".equals(kind) && ("task_done".equals(type0) || "task_missed".equals(type0));
            boolean sameState = old != null && old.optString("type").equals(type0)
                    && old.optString("status").equals(n.optString("status"));
            if (taskLog) {
                if (sameState) continue;
                String st = n.optString("status");
                int pts = n.optInt("pts");
                if (!child) {
                    if ("task_done".equals(type0) && "pending".equals(st)) {
                        approval(c, id, id + ":p:" + n.optLong("upd"), "📝 " + kid + g.apply(" סימנה", " סימן") + " בוצע: " + title,
                                (n.optBoolean("photo") ? "📷 עם תמונה · " : "") + "מחכה לאישור שלך ("
                                        + n.optInt("claim") + " ⭐)");
                    } else if ("task_missed".equals(type0)) {
                        family(c, id + ":m", "❌ " + kid + (n.optBoolean("auto") ? g.apply(" לא סימנה", " לא סימן") + " עד סוף היום: "
                                : g.apply(" סימנה", " סימן") + " לא בוצע: ") + title, "\u200E" + pts + " ⭐");
                    }
                } else if ("task_done".equals(type0) && old != null) {
                    String who = n.optString("approvedBy", "ההורים");
                    if ("approved".equals(st)) {
                        Store.celebrate(c);
                        family(c, id + ":ok:" + n.optLong("upd"), "✅ " + who + " אישר/ה: " + title, "קיבלת \u200E+" + pts + " ⭐ 🎉");
                    } else if ("rejected".equals(st)) {
                        family(c, id + ":no:" + n.optLong("upd"), "↩️ המשימה לא אושרה: " + title, "אפשר לבצע ולסמן שוב");
                    }
                }
                continue;
            }
            if (!child) {
                JSONObject author = all.optJSONObject("m_" + n.optString("dev"));
                boolean byChild = author != null && "child".equals(author.optString("role"));
                if ("log".equals(kind) && old == null) {
                    String type = n.optString("type");
                    String at = U.hhmm(n.optLong("at", now));
                    int pts = n.optInt("pts");
                    switch (type) {
                        case "woke":
                            family(c, id, "☀️ " + kid + g.apply(" קמה", " קם") + " (" + at + ")",
                                    (n.optBoolean("snoozed") ? "אחרי נודניק" : "בזמן, בלי נודניק") + " · \u200E+" + pts + " ⭐");
                            break;
                        case "wake_missed":
                            family(c, id, "⚠️ " + kid + g.apply(" לא כיבתה", " לא כיבה") + " את השעון המעורר",
                                    "השעון מצלצל כבר 10 דקות. אולי כדאי " + g.apply("להעיר אותה", "להעיר אותו"));
                            break;
                        case "left":
                            int late = n.optInt("late");
                            family(c, id, "🚪 " + kid + g.apply(" יצאה ל", " יצא ל") + title + " (" + at + ")",
                                    late > 0 ? "באיחור של " + late + " דק׳ · \u200E+" + pts + " ⭐" : "בזמן! · \u200E+" + pts + " ⭐");
                            break;
                        case "leave_missed":
                            family(c, id, "⚠️ " + kid + g.apply(" לא סימנה", " לא סימן") + " יציאה ל" + title,
                                    "עברו 10 דקות משעת היציאה");
                            break;
                        case "bonus":
                            family(c, id, "🔥 " + kid + g.apply(" השיגה ", " השיג ") + title + "!", "בונוס \u200E+" + pts + " ⭐ · שווה מילה טובה");
                            break;
                        default:
                            break;
                    }
                } else if ("redeem".equals(kind) && "pending".equals(n.optString("status"))) {
                    family(c, id + ":pending", "🎁 " + kid + " רוצה לממש פרס",
                            title + " · " + n.optInt("cost") + " ⭐ – נכנסים לאפליקציה כדי לאשר");
                } else if (byChild && old != null && "alarm".equals(kind)
                        && (n.optBoolean("del") || (old.optBoolean("on", true) && !n.optBoolean("on", true)))) {
                    family(c, id + ":off:" + n.optLong("upd"), "⏰ " + kid + (n.optBoolean("del") ? g.apply(" מחקה", " מחק") : g.apply(" כיבתה", " כיבה"))
                            + " שעון מעורר " + n.optString("time"), "כדאי לבדוק שזה בסדר");
                } else if (byChild && old == null && ("task".equals(kind) || "event".equals(kind) || "alarm".equals(kind))) {
                    String what = "task".equals(kind) ? "משימה" : "event".equals(kind) ? "חוג/יציאה" : "שעון מעורר";
                    String t = "alarm".equals(kind) ? n.optString("time") : title;
                    family(c, id + ":new", "📌 " + kid + g.apply(" הוסיפה ", " הוסיף ") + what + ": " + t,
                            "task".equals(kind) ? "אפשר לשנות לה/לו את הנקודות בלשונית לו״ז" : "נכנס ללו״ז");
                }
            } else {
                if (("task".equals(kind) || "event".equals(kind)) && old == null) {
                    family(c, id + ":new", "📌 חדש בלו״ז: " + title, "נוסף על ידי " + n.optString("by"));
                } else if ("reward".equals(kind) && old == null) {
                    family(c, id + ":new", "🎁 פרס חדש: " + title, "שווה " + n.optInt("cost") + " ⭐");
                } else if ("redeem".equals(kind) && old != null && !n.optString("status").equals(old.optString("status"))) {
                    if ("approved".equals(n.optString("status"))) {
                        Store.celebrate(c);
                        family(c, id + ":ok", "🎉 אושר! " + title, meBoy ? "תהנה!" : "תהני!");
                    } else if ("declined".equals(n.optString("status")))
                        family(c, id + ":no", "הבקשה ל" + title + " לא אושרה", meBoy ? "הנקודות חזרו אליך" : "הנקודות חזרו אלייך");
                } else if ("log".equals(kind) && "gift".equals(n.optString("type")) && old == null) {
                    int pts = n.optInt("pts");
                    if (pts > 0) Store.celebrate(c);
                    family(c, id, "💜 " + n.optString("by") + ": " + title,
                            pts > 0 ? "קיבלת \u200E+" + pts + " ⭐ בונוס" : "הודעה מההורים");
                }
            }
        }
    }
}
