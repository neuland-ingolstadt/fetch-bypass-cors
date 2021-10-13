import { util } from 'node-forge/lib/index'
import http from 'node-forge/lib/http'

/**
 * Helper class that holds the request data and the requests event handlers.
 */
export default class HttpRequest {
  constructor (options) {
    this.options = options

    this.request = http.createRequest(this.options.forge)
    this.response = http.createResponse()
    this.buffer = util.createBuffer()
  }

  /**
   * @returns The request headers and body.
   */
  getRequestData () {
    return this.request.toString() + this.request.body
  }

  /**
   * Processes a chunk of response data and call the appropirate event handlers if finished.
   * @returns `true` if the entire response has been received, `false` if more data is expected.
   */
  putResponseChunk (data) {
    this.buffer.putBytes(data)

    if (!this.response.headerReceived) {
      this.response.readHeader(this.buffer)
    }

    if (this.response.headerReceived) {
      if (this.response.readBody(this.buffer)) {
        this.options.response(this.response.body)
        return true
      } else {
        return false
      }
    } else {
      return false
    }
  }

  /**
   * Call the error handlers to indicate an error.
   */
  processError (error) {
    this.options.error(error)
  }
}
