package io.github.remcovolkers.habitbuilder.widget;

import android.content.Context;
import android.content.Intent;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import io.github.remcovolkers.habitbuilder.R;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/**
 * De rijen van de widget (welke, zie WidgetRows): een streepje met de naam van het dagdeel, daaronder de habits en afspraken (met een vinkje) en de
 * tellers (met min en plus). Alleen weergave: een tik zet zijn sleutel in een intent die HabitWidgetProvider verwerkt. Zie docs/ANDROID-WIDGET.md.
 */
public class HabitWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    private static final class Factory implements RemoteViewsFactory {
        private final Context context;
        private final List<WidgetRows.Row> rows = new ArrayList<>();
        private WidgetColors colors;

        Factory(Context context) {
            this.context = context;
            this.colors = new WidgetColors(context, null);
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            JSONObject snapshot = WidgetStore.snapshot(context);
            colors = new WidgetColors(context, snapshot);
            rows.clear();
            rows.addAll(WidgetRows.build(snapshot));
        }

        @Override
        public void onDestroy() {
            rows.clear();
        }

        @Override
        public int getCount() {
            return rows.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= rows.size()) return null;
            WidgetRows.Row row = rows.get(position);
            switch (row.type) {
                case WidgetRows.GROUP:
                    return groupView(row);
                case WidgetRows.COUNTER:
                    return counterView(row);
                default:
                    return checkView(row);
            }
        }

        private int dp(int value) {
            return (int) (value * context.getResources().getDisplayMetrics().density + 0.5f);
        }

        /** Een rij kan hergebruikt worden voor een andere inhoud: alles wat per rij verschilt wordt daarom elke keer gezet. */
        private RemoteViews groupView(WidgetRows.Row row) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_group);
            views.setTextViewText(R.id.group_label, row.title);
            views.setTextColor(R.id.group_label, colors.muted);
            views.setInt(R.id.group_line, "setBackgroundColor", colors.hairline);
            // de bovenste rij is de bovenkant van de widget: rechts blijft ruimte voor de voortgang en het icoon van "niet gesynct"
            if (row.first) {
                views.setViewPadding(R.id.group_root, dp(8), dp(4), dp(72), dp(2));
            } else {
                views.setViewPadding(R.id.group_root, dp(8), dp(12), dp(8), dp(2));
            }
            return views;
        }

        /** De titel, doorgestreept als de rij gedaan is. */
        private CharSequence titleText(WidgetRows.Row row) {
            SpannableString text = new SpannableString(row.title);
            if (row.done) text.setSpan(new StrikethroughSpan(), 0, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            return text;
        }

        private Intent fillIn(String key, int delta) {
            Intent fill = new Intent();
            fill.putExtra(HabitWidgetProvider.EXTRA_KEY, key);
            fill.putExtra(HabitWidgetProvider.EXTRA_DELTA, delta);
            return fill;
        }

        private RemoteViews checkView(WidgetRows.Row row) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_item);
            views.setTextViewText(R.id.item_title, titleText(row));
            views.setTextColor(R.id.item_title, row.done ? colors.muted : colors.text);
            views.setImageViewResource(R.id.item_circle, row.done ? R.drawable.widget_circle_fill : R.drawable.widget_circle_ring);
            views.setInt(R.id.item_circle, "setColorFilter", row.done ? colors.accent : colors.muted);
            views.setInt(R.id.item_tick, "setColorFilter", colors.onAccent);
            views.setViewVisibility(R.id.item_tick, row.done ? View.VISIBLE : View.GONE);
            views.setViewVisibility(R.id.item_pending, row.pending ? View.VISIBLE : View.GONE);
            views.setInt(R.id.item_pending, "setColorFilter", colors.muted);
            views.setOnClickFillInIntent(R.id.item_root, fillIn(row.key, 0));
            return views;
        }

        private RemoteViews counterView(WidgetRows.Row row) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_counter);
            views.setTextViewText(R.id.counter_title, titleText(row));
            views.setTextColor(R.id.counter_title, row.done ? colors.muted : colors.text);
            views.setTextViewText(R.id.counter_detail, row.detail);
            views.setTextColor(R.id.counter_detail, row.done ? colors.accent : colors.muted);
            views.setTextColor(R.id.counter_minus, colors.text);
            views.setTextColor(R.id.counter_plus, colors.accent);
            views.setViewVisibility(R.id.counter_pending, row.pending ? View.VISIBLE : View.GONE);
            views.setInt(R.id.counter_pending, "setColorFilter", colors.muted);
            views.setOnClickFillInIntent(R.id.counter_minus, fillIn(row.key, -1));
            views.setOnClickFillInIntent(R.id.counter_plus, fillIn(row.key, 1));
            return views;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 3;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }
    }
}
