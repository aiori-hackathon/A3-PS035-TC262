import json
import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
from app.api.main import app
from app.collector.measurements import probe_link
from app.topology import load_topology


class IngestTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'NETSCOPE_TELEMETRY_STORAGE':'firestore', 'NETSCOPE_INGEST_TOKEN':'x'*40, 'NETSCOPE_LIVE_UIDS':'operator'}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.store = patch('app.api.telemetry_store.document').start()
        self.addCleanup(patch.stopall)
        self.client = app.test_client()
        self.headers = {'Authorization':'Bearer '+'x'*40}
        self.data = {'collected_at':datetime.now(timezone.utc).isoformat(), 'routers':[{'router':f'r{i}', 'healthy_collection':True, 'bgp':{'success':True,'output':'', 'private':'drop'},'private':'drop'} for i in range(1,6)]}

    def test_upload_requires_server_secret_and_rejects_browser_origin(self):
        for headers in ({}, {'Authorization':'Bearer wrong'}, {**self.headers,'Origin':'https://ui.example'}):
            self.assertEqual(self.client.post('/api/telemetry/ingest',json=self.data,headers=headers).status_code,403)
        self.store.assert_not_called()

    def test_upload_disabled_without_explicit_storage_mode(self):
        del os.environ['NETSCOPE_TELEMETRY_STORAGE']
        self.assertEqual(self.client.post('/api/telemetry/ingest',json=self.data,headers=self.headers).status_code,403)
        self.store.assert_not_called()

    def test_valid_upload_stores_only_allowed_fields(self):
        self.assertEqual(self.client.post('/api/telemetry/ingest',json=self.data,headers=self.headers).status_code,201)
        payload=self.store.return_value.set.call_args.args[0]['snapshot']
        self.assertIsInstance(payload,bytes)
        self.assertNotIn('private',payload.decode())
        self.assertEqual(len(json.loads(payload)['routers']),5)

    def test_collector_probe_targets_match_ingest_topology(self):
        topology = load_topology()
        link = topology['links'][0]
        routers_by_id = {
            router['id']: {'container': router['container']}
            for router in topology['routers']
        }
        ping_output = (
            '10 packets transmitted, 10 packets received, 0% packet loss\n'
            'rtt min/avg/max/mdev = 0.100/0.200/0.300/0.050 ms'
        )
        with patch('app.collector.measurements.run_command', return_value={'output': ping_output}):
            measurement = probe_link(link, routers_by_id)

        self.assertEqual(
            [probe['target'] for probe in measurement['observations']],
            [link['b'], link['a']],
        )
        payload = {
            **self.data,
            'topology': topology,
            'measurements': [measurement],
            'syslog_events': [],
        }
        response = self.client.post(
            '/api/telemetry/ingest', json=payload, headers=self.headers,
        )
        self.assertEqual(response.status_code, 201, response.get_data(as_text=True))

    def test_stale_malformed_and_oversized_uploads_do_not_write(self):
        for value in ({},None,{**self.data,'collected_at':'2000-01-01T00:00:00Z'},{**self.data,'routers':[]}):
            self.assertEqual(self.client.post('/api/telemetry/ingest',data=json.dumps(value),headers=self.headers).status_code,400)
        self.assertEqual(self.client.post('/api/telemetry/ingest',data=b'x'*500001,headers=self.headers).status_code,413)
        self.store.assert_not_called()

    def test_storage_failure_is_safe(self):
        self.store.side_effect=RuntimeError('SECRET')
        result=self.client.post('/api/telemetry/ingest',json=self.data,headers=self.headers)
        self.assertEqual(result.status_code,503)
        self.assertNotIn('SECRET',result.get_data(as_text=True))

    def test_cloud_read_still_requires_firebase_auth_and_returns_safe_envelope(self):
        self.assertEqual(self.client.get('/api/live/snapshot').status_code,401)
        record=MagicMock(exists=True)
        record.to_dict.return_value={'snapshot':json.dumps(self.data).encode()}
        self.store.return_value.get.return_value=record
        with patch('app.api.security.verify_token',return_value={'uid':'operator'}):
            result=self.client.get('/api/live/snapshot',headers={'Authorization':'Bearer firebase-token'})
        self.assertEqual(result.status_code,200)
        self.assertEqual(len(result.json['routers']),5)
        self.assertNotIn('bgp',result.json['routers'][0])
        self.assertEqual(result.json['incidents_scope'],'not_collected_by_cloud_uploader')
