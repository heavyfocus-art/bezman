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
                    AlarmService.start(c, in.getStringExtra("id"), in.getStringExtra("occ"), in.getStringExtra("label"));
                } else if (ACT.equals(a)) {
                    String what = in.getStringExtra("what");
                    String id = in.getStringExtra("ref");
                    String occ = in.getStringExtra("occ");
                    String key = in.getStringExtra("key");
                    int pts = -1;
                    if ("left".equals(what)) pts = Store.left(c, id, occ);
                    else if ("task".equals(what)) pts = Store.taskDone(c, id, occ);
                    Notify.cancel(c, key);
                    if (pts > 0) Notify.praise(c, key, pts, "left".equals(what) ? "יצאת! 🚀" : "סיימת! 💪");
                    Sync.flush(c);
                } else {
                    // boot, app update, time change
                    Sched.reschedule(c);
                    SyncJob.schedule(c);
                }
            } catch (Exception ignored) {
            } finally {
                pr.finish();
            }
        }).start();
    }
}
