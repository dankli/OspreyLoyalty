// A minimal, pure SSE frame parser. Given whatever text has accumulated so far, it returns the
// complete events and the leftover partial frame (`rest`) to prepend to the next chunk. No I/O.
export type SseEvent = { event: string; data: string };

export function parseSseEvents(buffer: string): { events: SseEvent[]; rest: string } {
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? ""; // the last block is possibly incomplete
  const events: SseEvent[] = [];
  for (const block of blocks) {
    if (block.trim() === "") continue;
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice("event:".length).trim();
      else if (line.startsWith("data:")) data += line.slice("data:".length).trim();
    }
    events.push({ event, data });
  }
  return { events, rest };
}
