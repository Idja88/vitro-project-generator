"""Tier 3: PrefixMiddleware — чистый WSGI, без Flask."""

from vitro_generator.middleware import PrefixMiddleware


def make_inner(seen):
    def inner(environ, start_response):
        seen.update(environ)
        start_response("200 OK", [("Content-Type", "text/plain")])
        return [b"ok"]

    return inner


def test_prefix_is_stripped_and_script_name_set():
    seen, statuses = {}, []
    middleware = PrefixMiddleware(make_inner(seen), prefix="/generator")

    body = middleware({"PATH_INFO": "/generator/get/marks"}, lambda status, headers: statuses.append(status))

    assert body == [b"ok"]
    assert statuses == ["200 OK"]
    assert seen["PATH_INFO"] == "/get/marks"
    assert seen["SCRIPT_NAME"] == "/generator"


def test_path_outside_prefix_gets_valid_wsgi_404():
    seen, calls = {}, []
    middleware = PrefixMiddleware(make_inner(seen), prefix="/generator")

    body = middleware({"PATH_INFO": "/other"}, lambda status, headers: calls.append((status, headers)))

    assert seen == {}, "внутреннее приложение не должно вызываться"
    assert calls == [("404 Not Found", [("Content-Type", "text/plain")])]
    assert body == [b"This URL does not belong to the app."]


def test_empty_prefix_passes_everything_through():
    seen = {}
    middleware = PrefixMiddleware(make_inner(seen), prefix="")

    middleware({"PATH_INFO": "/anything"}, lambda status, headers: None)

    assert seen["PATH_INFO"] == "/anything"
    assert seen["SCRIPT_NAME"] == ""
