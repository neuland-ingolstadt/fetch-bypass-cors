import { tls } from 'node-forge/lib/index.js'

import HttpRequest from './request.js'
import HttpResponse from './response.js'

const DEFAULT_TIMEOUT = 5000

function ab2str (buf) {
  return String.fromCharCode.apply(null, new Uint8Array(buf))
}

function str2ab (str) {
  const buf = new Uint8Array(str.length)
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    buf[i] = str.charCodeAt(i)
  }
  return buf
}

/**
 * A wrapper around node-forge that allows you to open a HTTPS connection proxied via WebSocket
 */
export default class ProxiedConnection {
  constructor (options) {
    console.debug('Creating new connection')

    this.options = options
    this.requests = []

    this.webSocket = new WebSocket(options.via)
    this.webSocket.binaryType = 'arraybuffer'
    // socket established -> perform TLS handshake
    this.webSocket.addEventListener('open', () => this.tlsConnection.handshake())
    // socket closed -> tear down
    this.webSocket.addEventListener('close', () => this.close())
    // socket failed -> throw error
    this.webSocket.addEventListener('error', event => this._onError(new Error('WebSocket connection failed: ' + event)))
    // received data from server -> decrypt with TLS
    this.webSocket.addEventListener('message', event => this.tlsConnection.process(ab2str(event.data)))

    this.tlsConnection = tls.createConnection({
      server: false,
      caStore: options.certs,
      virtualHost: options.target,
      verify: (connection, verified, depth, certs) => this._onVerify(verified, depth, certs),
      connected: connection => this._onConnected(),
      tlsDataReady: connection => this._onTlsDataReady(),
      dataReady: connection => this._onDataReady(),
      closed: () => this.close(),
      error: (connection, error) => this._onError(error)
    })

    this._restartTimeout()
  }

  fetch (url, init) {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        throw new Error('Connection is closed')
      }

      const parsedUrl = new URL(url)

      if (parsedUrl.hostname !== this.options.target) {
        throw new Error('Can not fetch from this host')
      }

      this.requests.push(new HttpRequest({
        forge: {
          method: init.method || 'GET',
          path: parsedUrl.pathname + parsedUrl.search,
          body: init.body,
          headers: init.headers
        },
        response: data => resolve(new HttpResponse(200, data)),
        error: err => reject(err)
      }))

      if (!this.isConnected) {
        console.debug('Not connected yet, delaying')
        return
      }

      if (this.requests.length > 1) {
        console.debug('There is a running request, delaying')
        return
      }

      console.debug('No running requests, starting immediately')
      this._sendNextRequest()
    })
  }

  /**
   * Closes the socket and cancels all ongoing requests.
   */
  close () {
    if (this.closed) {
      return
    }
    this.closed = true

    this.requests.forEach(request => {
      request.processError(new Error('Connection was closed'))
    })

    this.tlsConnection.close()
    this.webSocket.close()
    this.options.closed()
  }

  _restartTimeout () {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }

    this.timeout = setTimeout(() => this._onTimeout(), this.options.timeout || DEFAULT_TIMEOUT)
  }

  /**
   * Starts the first request from the request queue.
   */
  _sendNextRequest () {
    if (this.requests.length > 0) {
      const request = this.requests[0]
      this.tlsConnection.prepare(request.getRequestData())
    }
  }

  /**
   * Verifies the TLS certificate.
   */
  _onVerify (verified, depth, certs) {
    if (certs[0].subject.getField('CN').value === this.options.target) {
      return verified
    } else {
      return false
    }
  }

  /**
   * Called when the TLS connection has been established.
   */
  _onConnected () {
    this.isConnected = true
    this._sendNextRequest()
  }

  /**
   * Called when encrypted data is ready to be sent to the server.
   */
  _onTlsDataReady () {
    const data = this.tlsConnection.tlsData.getBytes()
    this.webSocket.send(str2ab(data))

    this._restartTimeout()
  }

  /**
   * Called when decrypted data is ready to be processed.
   */
  _onDataReady () {
    const data = this.tlsConnection.data.getBytes()
    if (this.requests.length === 0) {
      this._restartTimeout()
      return
    }

    const request = this.requests[0]
    if (request.putResponseChunk(data)) {
      this.requests.shift()
      this._sendNextRequest()
    }

    this._restartTimeout()
  }

  /**
   * Called when the connection times out.
   */
  _onTimeout () {
    console.debug('Connection closed due to timeout')

    this.timeout = null
    this.close()
  }

  /**
   * Called when the connection errors out.
   */
  _onError (error) {
    this.options.error(error)
    this.close()
  }
}
