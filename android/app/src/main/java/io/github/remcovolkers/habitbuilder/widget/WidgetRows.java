package io.github.remcovolkers.habitbuilder.widget;

import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Wat de widget laat zien, uit de momentopname gehaald: per dagdeel een streepje met de naam, daaronder de rijen. Het eerste streepje is de bovenkant van
 * de widget (er is geen aparte kop). Een dagdeel waarvan alles gedaan is, vervalt, behalve zolang er in de widget nog iets is aangetikt dat de app niet
 * heeft verwerkt: dan blijft het staan, zodat je het vinkje ziet en kunt terugdraaien.
 */
final class WidgetRows {
    static final int GROUP = 0;
    static final int CHECK = 1;
    static final int COUNTER = 2;

    private WidgetRows() {}

    /** Eén regel in de lijst. */
    static final class Row {
        int type;
        String key;
        String title;
        String detail;
        boolean done;
        boolean pending;
        boolean first;
    }

    /** De rijen van de lijst van vandaag; leeg als de lijst van een andere dag is of er niets (meer) te doen is. */
    static List<Row> build(JSONObject snapshot) {
        List<Row> rows = new ArrayList<>();
        if (!WidgetStore.isFresh(snapshot)) return rows;
        JSONArray items = snapshot.optJSONArray("items");
        if (items == null) return rows;

        // opeenvolgende items met dezelfde dagdeelnaam horen bij één streepje
        List<String> names = new ArrayList<>();
        List<List<JSONObject>> groups = new ArrayList<>();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            String name = item.optString("group");
            if (groups.isEmpty() || !name.equals(names.get(names.size() - 1))) {
                names.add(name);
                groups.add(new ArrayList<JSONObject>());
            }
            groups.get(groups.size() - 1).add(item);
        }

        for (int g = 0; g < groups.size(); g++) {
            List<JSONObject> group = groups.get(g);
            boolean finished = true;
            for (JSONObject item : group) {
                if (!item.optBoolean("done", false) || item.optBoolean("pending", false)) finished = false;
            }
            if (finished) continue;

            if (!names.get(g).isEmpty()) {
                Row header = new Row();
                header.type = GROUP;
                header.title = names.get(g);
                rows.add(header);
            }
            for (JSONObject item : group) {
                Row row = new Row();
                row.key = item.optString("key");
                row.title = item.optString("title");
                row.done = item.optBoolean("done", false);
                row.pending = item.optBoolean("pending", false);
                if ("counter".equals(item.optString("kind"))) {
                    row.type = COUNTER;
                    row.detail = counterDetail(item);
                } else {
                    row.type = CHECK;
                }
                rows.add(row);
            }
        }
        if (!rows.isEmpty()) rows.get(0).first = true;
        return rows;
    }

    /** "3 / 8 glazen", of "3 glazen" bij een teller zonder doel. */
    private static String counterDetail(JSONObject item) {
        int value = item.optInt("value", 0);
        String unit = item.optString("unit");
        String text = item.isNull("target") ? String.valueOf(value) : value + " / " + item.optInt("target", 0);
        return unit.isEmpty() ? text : text + " " + unit;
    }
}
