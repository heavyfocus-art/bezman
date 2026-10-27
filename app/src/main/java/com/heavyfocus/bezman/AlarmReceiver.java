package com.heavyfocus.bezman;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    public static final String FIRE = "com.heavyfocus.bezman.FIRE";
    public static final String RING = "com.heavyfocus.bezman.RING";
    public static final String ACT = "com.heavyfocus.bezman.ACT";
    public static final String SYNC = "com.heavyfocus.bezman.SYNC";

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
                        long at = in.getLongExtra("at", 0);
                        if (Sched.stillDue(c, id, occ, at) && Sched.claim(c, id, occ, at)) Sched.ring(c, id, occ, label);
                        Sched.process(c);
                    }
                } else if (SYNC.equals(a)) {
                    // the 15-minute check on the child's phone: bring the live connection back
                    // (Android allows it from here) and fetch what the parents changed
                    Store.setLong(c, "nextSyncAt", 0);
                    LiveService.start(c);
                    Sync.syncNow(c);
                    Sched.reschedule(c);
                    Widgets.updateAll(c);
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
                    // boot, app update, time change: Android forgot our wake-ups, set them again
                    Store.setLong(c, "nextSyncAt", 0);
                    Sched.reschedule(c);
                    SyncJob.schedule(c);
                    LiveService.start(c);
                    Widgets.updateAll(c);
                }
            } catch (Exception ignored) {
            } finally {
                pr.finish();
            }
        }).start();
    }
}
