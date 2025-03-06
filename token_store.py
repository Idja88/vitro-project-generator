from datetime import datetime
import pytz

class GlobalToken:
    token = None
    expires = None

    @classmethod
    def set_token(cls, token_data):
        if token_data:
            cls.token = token_data.get('token')
            cls.expires = token_data.get('expires')

    @classmethod
    def is_valid(cls):
        if not cls.token or not cls.expires:
            return False
        try:
            expires = datetime.strptime(cls.expires[:26] + 'Z', "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=pytz.UTC)
            now = datetime.now(pytz.UTC)
            return (expires - now).total_seconds() > 300
        except ValueError:
            return False