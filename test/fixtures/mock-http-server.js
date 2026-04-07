#!/usr/bin/env node
/**
 * Mock HTTP server for testing the HttpAdapter.
 *
 * Starts on port 17432 and provides:
 *   GET  /          → 200 OK (health check)
 *   POST /chat/completions → SSE stream response
 *
 * Usage:
 *   node test/fixtures/mock-http-server.js &
 *   # ... run tests ...
 *   kill %1
 */

const http = require('http');

const PORT = 17432;

const server = http.createServer((req, res) => {
	if (req.method === 'GET' && req.url === '/') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok' }));
		return;
	}

	if (req.method === 'POST' && req.url === '/chat/completions') {
		let body = '';
		req.on('data', (chunk) => { body += chunk; });
		req.on('end', () => {
			let parsed;
			try {
				parsed = JSON.parse(body);
			} catch {
				res.writeHead(400);
				res.end('Bad JSON');
				return;
			}

			const prompt = parsed.messages?.[parsed.messages.length - 1]?.content ?? '';

			// Check for error simulation
			if (prompt.toLowerCase().includes('error')) {
				res.writeHead(500);
				res.end(JSON.stringify({ error: { message: 'Mock server error' } }));
				return;
			}

			// Stream SSE response
			res.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive',
			});

			const words = ['Hello', ' from', ' mock', ' HTTP', ' server.', ` You said: "${prompt}".`];
			let idx = 0;

			const interval = setInterval(() => {
				if (idx < words.length) {
					const chunk = JSON.stringify({
						choices: [{ delta: { content: words[idx] } }],
					});
					res.write(`data: ${chunk}\n\n`);
					idx++;
				} else {
					res.write('data: [DONE]\n\n');
					res.end();
					clearInterval(interval);
				}
			}, 50);
		});
		return;
	}

	res.writeHead(404);
	res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`Mock HTTP server listening on http://127.0.0.1:${PORT}`);
});
