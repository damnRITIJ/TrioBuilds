import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from lambda_function import lambda_handler

class APIHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith('/score'):
            self.send_response(404)
            self.end_headers()
            return
            
        qs = parse_qs(parsed.query)
        qps = {k: v[0] for k, v in qs.items()}
        
        event = {"queryStringParameters": qps}
        
        try:
            res = lambda_handler(event, None)
            self.send_response(res.get("statusCode", 200))
            headers = res.get("headers", {})
            for k, v in headers.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(res.get("body", "").encode('utf-8'))
        except Exception as e:
            import traceback
            traceback.print_exc()
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(str(e).encode('utf-8'))

if __name__ == '__main__':
    port = 3000
    print(f"Starting local API emulator on port {port} (accessible on LAN and localhost)")
    HTTPServer(('0.0.0.0', port), APIHandler).serve_forever()
