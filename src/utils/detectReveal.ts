// path: src/utils/detectReveal.ts
// Dev note: This function fetches a token's metadata, checks if it's revealed,
// updates the DB (isRevealed = true) if needed, and returns a boolean telling you if it was revealed.

import axios from 'axios';
import { Hero } from '../db/hero.model';
import { NFT_COLLECTION_BASE_URI } from '../config';

export async function detectAndStoreReveal(tokenIdStr: string): Promise<boolean> {
    const tokenId = parseInt(tokenIdStr, 10);
    const metadataUrl = `${NFT_COLLECTION_BASE_URI}${tokenId}`;

    console.log(`[detectAndStoreReveal] Fetching metadata for token #${tokenId} at: ${metadataUrl}`);

    try {
        const res = await axios.get(metadataUrl, { timeout: 10000 });
        const metadata = res.data;

        // Decide if it's revealed
        const isRevealedNow = !metadata.image.includes("unrevealed");
        if (!isRevealedNow) {
            // If still unrevealed, no DB update
            console.log(`[detectAndStoreReveal] Token #${tokenId} is still unrevealed.`);
            return false;
        }

        // If it's revealed, mark it in DB
        const updatedDoc = await Hero.findOneAndUpdate(
            { tokenId },
            {
                tokenId,
                // you can store additional fields from metadata if you like
                name: metadata.name,
                description: metadata.description,
                image: metadata.image,
                attributes: metadata.attributes || [],
                isRevealed: true,
            },
            { upsert: true, new: true }
        );

        console.log(`[detectAndStoreReveal] Token #${tokenId} is revealed. DB updated. Document:`, updatedDoc);
        return true;

    } catch (err: any) {
        console.error(`[detectAndStoreReveal] Error fetching metadata for token #${tokenId}:`, err.message);
        return false;
    }
}
