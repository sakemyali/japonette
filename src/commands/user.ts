import { AuthError } from "../auth.js";
import { apiGet, ApiError } from "../client.js";
import { err, userCard } from "../render.js";

export async function userCmd(login: string): Promise<void> {
  try {
    const data = await apiGet<any>(`/v2/users/${encodeURIComponent(login)}`);
    userCard(data);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      err(`user not found: ${login}`);
      process.exit(1);
    }
    if (e instanceof ApiError || e instanceof AuthError) {
      err(e.message);
      process.exit(1);
    }
    throw e;
  }
}
