"""Request-scoped application messages; user data is never translated."""
from contextlib import contextmanager
from contextvars import ContextVar
from functools import lru_cache
import json
from pathlib import Path

LANGUAGES = ('en', 'kk', 'ko', 'zh-CN')
_language = ContextVar('residual_language', default='en')

def normalize_language(value):
    value = str(value or '').split(',')[0].split(';')[0].strip().lower()
    return {'en':'en', 'en-us':'en', 'en-gb':'en', 'kk':'kk', 'kk-kz':'kk',
            'ko':'ko', 'ko-kr':'ko', 'zh':'zh-CN', 'zh-cn':'zh-CN', 'zh-hans':'zh-CN'}.get(value, 'en')

def get_language():
    return _language.get()

def reason_language():
    name = {'en':'English', 'kk':'Kazakh', 'ko':'Korean', 'zh-CN':'Simplified Chinese'}[get_language()]
    return ('\nWrite reason in ' + name + ' as one short sentence (at most 25 words). '
            'All other keys and string values must use the exact schema identifiers: '
            'never translate status values, operation names, column IDs or none.\n')

@contextmanager
def using_language(value):
    token = _language.set(normalize_language(value))
    try:
        yield
    finally:
        _language.reset(token)

@lru_cache(maxsize=4)
def catalogue(language):
    return json.loads(Path(__file__).with_name('locales').joinpath(language + '.json').read_text(encoding='utf-8'))

def tr(message):
    return catalogue(get_language()).get(message, message)

def translate_owned(value):
    """Only for application-owned catalogues, never imported rows or metadata."""
    if isinstance(value, str):
        return tr(value)
    if isinstance(value, dict):
        return {key: translate_owned(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [translate_owned(item) for item in value]
    return value
