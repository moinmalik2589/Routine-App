package com.moinmalik.routine;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity { @Override public void onCreate(android.os.Bundle state){ registerPlugin(RoutineAlarmPlugin.class); super.onCreate(state); } }
