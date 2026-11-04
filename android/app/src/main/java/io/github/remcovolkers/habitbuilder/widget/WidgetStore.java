package io.github.remcovolkers.habitbuilder.widget;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * De gedeelde opslag tussen de app (de webweergave, via HabitWidgetPlugin) en de widget. Zie docs/ANDROID-WIDGET.md voor de afspraken.
 *
 * snapshot: de lijst van vandaag, als JSON-tekst (zie src/app/widget.js, buildWidgetSnapshot).
 * queue:    wat er in de widget is aangetikt en de app nog moet verwerken: [{key, date, done}] of [{key, date, delta}]. De widget is nu alleen
 *           weergave en schrijft er niets meer in; wat er nog van vóór die tijd staat, verwerkt de app bij het openen.
 *
 * Alle toegang loopt door deze klasse en is op een slot gezet: de widget (een ontvanger en een service) en de plugin draaien op verschillende threads.
 */
final class WidgetStore {
    private static final String PREFS = "habit_builder_widget";
    private static final String SNAPSHOT = "snapshot";
    private static final String QUEUE = "queue";
    private static final int COUNTER_MAX = 999;
    private static final Object LOCK = new Object();

    private WidgetStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject readSnapshot(Context context) {
        String text = prefs(context).getString(SNAPSHOT, null);
        if (text == null) return null;
        try {
            return new JSONObject(text);
        } catch (JSONException e) {
            return null;
        }
    }

    private static JSONArray readQueue(Context context) {
        String text = prefs(context).getString(QUEUE, "[]");
        try {
            return new JSONArray(text);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** De momentopname, of null als de app er nog geen heeft geschreven. */
    static JSONObject snapshot(Context context) {
        synchronized (LOCK) {
            return readSnapshot(context);
        }
    }

    /**
     * Is er iets dat nog niet gesynct is? Dat is wat in de widget is aangetikt en de app nog niet heeft verwerkt (de wachtrij), of wat de app zelf
     * nog niet bij de server heeft gebracht (het aantal in de momentopname).
     */
    static boolean isUnsynced(Context context, JSONObject snapshot) {
        synchronized (LOCK) {
            return readQueue(context).length() > 0 || (snapshot != null && snapshot.optInt("unsynced", 0) > 0);
        }
    }

    /** Is de lijst van vandaag nog van vandaag? Daarna toont de widget een verzoek om de app te openen. */
    static boolean isFresh(JSONObject snapshot) {
        return snapshot != null && snapshot.optLong("expiresAt", 0L) > System.currentTimeMillis();
    }

    /**
     * Bewaart een nieuwe momentopname van de app. Wat in de widget is aangetikt en nog niet is verwerkt, wordt er weer overheen gelegd:
     * anders springt een vinkje terug zodra de app een lijst schrijft die van vóór die tik is.
     */
    static boolean saveSnapshot(Context context, String json) {
        synchronized (LOCK) {
            try {
                JSONObject snapshot = new JSONObject(json);
                JSONArray queue = readQueue(context);
                for (int i = 0; i < queue.length(); i++) {
                    applyToSnapshot(snapshot, queue.getJSONObject(i));
                }
                prefs(context).edit().putString(SNAPSHOT, snapshot.toString()).apply();
                return true;
            } catch (JSONException e) {
                return false;
            }
        }
    }

    /** De wachtrij als JSON-tekst; daarna is hij leeg (de app verwerkt hem nu). */
    static String takeQueue(Context context) {
        synchronized (LOCK) {
            String text = readQueue(context).toString();
            prefs(context).edit().putString(QUEUE, "[]").apply();
            return text;
        }
    }

    private static JSONObject findItem(JSONObject snapshot, String key) {
        JSONArray items = snapshot.optJSONArray("items");
        if (items == null) return null;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null && key.equals(item.optString("key"))) return item;
        }
        return null;
    }

    /** Past een actie toe op de momentopname (alleen voor dezelfde dag) en telt "x van y" opnieuw. */
    private static void applyToSnapshot(JSONObject snapshot, JSONObject action) throws JSONException {
        if (!snapshot.optString("date").equals(action.optString("date"))) return;
        JSONObject item = findItem(snapshot, action.optString("key"));
        if (item == null) return;
        item.put("pending", true); // aangetikt in de widget en nog niet door de app verwerkt: de rij toont een icoontje en een dagdeel blijft staan
        if (action.has("delta")) {
            int value = Math.max(0, Math.min(COUNTER_MAX, item.optInt("value", 0) + action.optInt("delta", 0)));
            item.put("value", value);
            int target = item.isNull("target") ? 1 : item.optInt("target", 1);
            item.put("done", value > 0 && value >= target);
        } else {
            item.put("done", action.optBoolean("done", false));
        }
        recount(snapshot);
    }

    /** "x van y": de afspraken tellen niet mee, net als op Vandaag in de app. */
    private static void recount(JSONObject snapshot) throws JSONException {
        JSONArray items = snapshot.optJSONArray("items");
        if (items == null) return;
        int done = 0;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null && !"appointment".equals(item.optString("kind")) && item.optBoolean("done", false)) done++;
        }
        snapshot.put("done", done);
    }
}
