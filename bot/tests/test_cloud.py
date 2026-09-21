import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from webui.access import Access
from webui.autopilot_server import create_autopilot_app


class CloudAccessTests(unittest.TestCase):
    def setUp(self):
        self.access = Access('https://pilot.example.com', 'alex', 'test-password-' * 4)
        self.app = create_autopilot_app(access=self.access)
        self.client = TestClient(self.app, base_url=self.access.origin)
        self.auth = (self.access.username, self.access.password)

    def test_all_private_routes_require_authentication(self):
        for path in ('/', '/api/auto/state', '/api/auto-replay/history', '/api/research/catalog', '/lab', '/assets/autopilot.js', '/docs', '/openapi.json'):
            with self.subTest(path=path):
                r = self.client.get(path)
                self.assertEqual(r.status_code, 401)
                self.assertEqual(r.headers['cache-control'], 'no-store')
        self.assertEqual(self.client.post('/api/auto/start', json={}).status_code, 401)
        self.assertEqual(self.client.get('/api/auto/state', auth=('alex', 'wrong')).status_code, 401)
        self.assertEqual(self.client.get('/', headers={'Authorization':'Basic broken'}).status_code, 401)

    def test_valid_login_and_security_headers(self):
        r = self.client.get('/api/auto/state', auth=self.auth)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers['cache-control'], 'no-store')
        self.assertEqual(r.headers['x-frame-options'], 'DENY')
        self.assertIn('max-age', r.headers['strict-transport-security'])

    def test_cross_origin_host_and_plain_http_rejected(self):
        self.assertEqual(self.client.get('/', auth=self.auth, headers={'host':'attacker.example'}).status_code, 403)
        self.assertEqual(self.client.get('http://pilot.example.com/', auth=self.auth).status_code, 403)
        self.assertEqual(self.client.post('/api/auto/start', json={}, auth=self.auth, headers={'origin':'https://attacker.example'}).status_code, 403)
        self.assertEqual(self.client.post('/api/auto/start', json={}, auth=self.auth, headers={'sec-fetch-site':'cross-site'}).status_code, 403)
        self.assertEqual(self.client.post('/api/auto/start', data='{}', auth=self.auth).status_code, 415)
        # Passed access checks; missing engine, not an authentication failure.
        self.assertEqual(self.client.post('/api/auto/start', json={}, auth=self.auth, headers={'origin':self.access.origin}).status_code, 503)

    def test_health_is_minimal_and_detects_stalled_loop(self):
        self.assertEqual(self.client.get('/healthz').json(), {'status':'unavailable'})
        state = self.app.state.service
        state.update(engine=object(), heartbeat=time.monotonic())
        self.assertEqual(self.client.get('/healthz').status_code, 200)
        state['heartbeat'] = time.monotonic()-301
        self.assertEqual(self.client.get('/healthz').status_code, 503)

    def test_cloud_config_fails_closed(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(Access.from_env().origin)
        for env in ({'BOT_CLOUD':'true'}, {'RENDER':'true'}, {'BOT_PUBLIC_ORIGIN':'http://pilot.example.com'},
                    {'BOT_PUBLIC_ORIGIN':self.access.origin, 'BOT_ADMIN_PASSWORD':'short'}):
            with patch.dict(os.environ, env, clear=True), self.assertRaises(ValueError):
                Access.from_env()
        with patch.dict(os.environ, {'BOT_PUBLIC_ORIGIN':self.access.origin, 'BOT_ADMIN_PASSWORD':self.access.password, 'BOT_DATA_DIR':'/var/data'}, clear=True):
            self.assertEqual(Access.from_env(), self.access)

    def test_storage_path_can_be_moved_without_credentials(self):
        import subprocess, sys
        with tempfile.TemporaryDirectory() as tmp:
            r = subprocess.run([sys.executable, '-c', 'from core.demo_autopilot import STORE; print(STORE)'],
                               env={**os.environ, 'BOT_DATA_DIR':tmp}, text=True, capture_output=True, check=True)
            self.assertEqual(Path(r.stdout.strip()), Path(tmp).resolve()/'autopilot')
