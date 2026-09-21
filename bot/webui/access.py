"""Single-owner HTTPS access for a cloud deployment; local mode stays loopback-only."""
import base64
import binascii
import hmac
import os
from dataclasses import dataclass
from urllib.parse import urlparse

from fastapi.responses import JSONResponse


@dataclass(frozen=True)
class Access:
    origin: str = ''
    username: str = ''
    password: str = ''

    @classmethod
    def from_env(cls):
        origin = os.environ.get('BOT_PUBLIC_ORIGIN', '').rstrip('/')
        if not origin:
            if os.environ.get('RENDER') or os.environ.get('BOT_CLOUD') == 'true':
                raise ValueError('Cloud mode requires BOT_PUBLIC_ORIGIN and owner authentication')
            return cls()
        parsed = urlparse(origin)
        if (parsed.scheme != 'https' or not parsed.hostname or parsed.path or parsed.query
                or parsed.fragment or parsed.username or parsed.password or parsed.port not in (None, 443)):
            raise ValueError('BOT_PUBLIC_ORIGIN must be an HTTPS origin without a path')
        username = os.environ.get('BOT_ADMIN_USER', 'alex')
        password = os.environ.get('BOT_ADMIN_PASSWORD', '')
        if not username or ':' in username or len(password) < 32:
            raise ValueError('Set an owner username and BOT_ADMIN_PASSWORD with at least 32 characters')
        data = os.environ.get('BOT_DATA_DIR', '')
        if not data or not os.path.isabs(data):
            raise ValueError('Cloud mode requires an absolute BOT_DATA_DIR on persistent storage')
        return cls(origin, username, password)

    async def guard(self, request, call_next):
        host = request.headers.get('host', '').lower()
        if self.origin:
            expected = urlparse(self.origin).netloc.lower()
            if host != expected:
                return JSONResponse({'detail': '不允許此網域'}, status_code=403)
            # No account state or credentials are exposed by this liveness endpoint.
            if request.url.path == '/healthz' and request.method in ('GET', 'HEAD'):
                return await call_next(request)
            if request.url.scheme != 'https':
                return JSONResponse({'detail': '請使用 HTTPS 連線'}, status_code=403)
            authenticated = False
            try:
                scheme, token = request.headers.get('authorization', '').split(' ', 1)
                if scheme.lower() == 'basic':
                    user, password = base64.b64decode(token, validate=True).decode('utf-8').split(':', 1)
                    authenticated = hmac.compare_digest(user.encode(), self.username.encode()) & hmac.compare_digest(password.encode(), self.password.encode())
            except (ValueError, UnicodeError, binascii.Error):
                pass
            if not authenticated:
                return JSONResponse({'detail': '請登入私人工作台'}, status_code=401,
                                    headers={'WWW-Authenticate': 'Basic realm="Quant Pilot", charset="UTF-8"', 'Cache-Control': 'no-store'})
        elif host.split(':')[0] not in ('127.0.0.1', 'localhost', 'testserver'):
            return JSONResponse({'detail': '只接受本機工作台連線'}, status_code=403)
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            origin = request.headers.get('origin')
            expected_origin = self.origin or str(request.base_url).rstrip('/')
            if (origin and origin != expected_origin) or request.headers.get('sec-fetch-site') == 'cross-site':
                return JSONResponse({'detail': '跨來源操作已拒絕'}, status_code=403)
            if request.headers.get('content-type', '').split(';')[0] != 'application/json':
                return JSONResponse({'detail': '操作必須使用 JSON'}, status_code=415)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['X-Frame-Options'] = 'DENY'
        if self.origin:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000'
        return response
