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


def test_custom_html_widget_schema_accepts_html_css_extras():
    """Etapa A: o discriminador aceita `custom-html` (sem 422 no PUT)."""
    widget = TypeAdapter(WidgetConfigIn).validate_python(
        {
            "type": "custom-html",
            "title": "Aviso",
            "html": "<div>Manutenção</div>",
            "css": ".x { color: #111; }",
        }
    )

    assert widget.type == "custom-html"
    dumped = widget.model_dump(mode="json", exclude_none=True)
    assert dumped["html"] == "<div>Manutenção</div>"
    assert dumped["css"] == ".x { color: #111; }"
