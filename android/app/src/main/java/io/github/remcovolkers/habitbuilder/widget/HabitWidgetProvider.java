package io.github.remcovolkers.habitbuilder.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;
import io.github.remcovolkers.habitbuilder.MainActivity;
import io.github.remcovolkers.habitbuilder.R;
import org.json.JSONObject;

/**
 * De widget voor het startscherm: de lijst van vandaag per dagdeel, scrollbaar, met vinkjes en bij tellers een min en een plus.
 * De rijen komen uit HabitWidgetService; een tik op een rij komt hier binnen als broadcast (ACTION_TAP).
 * Rechtsboven staat de voortgang ("2/5") en, zolang er iets nog niet gesynct is, een icoon; een tik daarop opent de app.
 * Zie docs/ANDROID-WIDGET.md.
 */
public class HabitWidgetProvider extends AppWidgetProvider {
    static final String ACTION_TAP = "io.github.remcovolkers.habitbuilder.widget.TAP";
    static final String EXTRA_KEY = "key";
    static final String EXTRA_DELTA = "delta";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            manager.updateAppWidget(id, buildViews(context, id));
        }
        manager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_list);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_TAP.equals(intent.getAction())) {
            String key = intent.getStringExtra(EXTRA_KEY);
            if (key != null) {
                WidgetStore.tap(context, key, intent.getIntExtra(EXTRA_DELTA, 0));
                refreshAll(context);
            }
            return;
        }
        super.onReceive(context, intent);
    }

    /** Tekent alle widgets van dit type opnieuw: de randen en de lijst. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, HabitWidgetProvider.class));
        if (ids.length == 0) return;
        for (int id : ids) {
            manager.updateAppWidget(id, buildViews(context, id));
        }
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    private static RemoteViews buildViews(Context context, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_habits);
        JSONObject snapshot = WidgetStore.snapshot(context);
        WidgetColors colors = new WidgetColors(context, snapshot);
        boolean fresh = WidgetStore.isFresh(snapshot);
        JSONObject labels = snapshot == null ? null : snapshot.optJSONObject("labels");
        int total = fresh ? snapshot.optInt("total", 0) : 0;

        // de achtergrond in de kleur van het thema (een witte afgeronde vorm, ingekleurd)
        views.setInt(R.id.widget_bg, "setColorFilter", colors.background);

        // rechtsboven: de voortgang, en een icoon zolang er iets niet gesynct is (in de widget aangetikt maar nog niet verwerkt, of nog niet naar de server)
        views.setViewVisibility(R.id.widget_progress, total > 0 ? View.VISIBLE : View.GONE);
        if (total > 0) {
            views.setTextViewText(R.id.widget_progress, snapshot.optInt("done", 0) + "/" + total);
            views.setTextColor(R.id.widget_progress, colors.muted);
        }
        views.setViewVisibility(R.id.widget_sync, WidgetStore.isUnsynced(context, snapshot) ? View.VISIBLE : View.GONE);
        views.setInt(R.id.widget_sync, "setColorFilter", colors.muted);

        // wat er staat als er geen rijen zijn
        String empty = context.getString(R.string.widget_open_app);
        if (labels != null) {
            if (!fresh) empty = labels.optString("stale", empty);
            else if (total == 0) empty = labels.optString("empty", empty);
            else empty = labels.optString("allDone", empty);
        }
        views.setTextViewText(R.id.widget_empty, empty);
        views.setTextColor(R.id.widget_empty, colors.muted);

        // de lijst: de rijen komen uit HabitWidgetService
        Intent service = new Intent(context, HabitWidgetService.class);
        service.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        service.setData(Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list, service);
        views.setEmptyView(R.id.widget_list, R.id.widget_empty);

        // een tik op een rij: de rij zet zijn sleutel in de intent (HabitWidgetService), de ontvanger hierboven verwerkt hem
        Intent tap = new Intent(context, HabitWidgetProvider.class);
        tap.setAction(ACTION_TAP);
        int mutable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        views.setPendingIntentTemplate(R.id.widget_list, PendingIntent.getBroadcast(context, 0, tap, PendingIntent.FLAG_UPDATE_CURRENT | mutable));

        // de voortgang rechtsboven en de lege toestand openen de app
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openApp = PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_cluster, openApp);
        views.setOnClickPendingIntent(R.id.widget_empty, openApp);
        return views;
    }
}
