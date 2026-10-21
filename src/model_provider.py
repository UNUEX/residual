"""Small, explicit model transport. Keys stay in memory; redirects are forbidden."""
from __future__ import annotations

from .localization import tr


import ipaddress
import json
import re
import socket
from urllib import error, parse, request


class ProviderError(ValueError):
    pass


DEFAULT_CONFIG = {"provider": "ollama", "base_url": "http://127.0.0.1:11434",
                  "model": "qwen3:1.7b", "allow_external": False}
MAX_RESPONSE = 1024 * 1024
MIN_LOCAL_SOURCE_VERSION = (0, 40, 3)


def ollama_local_ref(model):
    """Mirror v0.40.3 source suffixes; force the server's local-only route.

    https://github.com/ollama/ollama/blob/v0.40.3/internal/modelref/modelref.go
    A remote manifest can have any alias: suffix checks alone are not sufficient.
    """
    def source_suffix(value):
        base, separator, suffix = value.rpartition(":")
        suffix = suffix.strip().casefold()
        if separator and (suffix == "cloud" or ("/" not in suffix and suffix.endswith("-cloud"))):
            return base, "cloud"
        if separator and suffix == "local":
            return base, "local"
        return value, None

    base, source = source_suffix(model.strip())
    if source == "cloud":
        raise ProviderError(tr('Cloud models are blocked in local Ollama mode. For an external model, configure HTTPS and explicitly allow sending the question.'))
    if source == "local" and source_suffix(base)[1] is not None:
        raise ProviderError(tr('Use one model source; :local and :cloud cannot be combined.'))
    if not base.strip():
        raise ProviderError(tr('Enter a local model name before :local.'))
    return base.strip() + ":local"


def has_remote_metadata(item):
    return any(item.get(field) not in (None, "") for field in ("remote_host", "remote_model"))


def validate_config(value):
    if not isinstance(value, dict):
        raise ProviderError(tr('Model settings must be an object.'))
    provider = value.get("provider", "ollama")
    if provider not in {"ollama", "openai_compatible"}:
        raise ProviderError(tr('Ollama and OpenAI-compatible APIs are supported.'))
    base = value.get("base_url", "")
    model = value.get("model", "")
    if not isinstance(base, str) or not isinstance(model, str) or not model.strip() or len(model) > 200:
        raise ProviderError(tr('Enter the server URL and model name.'))
    url = parse.urlsplit(base.strip())
    try:
        port = url.port
    except ValueError:
        raise ProviderError(tr('Invalid model-server port.')) from None
    if (url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password
            or url.query or url.fragment or any(ord(c) < 33 for c in base)):
        raise ProviderError(tr('Use an HTTP(S) URL without credentials, query parameters or a fragment.'))
    host = url.hostname.lower()
    try:
        local = ipaddress.ip_address(host).is_loopback
    except ValueError:
        local = host == "localhost"
    allow = value.get("allow_external", False)
    if type(allow) is not bool:
        raise ProviderError(tr('External-server permission must be explicit.'))
    if not local and (not allow or url.scheme != "https"):
        raise ProviderError(tr('A remote server requires HTTPS and explicit permission to send the question.'))
    if provider == "ollama" and not local:
        raise ProviderError(tr('Ollama connects only on this computer. Use a compatible API for your own HTTPS server.'))
    if provider == "ollama":
        ollama_local_ref(model)
    return {"provider": provider, "base_url": base.strip().rstrip("/"),
            "model": model.strip(), "allow_external": allow, "is_local": local}


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ProviderError(tr('The model server redirected the request. Use its final URL; redirects are blocked.'))


class ModelProvider:
    def __init__(self, config=None, api_key=""):
        self.config = validate_config(config or DEFAULT_CONFIG)
        if not isinstance(api_key, str) or len(api_key) > 4096 or "\n" in api_key or "\r" in api_key:
            raise ProviderError(tr('Invalid API key.'))
        self._api_key = api_key

    def public_config(self):
        return {**self.config, "api_key_set": bool(self._api_key),
                "data_policy": tr('The model receives only your question and allowed operations, not table rows or results. The question may still contain sensitive information.'),
                "automatic_fallback": False}

    def _request(self, endpoint, body=None, timeout=120):
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self._api_key:
            headers["Authorization"] = "Bearer " + self._api_key
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = request.Request(self.config["base_url"] + endpoint, data=data, headers=headers)
        # Disable environment proxies, including for loopback, so the chosen endpoint is exact.
        opener = request.build_opener(request.ProxyHandler({}), NoRedirect())
        try:
            with opener.open(req, timeout=timeout) as response:
                raw = response.read(MAX_RESPONSE + 1)
            if len(raw) > MAX_RESPONSE:
                raise ProviderError(tr('The model response is too large.'))
            result = json.loads(raw.decode("utf-8"))
            if not isinstance(result, dict):
                raise ProviderError(tr('Unrecognized model-server response format.'))
            return result
        except ProviderError:
            raise
        except error.HTTPError as exc:
            messages = {401: tr('The server rejected the API key.'), 403: tr('The server denied model access.'),
                        404: tr('Model or API URL not found. Check the model name and server URL.'),
                        429: tr('Model-server rate limit reached. Try again later.')}
            raise ProviderError(messages.get(exc.code, tr('Model-server HTTP error ') + str(exc.code) + ".")) from None
        except (socket.timeout, TimeoutError):
            raise ProviderError(tr('No model response within 120 seconds. Try a smaller model or retry.')) from None
        except (error.URLError, OSError):
            raise ProviderError(tr('Cannot connect to the model. Start Ollama or check the server URL.')) from None
        except (ValueError, UnicodeError):
            raise ProviderError(tr('The model server returned invalid JSON.')) from None

    def probe(self):
        ollama = self.config["provider"] == "ollama"
        result = self._request("/api/tags" if ollama else "/models", timeout=15)
        items = result.get("models" if ollama else "data", [])
        models = []
        if isinstance(items, list):
            for item in items[:1000]:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name" if ollama else "id", ""))[:200]
                if ollama:
                    if has_remote_metadata(item):
                        continue
                    try:
                        ollama_local_ref(name)
                    except ProviderError:
                        continue
                if name:
                    models.append(name)
        selected = self.config["model"]
        if ollama:
            try:
                self._ollama_local_model(items)
            except ProviderError as exc:
                return {"ok": False, "models": models, "selected_model": selected,
                        "local_inference_verified": False, "message": str(exc)}
            return {"ok": True, "models": models, "selected_model": selected,
                    "local_inference_verified": True,
                    "message": tr('Local model available. Requests are forced to use :local.')}
        found = selected in models or (ollama and selected + ":latest" in models)
        return {"ok": found, "models": models, "selected_model": selected,
                "message": tr('Model available.') if found else tr('Server reachable, but the model was not found. Select an available model or download it in Ollama.')}

    def _ollama_local_model(self, items=None):
        """Verify before sending the question; never retry without :local."""
        local_ref = ollama_local_ref(self.config["model"])
        version = self._request("/api/version", timeout=15).get("version", "")
        match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)(?:[-+].*)?", str(version))
        if not match or tuple(map(int, match.groups())) < MIN_LOCAL_SOURCE_VERSION:
            raise ProviderError(tr('Forced local execution requires Ollama 0.40.3 or later. Update Ollama; no question was sent.'))
        if items is None:
            items = self._request("/api/tags", timeout=15).get("models")
        if not isinstance(items, list):
            raise ProviderError(tr('Ollama did not return installed models. Local execution is unverified; no question was sent.'))
        # Names in /api/tags use the canonical display name. /api/show with :local
        # also resolves full names and aliases that are not byte-identical here.
        selected = local_ref.removesuffix(":local").casefold()
        names = {selected, selected + ":latest"}
        for item in items:
            if isinstance(item, dict) and names.intersection(
                    str(item.get(key, "")).casefold() for key in ("name", "model")):
                if has_remote_metadata(item):
                    raise ProviderError(tr('The selected Ollama name points to a remote model. No question was sent in local mode.'))
        try:
            info = self._request("/api/show", {"model": local_ref}, timeout=15)
        except ProviderError as exc:
            raise ProviderError(tr('Local model not confirmed. Finish downloading and check the name; Ollama 0.40.3 or later is required. ') + str(exc)) from None
        if has_remote_metadata(info):
            raise ProviderError(tr('Ollama metadata identifies a remote model. No question was sent in local mode.'))
        if not isinstance(info.get("details"), dict) or not isinstance(info.get("model_info"), dict):
            raise ProviderError(tr('Ollama returned incomplete model metadata. Local execution is unverified; no question was sent.'))
        return local_ref

    def propose(self, question, system_prompt, schema):
        messages = [{"role": "system", "content": system_prompt},
                    {"role": "user", "content": question}]
        body = {"model": self.config["model"], "messages": messages, "stream": False}
        if self.config["provider"] == "ollama":
            body["model"] = self._ollama_local_model()
            body.update({"format": schema, "think": False,
                         "options": {"temperature": 0, "num_predict": 600, "num_ctx": 4096}})
            result = self._request("/api/chat", body)
            if has_remote_metadata(result):
                raise ProviderError(tr('The server reported remote execution in local mode. The response is discarded; check Ollama.'))
            message = result.get("message")
            if not isinstance(message, dict):
                raise ProviderError(tr('The model returned no planning message.'))
            content = message.get("content", "")
        else:
            body.update({"temperature": 0, "max_tokens": 800,
                         "response_format": {"type": "json_schema", "json_schema": {
                             "name": "research_plan", "strict": True, "schema": schema}}})
            result = self._request("/chat/completions", body)
            try:
                content = result["choices"][0]["message"]["content"]
            except (KeyError, TypeError, IndexError):
                raise ProviderError(tr('No plan text returned. The API must support structured outputs.')) from None
        if not isinstance(content, str):
            raise ProviderError(tr('The model did not return a JSON plan.'))
        try:
            return json.loads(content)
        except (ValueError, TypeError):
            raise ProviderError(tr('The model returned an invalid plan. No calculation ran; clarify the question.')) from None
