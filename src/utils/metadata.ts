// path: src/utils/metadata.ts
// Dev note: Utility function to fetch metadata, then send alert (e.g. a tweet).

import axios from "axios";
import { NFT_COLLECTION_BASE_URI } from "../config";
import { tweetReveal } from "../twitter/twitter";

export async function fetchMetadataAndAlert(
  tokenId: string,
  owner: string
): Promise<void> {
  try {
    // Small delay to ensure metadata is updated on chain or in external APIs
    await new Promise((r) => setTimeout(r, 5000));

    const metadataUrl = `${NFT_COLLECTION_BASE_URI}${tokenId}`;
    console.log(
      `[fetchMetadataAndAlert] Fetching metadata from: ${metadataUrl}`
    );

    const response = await axios.get(metadataUrl);
    const metadata = response.data;

    console.log(`[fetchMetadataAndAlert] Metadata for #${tokenId}:`, metadata);

    // If metadata contains an image URL, proceed to tweet
    if (metadata.image) {
      await tweetReveal(tokenId, owner, metadata.image);
    } else {
      console.warn(
        `[fetchMetadataAndAlert] No image found in metadata for token #${tokenId}`
      );
    }
  } catch (error) {
    console.error(
      "[fetchMetadataAndAlert] Error fetching metadata or sending alert:",
      error
    );
  }
}
