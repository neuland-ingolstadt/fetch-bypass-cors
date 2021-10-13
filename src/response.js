/**
 * Helper class that mimics a `fetch` response.
 */
class HttpResponse {
  constructor (status, data) {
    this.status = status
    this.data = data
  }

  async text () {
    return this.data
  }

  async json () {
    return JSON.parse(this.data)
  }
}

module.exports = HttpResponse
