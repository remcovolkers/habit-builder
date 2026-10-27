package io.github.remcovolkers.habitbuilder.widget;

import android.content.Context;
import android.content.Intent;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import io.github.remcovolkers.habitbuilder.R;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * De rijen van de widget: een streepje met de naam van het dagdeel, daaronder de habits en afspraken (met een vinkje) en de tellers (met min en plus).
 * Alleen weergave: een tik zet zijn sleutel in een intent die HabitWidgetProvider verwerkt. Zie docs/ANDROID-WIDGET.md.
 */
public class HabitWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    private static final int GROUP = 0;
    private static final int CHECK = 1;
    private static final int COUNTER = 2;

    /** Eén regel in de lijst, uit de momentopname gehaald. */
    private static final class Row {
        int type;
        String key;
        String title;
        String detail;
        boolean done;
    }

    private static final class Factory implements RemoteViewsFactory {
        private final Context context;
        private final List<Row> rows = new ArrayList<>();

        Factory(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            rows.clear();
            JSONObject snapshot = WidgetStore.snapshot(context);
            if (!WidgetStore.isFresh(snapshot)) return; // een lijst van een andere dag tonen we niet: de widget vraagt dan om de app te openen
            JSONArray items = snapshot.optJSONArray("items");
            if (items == null) return;
            String lastGroup = null;
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                String group = item.optString("group");
                if (!group.isEmpty() && !group.equals(lastGroup)) {
                    Row header = new Row();
                    header.type = GROUP;
                    header.title = group;
                    rows.add(header);
                    lastGroup = group;
                }
                Row row = new Row();
                row.key = item.optString("key");
                row.title = item.optString("title");
                row.done = item.optBoolean("done", false);
                if ("counter".equals(item.optString("kind"))) {
                    row.type = COUNTER;
                    row.detail = counterDetail(item);
                } else {
                    row.type = CHECK;
                }
                rows.add(row);
            }
        }

        /** "3 / 8 glazen", of "3 glazen" bij een teller zonder doel. */
        private static String counterDetail(JSONObject item) {
            int value = item.optInt("value", 0);
            String unit = item.optString("unit");
            String text = item.isNull("target") ? String.valueOf(value) : value + " / " + item.optInt("target", 0);
            return unit.isEmpty() ? text : text + " " + unit;
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
            Row row = rows.get(position);
            switch (row.type) {
                case GROUP:
                    return groupView(row);
                case COUNTER:
                    return counterView(row);
                default:
                    return checkView(row);
            }
        }

        private RemoteViews groupView(Row row) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_group);
            views.setTextViewText(R.id.group_label, row.title);
            return views;
        }

        /** De titel, doorgestreept en gedempt als de rij gedaan is. */
        private CharSequence titleText(Row row) {
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

        private RemoteViews checkView(Row row) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_item);
            views.setTextViewText(R.id.item_title, titleText(row));
            views.setTextColor(R.id.item_title, context.getColor(row.done ? R.color.widget_muted : R.color.widget_text));
            views.setImageViewResource(R.id.item_check, row.done ? R.drawable.widget_check_on : R.drawable.widget_check_off);
            views.setOnClickFillInIntent(R.id.item_root, fillIn(row.key, 0));
            return views;
        }

        private RemoteViews counterView(Row row) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_counter);
            views.setTextViewText(R.id.counter_title, titleText(row));
            views.setTextColor(R.id.counter_title, context.getColor(row.done ? R.color.widget_muted : R.color.widget_text));
            views.setTextViewText(R.id.counter_detail, row.detail);
            views.setTextColor(R.id.counter_detail, context.getColor(row.done ? R.color.widget_accent : R.color.widget_muted));
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
