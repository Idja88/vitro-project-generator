class PrefixMiddleware:
    """Middleware для обработки префикса URL в production среде."""
    
    def __init__(self, app, prefix=''):
        self.app = app
        self.prefix = prefix

    def __call__(self, environ, start_response):
        # Проверяем, начинается ли путь с префикса
        if environ['PATH_INFO'].startswith(self.prefix):
            # Убираем префикс из PATH_INFO
            environ['PATH_INFO'] = environ['PATH_INFO'][len(self.prefix):]
            # Устанавливаем SCRIPT_NAME для генерации URL с префиксом
            environ['SCRIPT_NAME'] = self.prefix
            return self.app(environ, start_response)
        else:
            start_response('404', [('Content-Type', 'text/plain')])
            return [b"This URL does not belong to the app."]