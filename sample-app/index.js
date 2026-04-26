const http = require('http')
const os = require('os')

const PORT = parseInt(process.env.PORT || '3000', 10)
const HOST = process.env.HOST || '0.0.0.0'

const server = http.createServer((req, res) => {
  const body = JSON.stringify({
    message: 'Hello from the Brimble sample app!',
    hostname: os.hostname(),
    path: req.url,
    timestamp: new Date().toISOString(),
  })

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
})

server.listen(PORT, HOST, () => {
  console.log(`Sample app listening on http://${HOST}:${PORT}`)
})
