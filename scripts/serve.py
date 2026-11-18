"""Serve a directory on 127.0.0.1 without a reverse-DNS lookup."""

import functools
import http.server
import socketserver
import sys


class Server(http.server.ThreadingHTTPServer):
    def server_bind(self) -> None:
        socketserver.TCPServer.server_bind(self)
        host, port = self.server_address[:2]
        self.server_name = host
        self.server_port = port


def main() -> None:
    if len(sys.argv) < 2 or len(sys.argv) > 3:
        raise SystemExit("usage: serve.py <port> [directory]")
    port = int(sys.argv[1])
    directory = sys.argv[2] if len(sys.argv) == 3 else "."
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)
    with Server(("127.0.0.1", port), handler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()
