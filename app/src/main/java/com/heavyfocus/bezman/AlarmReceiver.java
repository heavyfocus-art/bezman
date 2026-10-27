package com.heavyfocus.bezman;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    public static final String FIRE = "com.heavyfocus.bezman.FIRE";
    public static final String RING = "com.heavyfocus.bezman.RING";
    public static final String ACT = "com.heavyfocus.bezman.ACT";

    @Override
    public void onReceive(Context context, Intent intent) {
        final Context c = context.getApplicationContext();
        final String a = intent.getAction() == null ? "" : intent.getAction();
        final PendingResult pr = goAsync();
        final Intent in = intent;
        new Thread(() -> {
            try {
                if (FIRE.equals(a)) {
                    Sched.process(c);
                } else if (RING.equals(a)) {
                    String id = in.getStringExtra("id"), occ = in.getStringExtra("occ"), label = in.getStringExtra("label");
                    if (!in.hasExtra("at")) {
                        // snooze or the test button: just ring
                        AlarmService.start(c, id, occ, label);
                    } else {
                        // the scheduled wake-up alarm: ring first (while Android allows it), then the rest
                        if (Sched.stillDue(c, id, occ) && Sched.claim(c, id, occ)) Sched.ring(c, id, occ, label);
                        Sched.process(c);
                    }
                } else if (ACT.equals(a)) {
                    String what = in.getStringExtra("what");
                    String id = in.getStringExtra("ref");
                    String occ = in.getStringExtra("occ");
                    String key = in.getStringExtra("key");
                    int pts = -1;
                    Notify.cancel(c, key);
                    if ("left".equals(what)) {
                        pts = Store.left(c, id, occ);
                        if (pts > 0) Notify.praise(c, key, pts, "יצאת! 🚀");
                    } else if ("task".equals(what)) {
                        pts = Store.taskDone(c, id, occ, false);
                        if (pts > 0) Notify.sent(c, key);
                    } else if ("approve".equals(what) || "reject".equals(what)) {
                        Store.approve(c, id, "approve".equals(what));
                    }
                    Sync.flush(c);
                } else {
                    // boot, app update, time change
                    Sched.reschedule(c);
                    SyncJob.schedule(c);
                    LiveService.start(c);
                }
            } catch (Exception ignored) {
            } finally {
                pr.finish();
            }
        }).start();
    }
}
