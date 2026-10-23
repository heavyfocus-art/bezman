package com.heavyfocus.bezman;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/** Checks for family updates about every 15 minutes, even when the app is closed. */
public class SyncJob extends JobService {
    static final int JOB_ID = 77;

    public static void schedule(Context c) {
        try {
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js.getPendingJob(JOB_ID) != null) return;
            JobInfo ji = new JobInfo.Builder(JOB_ID, new ComponentName(c, SyncJob.class))
                    .setPeriodic(15 * U.MIN)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPersisted(true)
                    .build();
            js.schedule(ji);
        } catch (Exception ignored) {
        }
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        final Context c = getApplicationContext();
        new Thread(() -> {
            try {
                Sync.syncNow(c);
                Sched.reschedule(c);
            } catch (Exception ignored) {
            }
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
