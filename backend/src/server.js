import app from "./app.js";
import http from "http";

const PORT= 4000

const server = http.createServer(app)

server.listen(PORT, ()=>{
  console.log(`Server running on prt ${PORT}`)
})
