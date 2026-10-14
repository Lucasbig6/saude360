from __future__ import annotations

import json
from types import SimpleNamespace

from app.ai.service import (
    HISTORY_SAMPLE_ROWS,
    slim_tool_content,
    to_chat_messages,
)


def big_rows(count: int) -> list[dict]:
    return [{"municipio": f"municipio-{i}", "total": i} for i in range(count)]


def test_execute_query_history_is_sampled_to_keep_prompt_small():
    content = json.dumps(
        {
            "columns": ["municipio", "total"],
            "rows": big_rows(100),
            "rowCount": 100,
            "truncated": False,
        }
    )

    slimmed = json.loads(slim_tool_content("execute_query", content))

    assert HISTORY_SAMPLE_ROWS == 5
    assert len(slimmed["rows"]) == 5
    assert slimmed["rowsOmitted"] == 95
    assert slimmed["columns"] == ["municipio", "total"]
    assert slimmed["rowCount"] == 100
    assert slimmed["truncated"] is False
    assert slimmed["rows"][0]["municipio"] == "municipio-0"


def test_preview_analysis_keeps_config_intact_and_samples_data():
    config = {
        "sql": "SELECT municipio, SUM(total) FROM t GROUP BY 1",
        "chartType": "bar",
        "dimension": "municipio",
        "metric": "total",
        "filters": [{"field": "uf", "operator": "=", "value": "PE"}],
    }
    content = json.dumps(
        {
            "config": config,
            "data": {
                "columns": ["municipio", "total"],
                "rows": big_rows(50),
                "rowCount": 50,
                "truncated": False,
            },
        }
    )

    payload = json.loads(slim_tool_content("preview_analysis", content))

    assert payload["config"] == config
    assert len(payload["data"]["rows"]) == 5
    assert payload["data"]["rowsOmitted"] == 45
    assert payload["data"]["rowCount"] == 50


def test_small_or_unrelated_content_is_returned_untouched():
    small = json.dumps(
        {"columns": ["a"], "rows": [{"a": 1}], "rowCount": 1}
    )
    assert slim_tool_content("execute_query", small) is small

    values = json.dumps({"values": ["PE", "AL"]})
    assert slim_tool_content("get_column_values", values) is values

    malformed = "não é json"
    assert slim_tool_content("execute_query", malformed) is malformed

    error = json.dumps({"error": "SQL inválida"})
    assert slim_tool_content("execute_query", error) is error


def test_to_chat_messages_slims_tool_rows_and_keeps_roles():
    big_content = json.dumps(
        {
            "columns": ["municipio", "total"],
            "rows": big_rows(80),
            "rowCount": 80,
            "truncated": False,
        }
    )
    rows = [
        SimpleNamespace(
            role="user", content="oi", data={}, tool_call_id=None, tool_name=None
        ),
        SimpleNamespace(
            role="assistant",
            content="Vou consultar.",
            data={
                "toolCalls": [
                    {"id": "c1", "name": "execute_query", "arguments": {"sql": "SELECT 1"}}
                ]
            },
            tool_call_id=None,
            tool_name=None,
        ),
        SimpleNamespace(
            role="tool",
            content=big_content,
            tool_name="execute_query",
            tool_call_id="c1",
            data={},
        ),
    ]

    messages = to_chat_messages(rows)

    assert [m.role for m in messages] == ["user", "assistant", "tool"]
    assert messages[0].content == "oi"
    assert messages[1].tool_calls[0].name == "execute_query"
    tool_payload = json.loads(messages[2].content)
    assert len(tool_payload["rows"]) == 5
    assert tool_payload["rowsOmitted"] == 75
    assert messages[2].tool_call_id == "c1"
