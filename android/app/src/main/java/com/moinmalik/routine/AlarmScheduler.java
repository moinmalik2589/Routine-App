package com.moinmalik.routine;
import android.app.*; import android.content.*; import android.os.Build; import org.json.*; import java.util.*;
public final class AlarmScheduler { static final String PREF="routine_alarms";
 static PendingIntent pending(Context c,int id){ Intent i=new Intent(c,RoutineAlarmReceiver.class).putExtra("id",id); return PendingIntent.getBroadcast(c,id,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE); }
 static void schedule(Context c,JSONObject s)throws Exception{ int id=s.getInt("id"); c.getSharedPreferences(PREF,0).edit().putString(String.valueOf(id),s.toString()).apply(); AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE); long at=s.getLong("triggerAt"); if(Build.VERSION.SDK_INT>=31&&!am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending(c,id)); else if(Build.VERSION.SDK_INT>=23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending(c,id)); else am.setExact(AlarmManager.RTC_WAKEUP,at,pending(c,id)); }
 static void cancel(Context c,int id){ ((AlarmManager)c.getSystemService(Context.ALARM_SERVICE)).cancel(pending(c,id)); c.getSharedPreferences(PREF,0).edit().remove(String.valueOf(id)).apply(); }
 static void cancelAll(Context c){ for(String key:c.getSharedPreferences(PREF,0).getAll().keySet()) cancel(c,Integer.parseInt(key)); }
 static void rescheduleAll(Context c){ for(Object raw:c.getSharedPreferences(PREF,0).getAll().values()) try{ JSONObject s=new JSONObject(String.valueOf(raw)); if(s.getLong("triggerAt")>System.currentTimeMillis()) schedule(c,s); }catch(Exception ignored){} }
}
