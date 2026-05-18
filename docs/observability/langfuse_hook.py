#!/usr/bin/env python3
"""
Claude Code -> Langfuse hook

"""

import json
import os
import sys
import time
import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# --- Langfuse import (fail-open) ---
try:
    from langfuse import Langfuse, propagate_attributes
except Exception:
    sys.exit(0)

# --- Paths ---
STATE_DIR = Path.home() / ".claude" / "state"
LOG_FILE = STATE_DIR / "langfuse_hook.log"
STATE_FILE = STATE_DIR / "langfuse_state.json"
LOCK_FILE = STATE_DIR / "langfuse_state.lock"

DEBUG = os.environ.get("CC_LANGFUSE_DEBUG", "").lower() == "true"
MAX_CHARS = int(os.environ.get("CC_LANGFUSE_MAX_CHARS", "20000"))


# ----------------- Logging -----------------
def _log(level: str, message: str) -> None:
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{ts} [{level}] {message}\n")
    except Exception:
        # Never block
        pass


def debug(msg: str) -> None:
    if DEBUG:
        _log("DEBUG", msg)


def info(msg: str) -> None:
    _log("INFO", msg)


def warn(msg: str) -> None:
    _log("WARN", msg)


def error(msg: str) -> None:
    _log("ERROR", msg)


# ----------------- State locking (best-effort) -----------------
class FileLock:
    def __init__(self, path: Path, timeout_s: float = 2.0):
        self.path = path
        self.timeout_s = timeout_s
        self._fh = None

    def __enter__(self):
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        self._fh = open(self.path, "a+", encoding="utf-8")
        try:
            import fcntl  # Unix only

            deadline = time.time() + self.timeout_s
            while True:
                try:
                    fcntl.flock(self._fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.time() > deadline:
                        break
                    time.sleep(0.05)
        except Exception:
            # If locking isn't available, proceed without it.
            pass
        return self

    def __exit__(self, exc_type, exc, tb):
        try:
            import fcntl

            fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
        except Exception:
            pass
        try:
            self._fh.close()
        except Exception:
            pass


def load_state() -> Dict[str, Any]:
    try:
        if not STATE_FILE.exists():
            return {}
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(state: Dict[str, Any]) -> None:
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = STATE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
        os.replace(tmp, STATE_FILE)
    except Exception as e:
        debug(f"save_state failed: {e}")


def state_key(session_id: str, transcript_path: str) -> str:
    # stable key even if session_id collides
    raw = f"{session_id}::{transcript_path}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ----------------- Hook payload -----------------
def read_hook_payload() -> Dict[str, Any]:
    """
    Claude Code hooks pass a JSON payload on stdin.
    This script tolerates missing/empty stdin by returning {}.
    """
    try:
        data = sys.stdin.read()
        if not data.strip():
            return {}
        return json.loads(data)
    except Exception:
        return {}


def extract_session_and_transcript(
    payload: Dict[str, Any],
) -> Tuple[Optional[str], Optional[Path]]:
    """
    Tries a few plausible field names; exact keys can vary across hook types/versions.
    Prefer structured values from stdin over heuristics.
    """
    session_id = (
        payload.get("sessionId")
        or payload.get("session_id")
        or payload.get("session", {}).get("id")
    )

    transcript = (
        payload.get("transcriptPath")
        or payload.get("transcript_path")
        or payload.get("transcript", {}).get("path")
    )

    if transcript:
        try:
            transcript_path = Path(transcript).expanduser().resolve()
        except Exception:
            transcript_path = None
    else:
        transcript_path = None

    return session_id, transcript_path


# ----------------- Transcript parsing helpers -----------------
def get_content(msg: Dict[str, Any]) -> Any:
    if not isinstance(msg, dict):
        return None
    if "message" in msg and isinstance(msg.get("message"), dict):
        return msg["message"].get("content")
    return msg.get("content")


def get_role(msg: Dict[str, Any]) -> Optional[str]:
    # Claude Code transcript lines commonly have type=user/assistant OR message.role
    t = msg.get("type")
    if t in ("user", "assistant"):
        return t
    m = msg.get("message")
    if isinstance(m, dict):
        r = m.get("role")
        if r in ("user", "assistant"):
            return r
    return None


def is_tool_result(msg: Dict[str, Any]) -> bool:
    role = get_role(msg)
    if role != "user":
        return False
    content = get_content(msg)
    if isinstance(content, list):
        return any(
            isinstance(x, dict) and x.get("type") == "tool_result" for x in content
        )
    return False


def iter_tool_results(content: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if isinstance(content, list):
        for x in content:
            if isinstance(x, dict) and x.get("type") == "tool_result":
                out.append(x)
    return out


def iter_tool_uses(content: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if isinstance(content, list):
        for x in content:
            if isinstance(x, dict) and x.get("type") == "tool_use":
                out.append(x)
    return out


def extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for x in content:
            if isinstance(x, dict) and x.get("type") == "text":
                parts.append(x.get("text", ""))
            elif isinstance(x, str):
                parts.append(x)
        return "\n".join([p for p in parts if p])
    return ""


def truncate_text(s: str, max_chars: int = MAX_CHARS) -> Tuple[str, Dict[str, Any]]:
    if s is None:
        return "", {"truncated": False, "orig_len": 0}
    orig_len = len(s)
    if orig_len <= max_chars:
        return s, {"truncated": False, "orig_len": orig_len}
    head = s[:max_chars]
    return head, {
        "truncated": True,
        "orig_len": orig_len,
        "kept_len": len(head),
        "sha256": hashlib.sha256(s.encode("utf-8")).hexdigest(),
    }


def get_model(msg: Dict[str, Any]) -> str:
    m = msg.get("message")
    if isinstance(m, dict):
        return m.get("model") or "claude"
    return "claude"


def get_message_id(msg: Dict[str, Any]) -> Optional[str]:
    m = msg.get("message")
    if isinstance(m, dict):
        mid = m.get("id")
        if isinstance(mid, str) and mid:
            return mid
    return None


# ----------------- Incremental reader -----------------
@dataclass
class SessionState:
    offset: int = 0
    buffer: str = ""
    turn_count: int = 0
    current_trace_id: Optional[str] = None
    current_root_span_id: Optional[str] = None
    current_trace_name: Optional[str] = None
    current_phase_span_id: Optional[str] = None
    current_phase_name: Optional[str] = None


def load_session_state(global_state: Dict[str, Any], key: str) -> SessionState:
    s = global_state.get(key, {})
    return SessionState(
        offset=int(s.get("offset", 0)),
        buffer=str(s.get("buffer", "")),
        turn_count=int(s.get("turn_count", 0)),
        current_trace_id=s.get("current_trace_id"),
        current_root_span_id=s.get("current_root_span_id"),
        current_trace_name=s.get("current_trace_name"),
        current_phase_span_id=s.get("current_phase_span_id"),
        current_phase_name=s.get("current_phase_name"),
    )


def write_session_state(
    global_state: Dict[str, Any], key: str, ss: SessionState
) -> None:
    global_state[key] = {
        "offset": ss.offset,
        "buffer": ss.buffer,
        "turn_count": ss.turn_count,
        "current_trace_id": ss.current_trace_id,
        "current_root_span_id": ss.current_root_span_id,
        "current_trace_name": ss.current_trace_name,
        "current_phase_span_id": ss.current_phase_span_id,
        "current_phase_name": ss.current_phase_name,
        "updated": datetime.now(timezone.utc).isoformat(),
    }


def _new_trace_id() -> str:
    import secrets

    return secrets.token_hex(16)


def _otel_span_id_from(obs: Any) -> Optional[str]:
    """Best-effort extraction of the OTel span_id from a LangfuseSpan."""
    for attr in ("id", "span_id", "observation_id"):
        v = getattr(obs, attr, None)
        if isinstance(v, str) and v:
            return v
    # Fall back to OTel API: get_span_context().span_id is int -> hex
    try:
        ctx = obs.get_span_context()  # type: ignore[attr-defined]
        sid = getattr(ctx, "span_id", None)
        if isinstance(sid, int):
            return format(sid, "016x")
    except Exception:
        pass
    try:
        from opentelemetry import trace as _otrace

        span = _otrace.get_current_span()
        ctx = span.get_span_context()
        sid = getattr(ctx, "span_id", 0)
        if isinstance(sid, int) and sid:
            return format(sid, "016x")
    except Exception:
        pass
    return None


def read_new_jsonl(
    transcript_path: Path, ss: SessionState
) -> Tuple[List[Dict[str, Any]], SessionState]:
    """
    Reads only new bytes since ss.offset. Keeps ss.buffer for partial last line.
    Returns parsed JSON lines (best-effort) and updated state.
    """
    if not transcript_path.exists():
        return [], ss

    try:
        with open(transcript_path, "rb") as f:
            f.seek(ss.offset)
            chunk = f.read()
            new_offset = f.tell()
    except Exception as e:
        debug(f"read_new_jsonl failed: {e}")
        return [], ss

    if not chunk:
        return [], ss

    try:
        text = chunk.decode("utf-8", errors="replace")
    except Exception:
        text = chunk.decode(errors="replace")

    combined = ss.buffer + text
    lines = combined.split("\n")
    # last element may be incomplete
    ss.buffer = lines[-1]
    ss.offset = new_offset

    msgs: List[Dict[str, Any]] = []
    for line in lines[:-1]:
        line = line.strip()
        if not line:
            continue
        try:
            msgs.append(json.loads(line))
        except Exception:
            continue

    return msgs, ss


# ----------------- Turn assembly -----------------
@dataclass
class Turn:
    user_msg: Dict[str, Any]
    assistant_msgs: List[Dict[str, Any]]
    tool_results_by_id: Dict[str, Any]


def build_turns(messages: List[Dict[str, Any]]) -> List[Turn]:
    """
    Groups incremental transcript rows into turns:
    user (non-tool-result) -> assistant messages -> (tool_result rows, possibly interleaved)
    Uses:
    - assistant message dedupe by message.id (latest row wins)
    - tool results dedupe by tool_use_id (latest wins)
    """
    turns: List[Turn] = []
    current_user: Optional[Dict[str, Any]] = None

    # assistant messages for current turn:
    assistant_order: List[str] = (
        []
    )  # message ids in order of first appearance (or synthetic)
    assistant_latest: Dict[str, Dict[str, Any]] = {}  # id -> latest msg

    tool_results_by_id: Dict[str, Any] = {}  # tool_use_id -> content

    def flush_turn():
        nonlocal current_user, assistant_order, assistant_latest, tool_results_by_id, turns
        if current_user is None:
            return
        if not assistant_latest:
            return
        assistants = [
            assistant_latest[mid] for mid in assistant_order if mid in assistant_latest
        ]
        turns.append(
            Turn(
                user_msg=current_user,
                assistant_msgs=assistants,
                tool_results_by_id=dict(tool_results_by_id),
            )
        )

    for msg in messages:
        role = get_role(msg)

        # tool_result rows show up as role=user with content blocks of type tool_result
        if is_tool_result(msg):
            for tr in iter_tool_results(get_content(msg)):
                tid = tr.get("tool_use_id")
                if tid:
                    tool_results_by_id[str(tid)] = tr.get("content")
            continue

        if role == "user":
            # new user message -> finalize previous turn
            flush_turn()

            # start a new turn
            current_user = msg
            assistant_order = []
            assistant_latest = {}
            tool_results_by_id = {}
            continue

        if role == "assistant":
            if current_user is None:
                # ignore assistant rows until we see a user message
                continue

            mid = get_message_id(msg) or f"noid:{len(assistant_order)}"
            if mid not in assistant_latest:
                assistant_order.append(mid)
            assistant_latest[mid] = msg
            continue

        # ignore unknown rows

    # flush last
    flush_turn()
    return turns


# ----------------- Langfuse emit -----------------
def _tool_calls_from_assistants(
    assistant_msgs: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    calls: List[Dict[str, Any]] = []
    for am in assistant_msgs:
        for tu in iter_tool_uses(get_content(am)):
            tid = tu.get("id") or ""
            calls.append(
                {
                    "id": str(tid),
                    "name": tu.get("name") or "unknown",
                    "input": (
                        tu.get("input")
                        if isinstance(
                            tu.get("input"), (dict, list, str, int, float, bool)
                        )
                        else {}
                    ),
                }
            )
    return calls


def emit_turn(
    langfuse: Langfuse,
    session_id: str,
    turn_num: int,
    turn: Turn,
    transcript_path: Path,
    trace_id: Optional[str] = None,
    parent_span_id: Optional[str] = None,
    trace_name_override: Optional[str] = None,
) -> None:
    user_text_raw = extract_text(get_content(turn.user_msg))
    user_text, user_text_meta = truncate_text(user_text_raw)

    last_assistant = turn.assistant_msgs[-1]
    assistant_text_raw = extract_text(get_content(last_assistant))
    assistant_text, assistant_text_meta = truncate_text(assistant_text_raw)

    model = get_model(turn.assistant_msgs[0])

    tool_calls = _tool_calls_from_assistants(turn.assistant_msgs)

    # attach tool outputs
    for c in tool_calls:
        if c["id"] and c["id"] in turn.tool_results_by_id:
            out_raw = turn.tool_results_by_id[c["id"]]
            out_str = (
                out_raw
                if isinstance(out_raw, str)
                else json.dumps(out_raw, ensure_ascii=False)
            )
            out_trunc, out_meta = truncate_text(out_str)
            c["output"] = out_trunc
            c["output_meta"] = out_meta
        else:
            c["output"] = None

    turn_trace_context: Optional[Dict[str, str]] = None
    if trace_id:
        turn_trace_context = {"trace_id": trace_id}
        if parent_span_id:
            turn_trace_context["parent_span_id"] = parent_span_id

    trace_name = trace_name_override or f"Claude Code - Turn {turn_num}"

    with propagate_attributes(
        session_id=session_id,
        trace_name=trace_name,
        tags=["claude-code"],
    ):
        with langfuse.start_as_current_observation(
            trace_context=turn_trace_context,
            name=f"Claude Code - Turn {turn_num}",
            input={"role": "user", "content": user_text},
            metadata={
                "source": "claude-code",
                "session_id": session_id,
                "turn_number": turn_num,
                "transcript_path": str(transcript_path),
                "user_text": user_text_meta,
            },
        ) as trace_span:
            # LLM generation
            with langfuse.start_as_current_observation(
                name="Claude Response",
                as_type="generation",
                model=model,
                input={"role": "user", "content": user_text},
                output={"role": "assistant", "content": assistant_text},
                metadata={
                    "assistant_text": assistant_text_meta,
                    "tool_count": len(tool_calls),
                },
            ):
                pass

            # Tool observations
            for tc in tool_calls:
                in_obj = tc["input"]
                # truncate tool input if it's a large string payload
                if isinstance(in_obj, str):
                    in_obj, in_meta = truncate_text(in_obj)
                else:
                    in_meta = None

                with langfuse.start_as_current_observation(
                    name=f"Tool: {tc['name']}",
                    as_type="tool",
                    input=in_obj,
                    metadata={
                        "tool_name": tc["name"],
                        "tool_id": tc["id"],
                        "input_meta": in_meta,
                        "output_meta": tc.get("output_meta"),
                    },
                ) as tool_obs:
                    tool_obs.update(output=tc.get("output"))

            trace_span.update(output={"role": "assistant", "content": assistant_text})


# ----------------- Event-level emission (skills, subagents, commands, hooks) -----------------
def _classify_event(payload: Dict[str, Any]) -> Tuple[str, str, Dict[str, Any]]:
    """
    Returns (kind, name, attrs) for non-transcript events.
    kind ∈ {skill, subagent, command, prompt, tool, hook, session}
    """
    event = payload.get("hook_event_name") or ""
    tool_name = payload.get("tool_name") or ""
    tool_input = payload.get("tool_input") or {}
    tool_response = payload.get("tool_response")

    if event == "UserPromptSubmit":
        prompt = payload.get("prompt") or ""
        stripped = prompt.strip()
        if stripped.startswith("/"):
            cmd = stripped.split()[0].lstrip("/")
            return "command", cmd, {"prompt": prompt[:MAX_CHARS]}
        return "prompt", "user_prompt", {"prompt": prompt[:MAX_CHARS]}

    if event in ("PreToolUse", "PostToolUse"):
        suffix = "start" if event == "PreToolUse" else "end"
        if tool_name == "Task":
            sub = tool_input.get("subagent_type") or "general-purpose"
            attrs = {
                "subagent_type": sub,
                "description": tool_input.get("description"),
                "tool_input": tool_input,
            }
            if event == "PostToolUse":
                attrs["tool_response"] = tool_response
            return "subagent", f"subagent:{sub}:{suffix}", attrs
        if tool_name == "Skill":
            skill = tool_input.get("skill") or "unknown"
            attrs = {"skill": skill, "args": tool_input.get("args"), "tool_input": tool_input}
            if event == "PostToolUse":
                attrs["tool_response"] = tool_response
            return "skill", f"skill:{skill}:{suffix}", attrs
        if tool_name == "TaskUpdate":
            status = tool_input.get("status") or ""
            # Only emit on PreToolUse (suppress PostToolUse to avoid duplicate spans).
            # Also skip updates that don't carry a status change (e.g. addBlockedBy).
            if event == "PostToolUse" or not status:
                return "", "", {}
            task_id = tool_input.get("taskId") or "?"
            subject = tool_input.get("subject") or f"task-{task_id}"
            slug = subject.lower().replace(" ", "-")[:40]
            attrs = {"tool_input": tool_input, "task_id": task_id, "status": status, "subject": subject}
            return "phase", f"phase:{slug}:{status}", attrs
        attrs = {"tool_name": tool_name, "tool_input": tool_input}
        if event == "PostToolUse":
            attrs["tool_response"] = tool_response
        return "tool", f"tool:{tool_name}:{suffix}", attrs

    if event == "SubagentStop":
        return "subagent", "subagent:stop", {"stop_hook_active": payload.get("stop_hook_active")}

    if event in ("SessionStart", "SessionEnd"):
        return "session", f"session:{event.lower().replace('session', '')}", {
            "source": payload.get("source")
        }

    return "hook", f"hook:{event or 'unknown'}", {}


def _truncate_obj(o: Any) -> Any:
    try:
        s = o if isinstance(o, str) else json.dumps(o, ensure_ascii=False, default=str)
    except Exception:
        return None
    trunc, _ = truncate_text(s)
    return trunc


def emit_event(
    langfuse: "Langfuse",
    session_id: str,
    payload: Dict[str, Any],
    trace_id: Optional[str] = None,
    parent_span_id: Optional[str] = None,
    trace_name_override: Optional[str] = None,
) -> Optional[str]:
    """
    Emit one Langfuse observation for a Claude Code hook event.
    Returns the new observation's span_id so callers can persist it as a parent
    for subsequent observations within the same trace.
    """
    kind, name, attrs = _classify_event(payload)
    if not kind:
        return None
    event_name = payload.get("hook_event_name") or "unknown"

    metadata = {
        "source": "claude-code",
        "kind": kind,
        "event": event_name,
        "session_id": session_id,
        "cwd": payload.get("cwd"),
    }
    for k, v in attrs.items():
        if k in ("tool_input", "tool_response", "prompt"):
            metadata[k] = _truncate_obj(v)
        else:
            metadata[k] = v

    trace_context: Optional[Dict[str, str]] = None
    if trace_id:
        trace_context = {"trace_id": trace_id}
        if parent_span_id:
            trace_context["parent_span_id"] = parent_span_id

    trace_name = trace_name_override or f"Claude Code - {kind}:{name}"

    new_span_id: Optional[str] = None
    with propagate_attributes(
        session_id=session_id,
        trace_name=trace_name,
        tags=["claude-code", f"kind:{kind}", f"event:{event_name}"],
    ):
        with langfuse.start_as_current_observation(
            trace_context=trace_context,
            name=name,
            input=attrs.get("tool_input") or attrs.get("prompt"),
            output=attrs.get("tool_response"),
            metadata=metadata,
        ) as obs:
            new_span_id = _otel_span_id_from(obs)
    return new_span_id


def _trace_name_for_event(payload: Dict[str, Any]) -> str:
    """Friendly trace name based on the kicking-off event."""
    event = payload.get("hook_event_name") or ""
    if event == "UserPromptSubmit":
        prompt = (payload.get("prompt") or "").strip()
        if prompt.startswith("/"):
            cmd = prompt.split()[0].lstrip("/")
            return f"Claude Code - /{cmd}"
        snippet = prompt[:60].replace("\n", " ")
        return f"Claude Code - prompt: {snippet}"
    if event in ("PreToolUse", "PostToolUse"):
        ti = payload.get("tool_input") or {}
        if payload.get("tool_name") == "Skill":
            return f"Claude Code - skill: {ti.get('skill', 'unknown')}"
        if payload.get("tool_name") == "Task":
            return f"Claude Code - subagent: {ti.get('subagent_type', 'general')}"
    return "Claude Code - turn"


# ----------------- Main -----------------
def main() -> int:
    start = time.time()
    debug("Hook started")

    if os.environ.get("TRACE_TO_LANGFUSE", "").lower() != "true":
        return 0

    public_key = os.environ.get("CC_LANGFUSE_PUBLIC_KEY") or os.environ.get(
        "LANGFUSE_PUBLIC_KEY"
    )
    secret_key = os.environ.get("CC_LANGFUSE_SECRET_KEY") or os.environ.get(
        "LANGFUSE_SECRET_KEY"
    )
    host = (
        os.environ.get("CC_LANGFUSE_BASE_URL")
        or os.environ.get("LANGFUSE_BASE_URL")
        or "https://cloud.langfuse.com"
    )

    if not public_key or not secret_key:
        return 0

    payload = read_hook_payload()
    event_name = payload.get("hook_event_name") or ""
    session_id, transcript_path = extract_session_and_transcript(payload)

    if not session_id:
        debug(f"Missing session_id in payload for event={event_name}; exiting.")
        return 0

    try:
        langfuse = Langfuse(public_key=public_key, secret_key=secret_key, host=host)
    except Exception:
        return 0

    # Non-Stop events: emit one observation, threading trace_id across the turn.
    if event_name and event_name != "Stop":
        try:
            with FileLock(LOCK_FILE):
                state = load_state()
                key = state_key(session_id, str(transcript_path or session_id))
                ss = load_session_state(state, key)

                if event_name == "UserPromptSubmit":
                    # New turn -> mint a fresh trace_id, this event is the root.
                    # Also reset phase tracking so a new command starts clean.
                    ss.current_trace_id = _new_trace_id()
                    ss.current_root_span_id = None
                    ss.current_trace_name = _trace_name_for_event(payload)
                    ss.current_phase_span_id = None
                    ss.current_phase_name = None
                    new_span = emit_event(
                        langfuse,
                        session_id,
                        payload,
                        trace_id=ss.current_trace_id,
                        parent_span_id=None,
                        trace_name_override=ss.current_trace_name,
                    )
                    if new_span:
                        ss.current_root_span_id = new_span
                else:
                    # Mid-turn event -> attach to existing trace; if none exists
                    # (e.g., hook fired before a UserPromptSubmit was captured),
                    # create one now and make this event the root.
                    if not ss.current_trace_id:
                        ss.current_trace_id = _new_trace_id()
                        ss.current_trace_name = _trace_name_for_event(payload)
                        ss.current_root_span_id = None

                    # Nest under the active phase span when one is open; otherwise
                    # fall back to the root span established by UserPromptSubmit.
                    tool_name_evt = payload.get("tool_name") or ""
                    tool_input_evt = payload.get("tool_input") or {}
                    parent = ss.current_phase_span_id or ss.current_root_span_id

                    new_span = emit_event(
                        langfuse,
                        session_id,
                        payload,
                        trace_id=ss.current_trace_id,
                        parent_span_id=parent,
                        trace_name_override=ss.current_trace_name,
                    )

                    # Phase tracking: TaskUpdate(status=in_progress) opens a new
                    # phase span. We intentionally do NOT clear it on completed —
                    # the phase span stays as parent until the next in_progress
                    # fires, so transcript turns (Stop) also nest under it.
                    if event_name == "PreToolUse" and tool_name_evt == "TaskUpdate":
                        status_evt = tool_input_evt.get("status") or ""
                        if status_evt == "in_progress" and new_span:
                            ss.current_phase_span_id = new_span
                            ss.current_phase_name = (
                                tool_input_evt.get("subject")
                                or f"task-{tool_input_evt.get('taskId', '?')}"
                            )

                    if new_span and not ss.current_root_span_id:
                        ss.current_root_span_id = new_span

                write_session_state(state, key, ss)
                save_state(state)
            try:
                langfuse.flush()
            except Exception:
                pass
            dur = time.time() - start
            info(
                f"Emitted {event_name} in {dur:.2f}s "
                f"(session={session_id} trace={ss.current_trace_id})"
            )
        except Exception as e:
            debug(f"emit_event failed: {e}")
        finally:
            try:
                langfuse.shutdown()
            except Exception:
                pass
        return 0

    # Stop event: transcript-based turn ingestion, attached to the current trace.
    if not transcript_path:
        debug("Missing transcript_path on Stop event; exiting.")
        return 0
    if not transcript_path.exists():
        debug(f"Transcript path does not exist: {transcript_path}")
        return 0

    try:
        with FileLock(LOCK_FILE):
            state = load_state()
            key = state_key(session_id, str(transcript_path))
            ss = load_session_state(state, key)

            msgs, ss = read_new_jsonl(transcript_path, ss)
            if not msgs:
                write_session_state(state, key, ss)
                save_state(state)
                return 0

            turns = build_turns(msgs)
            if not turns:
                write_session_state(state, key, ss)
                save_state(state)
                return 0

            # emit turns. The most recent turn attaches to the current trace
            # established by UserPromptSubmit / mid-turn hooks. Any older turns
            # we may be catching up on get their own ad-hoc trace ids.
            emitted = 0
            total = len(turns)
            for idx, t in enumerate(turns):
                emitted += 1
                turn_num = ss.turn_count + emitted
                is_latest = idx == total - 1
                if is_latest and ss.current_trace_id:
                    t_tid = ss.current_trace_id
                    # Nest under active phase span so transcript turns appear
                    # inside the phase that was running when Stop fired.
                    t_parent = ss.current_phase_span_id or ss.current_root_span_id
                    t_name = ss.current_trace_name
                else:
                    t_tid = _new_trace_id()
                    t_parent = None
                    t_name = None
                try:
                    emit_turn(
                        langfuse,
                        session_id,
                        turn_num,
                        t,
                        transcript_path,
                        trace_id=t_tid,
                        parent_span_id=t_parent,
                        trace_name_override=t_name,
                    )
                except Exception as e:
                    debug(f"emit_turn failed: {e}")
                    # continue emitting other turns

            ss.turn_count += emitted
            # Turn complete -> clear trace handles so the next prompt starts fresh.
            # Phase span intentionally kept: it stays as parent until the next
            # in_progress fires on the following turn.
            ss.current_trace_id = None
            ss.current_root_span_id = None
            ss.current_trace_name = None
            write_session_state(state, key, ss)
            save_state(state)

        try:
            langfuse.flush()
        except Exception:
            pass

        dur = time.time() - start
        info(f"Processed {emitted} turns in {dur:.2f}s (session={session_id})")
        return 0

    except Exception as e:
        debug(f"Unexpected failure: {e}")
        return 0

    finally:
        try:
            langfuse.shutdown()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())
