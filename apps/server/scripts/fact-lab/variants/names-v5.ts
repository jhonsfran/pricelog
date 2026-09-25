import { namesVariant, type NamesSettings } from "./names-engine-v5";

const base: NamesSettings = {
  before: 16,
  after: 6,
  reach: 10,
  kindThreshold: 0.6,
  nameThreshold: 0.7,
  usdStatement: true,
  jsonLdNames: true,
};

export const namesV5Variants = [
  namesVariant(
    {
      id: "names-v5a",
      parent: "windows-v4a",
      hypothesis:
        "One Noul per distinct candidate name plus nearest-preceding attribution in code beats a per-price Choice over noisy options; still one request per page.",
    },
    base,
  ),
  namesVariant(
    {
      id: "names-v5b",
      parent: "names-v5a",
      hypothesis: "Without vendor JSON-LD names, the name Nouls alone attribute prices correctly.",
    },
    { ...base, jsonLdNames: false },
  ),
];
