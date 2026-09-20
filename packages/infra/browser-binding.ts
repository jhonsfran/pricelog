import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";

export const browserBinding = Cloudflare.Browser("BROWSER").pipe(Alchemy.remote());
