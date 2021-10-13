# fetch-bypass-cors

An implementation of `fetch` that bypasses CORS policies by proxying encrypted HTTPS requests via a WebSocket-to-TCP proxy.

It does not simply relay requests via an HTTP proxy. Rather, it establishes a connection that is fully encrypted between the client and the server, with the proxy relaying a TCP stream to work around the limitations of modern browsers. This allows you to access APIs that did not whitelist your domain without exposing user data to your server.

## Example

### Setting up the proxy

```bash
pip install websockify
websockify 3000 www.google.com:443
```

### Using the proxy

```javascript
import ProxiedConnection from 'fetch-bypass-cors'

const certs = [
  `-----BEGIN CERTIFICATE-----
  ...
  -----END CERTIFICATE-----`
]
const conn = new ProxiedConnection({
    // the host that is being proxied
    target: 'www.google.com',
    // the websocket server that was started above
    via: 'ws://localhost:3000',
    // the certificate store
    certs
})

// fetch google results (despite missing CORS headers!)
const resp = conn.fetch('https://www.google.com/search?q=test')
console.log(await resp.text())
```
