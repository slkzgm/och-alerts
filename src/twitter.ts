// src/twitter.ts
/**
 * This file handles Twitter integration using agent-twitter-client to send tweets with media.
 */

import { Scraper } from 'agent-twitter-client';
import axios from 'axios';
import {
    TWITTER_EMAIL,
    TWITTER_PASSWORD,
    TWITTER_USERNAME
} from './config';

const twitterClient = new Scraper();
let isInitialized = false;

/**
 * Initializes the Twitter client by logging in.
 */
export async function initTwitterClient(): Promise<void> {
    await twitterClient.login(
        TWITTER_USERNAME,
        TWITTER_PASSWORD,
        TWITTER_EMAIL
    );
    isInitialized = true;
}

/**
 * Downloads media from a given URL and returns an object containing the media data and its MIME type.
 * @param mediaUrl - URL of the media.
 * @param mimeType - Optional MIME type (e.g., 'image/png' or 'image/gif').
 * @returns An object with properties: data (Buffer) and mediaType (string).
 */
export async function getMediaDataFromUrl(
    mediaUrl: string,
    mimeType?: string
): Promise<{ data: Buffer; mediaType: string }> {
    try {
        console.log(`[getMediaDataFromUrl] Downloading media from: ${mediaUrl}`);
        const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
        const mediaData = Buffer.from(response.data, 'binary');
        // Si aucun mimeType n'est fourni, on utilise 'image/png' par défaut.
        return { data: mediaData, mediaType: mimeType || 'image/png' };
    } catch (error) {
        console.error('[getMediaDataFromUrl] Error downloading media:', error);
        throw error;
    }
}

/**
 * Sends a tweet with an attached image.
 * @param tokenId - The token ID of the revealed hero.
 * @param owner - The owner address.
 * @param imageUrl - The URL of the hero image.
 */
export async function tweetReveal(
    tokenId: string,
    owner: string,
    imageUrl: string
): Promise<void> {
    try {
        if (!isInitialized) {
            await initTwitterClient();
        }
        // Determine MIME type based on file extension.
        const mimeType = imageUrl.toLowerCase().endsWith('.gif')
            ? 'image/gif'
            : 'image/png';

        // Download and prepare the media.
        const mediaDataObj = await getMediaDataFromUrl(imageUrl, mimeType);

        // Compose the tweet text.
        const tweetText = `Hero #${tokenId} has been revealed!\nOwner: ${owner}`;
        console.log(`[tweetReveal] Sending tweet: ${tweetText}`);

        // Send the tweet using the sendTweet method.
        // The second parameter is left undefined (pour des options supplémentaires si besoin).
        await twitterClient.sendTweet(tweetText, undefined, [mediaDataObj]);

        console.log('[tweetReveal] Tweet sent successfully.');
    } catch (error) {
        console.error('[tweetReveal] Error sending tweet:', error);
    }
}
