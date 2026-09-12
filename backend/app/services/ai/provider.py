"""
Provider-agnostic AI interface. Every AI-backed feature (extraction, timeline
reasoning, contradiction detection, guidance, autopsy cross-check) calls
`get_ai_provider()` rather than importing a vendor SDK directly, so the
backing model/vendor can be swapped by changing AI_PROVIDER in .env without
touching any service code. Currently supports "groq" (default) and
"anthropic" — add another branch in get_ai_provider() for any other vendor.
"""
import json
from abc import ABC, abstractmethod
from functools import lru_cache

from app.config import get_settings

settings = get_settings()


class AIProvider(ABC):
    @abstractmethod
    def extract(self, *, system_prompt: str, user_content: str) -> dict:
        """Structured extraction — the caller's system_prompt must instruct JSON-only output."""

    @abstractmethod
    def reason(self, *, system_prompt: str, user_content: str) -> dict:
        """Grounded reasoning over retrieved context — same JSON-only contract as extract()."""


class AIProviderError(Exception):
    pass


def _parse_json_response(raw_text: str) -> dict:
    """
    Every system prompt in this app instructs JSON-only output, but fences
    are stripped defensively in case a model wraps the response in ```json
    anyway (some open-weight models do this more often than Claude did).
    """
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise AIProviderError(f"Model did not return valid JSON: {exc}\nRaw response: {raw_text[:500]}") from exc


class GroqProvider(AIProvider):
    """
    GroqCloud — OpenAI-compatible chat completions API, used here for its
    fast inference. Default model is openai/gpt-oss-120b since Groq
    deprecated its earlier Llama 3.x chat models in 2026; override via
    GROQ_MODEL in .env if you prefer a different hosted model
    (see https://console.groq.com/docs/models for the current list).
    """

    def __init__(self) -> None:
        if not settings.groq_api_key:
            raise AIProviderError(
                "GROQ_API_KEY is not set. Set it in .env to enable AI extraction/reasoning, "
                "or the evidence pipeline will log evidence without AI processing."
            )
        from groq import Groq  # imported lazily so the package is only required when actually used

        self._client = Groq(api_key=settings.groq_api_key)
        self._model = settings.groq_model

    def _call(self, *, system_prompt: str, user_content: str) -> dict:
        response = self._client.chat.completions.create(
            model=self._model,
            max_tokens=2000,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        )
        return _parse_json_response(response.choices[0].message.content or "")

    def extract(self, *, system_prompt: str, user_content: str) -> dict:
        return self._call(system_prompt=system_prompt, user_content=user_content)

    def reason(self, *, system_prompt: str, user_content: str) -> dict:
        return self._call(system_prompt=system_prompt, user_content=user_content)


class AnthropicProvider(AIProvider):
    def __init__(self) -> None:
        if not settings.anthropic_api_key:
            raise AIProviderError(
                "ANTHROPIC_API_KEY is not set. Set it in .env to enable AI extraction/reasoning, "
                "or the evidence pipeline will log evidence without AI processing."
            )
        from anthropic import Anthropic  # imported lazily so the package is only required when actually used

        self._client = Anthropic(api_key=settings.anthropic_api_key)
        self._model = settings.anthropic_model

    def _call(self, *, system_prompt: str, user_content: str) -> dict:
        response = self._client.messages.create(
            model=self._model,
            max_tokens=2000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        text_blocks = [block.text for block in response.content if block.type == "text"]
        return _parse_json_response("".join(text_blocks))

    def extract(self, *, system_prompt: str, user_content: str) -> dict:
        return self._call(system_prompt=system_prompt, user_content=user_content)

    def reason(self, *, system_prompt: str, user_content: str) -> dict:
        return self._call(system_prompt=system_prompt, user_content=user_content)


@lru_cache
def get_ai_provider() -> AIProvider:
    if settings.ai_provider == "groq":
        return GroqProvider()
    if settings.ai_provider == "anthropic":
        return AnthropicProvider()
    raise AIProviderError(f"Unknown AI_PROVIDER '{settings.ai_provider}'")