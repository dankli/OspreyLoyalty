import { createServer } from "node:http";
import { buildYoga } from "./server.js";
import { env } from "./env.js";
import { fetchMember } from "./features/member/membersClient.js";

const yoga = buildYoga();
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  const memberMatch = req.url?.match(/^\/api\/member\/([^/]+)$/);
  if (memberMatch) {
    void (async () => {
      try {
        const member = await fetchMember(env.MEMBERS_URL, decodeURIComponent(memberMatch[1]!));
        res.writeHead(member ? 200 : 404, { "content-type": "application/json" });
        res.end(JSON.stringify(member ?? { error: "not found" }));
      } catch {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "members service unavailable" }));
      }
    })();
    return;
  }

  yoga(req, res);
});

server.listen(env.PORT, () =>
  console.log(JSON.stringify({ msg: "gateway listening", port: env.PORT })));
