import axios from "axios";

// For health checks, always go directly to the backend server
// This ensures we can detect backend availability correctly
const BASE = "http://localhost:5000/api";

export async function checkHealth(): Promise<boolean> {
  try {
    const { data } = await axios.get<{ ok?: boolean }>(`${BASE}/health`, {
      timeout: 2500,
    });
    return !!data?.ok;
  } catch {
    return false;
  }
}
