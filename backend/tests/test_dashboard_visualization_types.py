from types import SimpleNamespace

from pydantic import TypeAdapter

from app.api.dashboards import _default_widget
from app.schemas.dashboards import WidgetConfigIn


def test_map_widget_schema_accepts_coordinate_encoding():
    widget = TypeAdapter(WidgetConfigIn).validate_python(
        {"type": "map", "encoding": {"x": "longitude", "y": "latitude"}}
    )

    assert widget.type == "map"
    assert widget.encoding.x == "longitude"
    assert widget.encoding.y == "latitude"


def test_legacy_map_analysis_becomes_map_widget():
    analysis = SimpleNamespace(
        chart_type="map", dimension="longitude", metric="latitude"
    )

    assert _default_widget(analysis) == {
        "type": "map",
        "legend": True,
        "tooltip": True,
        "encoding": {"x": "longitude", "y": "latitude"},
    }


def test_legacy_kpi_analysis_becomes_kpi_widget():
    analysis = SimpleNamespace(chart_type="kpi", dimension=None, metric="total")

    assert _default_widget(analysis) == {
        "type": "kpi",
        "field": "total",
        "function": "sum",
    }
