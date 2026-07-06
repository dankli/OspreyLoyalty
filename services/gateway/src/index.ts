import { createServer } from "node:http";
import { buildYoga } from "./server.js";
import { env } from "./env.js";

const yoga = buildYoga();
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  yoga(req, res);
});

server.listen(env.PORT, () =>
  console.log(JSON.stringify({ msg: "gateway listening", port: env.PORT })));
