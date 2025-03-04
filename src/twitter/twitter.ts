// path: src/twitter/twitter.ts
// Dev note: Handles the Twitter client initialization and posting tweets with media.

import { Scraper } from "agent-twitter-client";
import axios from "axios";
import { TWITTER_EMAIL, TWITTER_PASSWORD, TWITTER_USERNAME } from "../config";
import sharp from "sharp";

const twitterClient = new Scraper();
let isInitialized = false;

/**
 * Initializes the Twitter client by logging in.
 */
export async function initTwitterClient(): Promise<void> {
  if (isInitialized) {
    console.log("[Twitter] Already initialized.");
    return;
  }
  try {
    await twitterClient.login(
      TWITTER_USERNAME,
      TWITTER_PASSWORD,
      TWITTER_EMAIL
    );
    isInitialized = true;
    console.log("[Twitter] Login successful.");
  } catch (error) {
    console.error("[Twitter] Login error:", error);
    throw error;
  }
}

/**
 * Downloads media from a given URL, optionally applies grayscale if it's a PNG.
 * @param mediaUrl - The direct URL of the media.
 * @param mimeType - The MIME type (e.g., image/png, image/gif).
 * @param applyGrayscale - Whether or not to apply a grayscale transform.
 * @returns An object containing the media data (Buffer) and its MIME type.
 */
export async function getMediaDataFromUrl(
  mediaUrl: string,
  mimeType?: string,
  applyGrayscale?: boolean
): Promise<{ data: Buffer; mediaType: string }> {
  try {
    console.log(`[getMediaDataFromUrl] Downloading media from: ${mediaUrl}`);
    const response = await axios.get(mediaUrl, { responseType: "arraybuffer" });
    let mediaData = Buffer.from(response.data, "binary");

    // Only apply grayscale if requested and if it's a PNG
    if (applyGrayscale && (mimeType || "").includes("image/png")) {
      console.log("[getMediaDataFromUrl] Applying grayscale transformation...");
      mediaData = await sharp(mediaData).grayscale().toBuffer();
    }

    return {
      data: mediaData,
      mediaType: mimeType || "image/png",
    };
  } catch (error) {
    console.error("[getMediaDataFromUrl] Error downloading media:", error);
    throw error;
  }
}

/**
 * Sends a tweet with an attached image.
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
    const mimeType = imageUrl.toLowerCase().endsWith(".gif")
      ? "image/gif"
      : "image/png";

    const mediaDataObj = await getMediaDataFromUrl(imageUrl, mimeType);
    const tweetText = `Hero #${tokenId} has been revealed!\nOwner: ${owner}`;

    console.log(`[tweetReveal] Sending tweet: ${tweetText}`);
    await twitterClient.sendTweet(tweetText, undefined, [mediaDataObj]);

    console.log("[tweetReveal] Tweet sent successfully.");
  } catch (error) {
    console.error("[tweetReveal] Error sending tweet:", error);
  }
}

/**
 * Tweet about a hero's death. Optionally attach an image if provided.
 */
export async function tweetDeath(
  tokenId: string,
  imageUrl?: string,
  level?: number
): Promise<void> {
  try {
    if (!isInitialized) {
      await initTwitterClient();
    }

    // Fallback tweet text if no image
    let tweetText = `Hero #${tokenId} has met an untimely end at level ${level}. Rest in peace.`;

    let mediaDataObj: { data: Buffer; mediaType: string } | undefined;

    if (imageUrl) {
      const urlLower = imageUrl.toLowerCase();
      let mimeType = "image/png";
      if (urlLower.endsWith(".gif")) {
        mimeType = "image/gif";
      }
      mediaDataObj = await getMediaDataFromUrl(imageUrl, mimeType, true);
      tweetText += `\n\nGone but not forgotten.`;
    }

    console.log(`[tweetDeath] Sending tweet: ${tweetText}`);
    if (mediaDataObj) {
      await twitterClient.sendTweet(tweetText, undefined, [mediaDataObj]);
    } else {
      await twitterClient.sendTweet(tweetText);
    }

    console.log("[tweetDeath] Death tweet sent successfully.");
  } catch (error) {
    console.error("[tweetDeath] Error sending death tweet:", error);
  }
}
