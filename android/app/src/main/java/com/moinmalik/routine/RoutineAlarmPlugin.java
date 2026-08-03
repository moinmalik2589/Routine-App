package com.moinmalik.routine;
import android.Manifest; import android.app.*; import android.content.*; import android.net.Uri; import android.os.Build; import android.provider.Settings; import com.getcapacitor.*; import com.getcapacitor.annotation.*; import org.json.JSONObject;
@CapacitorPlugin(name="RoutineAlarm", permissions={@Permission(alias="notifications", strings={Manifest.permission.POST_NOTIFICATIONS})})
public class RoutineAlarmPlugin extends Plugin {
 @PluginMethod public void permissionState(PluginCall call){ JSObject out=new JSObject(); out.put("notifications", Build.VERSION.SDK_INT<33||getPermissionState("notifications")==PermissionState.GRANTED?"granted":"prompt"); out.put("exact", Build.VERSION.SDK_INT<31||((AlarmManager)getContext().getSystemService(Context.ALARM_SERVICE)).canScheduleExactAlarms()); call.resolve(out); }
 @PluginMethod public void requestPermissions(PluginCall call){ if(Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED){ requestPermissionForAlias("notifications",call,"permissionState"); return;} if(Build.VERSION.SDK_INT>=31&&!((AlarmManager)getContext().getSystemService(Context.ALARM_SERVICE)).canScheduleExactAlarms()){ Intent i=new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:"+getContext().getPackageName())); getActivity().startActivity(i);} permissionState(call); }
 @PluginMethod public void schedule(PluginCall call){ try{ JSONObject spec=new JSONObject(call.getData().toString()); AlarmScheduler.schedule(getContext(),spec); call.resolve(); }catch(Exception e){ call.reject("Unable to schedule alarm",e); } }
 @PluginMethod public void cancel(PluginCall call){ AlarmScheduler.cancel(getContext(),call.getInt("id")); call.resolve(); }
 @PluginMethod public void cancelAll(PluginCall call){ AlarmScheduler.cancelAll(getContext()); call.resolve(); }
}
