// src/utils.ts
/**
 * src/utils.ts
 *
 * This file contains utility functions such as fetching metadata and sending notifications.
 */

import axios from "axios";
import { NFT_COLLECTION_BASE_URI } from "./config";
import { tweetReveal } from "./twitter";

export async function fetchMetadataAndAlert(tokenId: string, owner: string): Promise<void> {
    try {
        // Delay for metadata to update
        await new Promise(r => setTimeout(r, 15000));
        const metadataUrl = `${NFT_COLLECTION_BASE_URI}${tokenId}`;
        console.log(`[fetchMetadataAndAlert] Fetching metadata from: ${metadataUrl}`);

        const response = await axios.get(metadataUrl);
        const metadata = response.data;

        console.log(`[fetchMetadataAndAlert] Metadata for #${tokenId}:`, metadata);
        console.log(`[fetchMetadataAndAlert] Alert: Hero #${tokenId} has been revealed. Owner: ${owner}`);

        // If metadata contains an image URL, send a tweet with the image
        if (metadata.image) {
            await tweetReveal(tokenId, owner, metadata.image);
        } else {
            console.warn(`[fetchMetadataAndAlert] No image found in metadata for token ${tokenId}`);
        }

    } catch (error) {
        console.error("[fetchMetadataAndAlert] Error fetching metadata or sending alert:", error);
    }
}
