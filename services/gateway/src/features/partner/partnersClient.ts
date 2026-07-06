const REQUEST_TIMEOUT_MS = 2000; // the BFF must answer fast or not at all

export type Partner = {
  id: string;
  name: string;
  rate: number;
};

export async function fetchPartners(baseUrl: string): Promise<Partner[]> {
  const response = await fetch(`${baseUrl}/partners`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`partners service responded ${response.status}`);
  return (await response.json()) as Partner[];
}
