import { createSocketServer } from "./socket-server";

const port = Number(process.env.PORT ?? 3001);
const { httpServer } = createSocketServer();

httpServer.listen(port, () => {
  console.log(`Paper Fleet server listening on http://localhost:${port}`);
});
