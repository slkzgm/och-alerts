// path: src/twitter/twitter.ts
// Dev note: Handles the Twitter client initialization and posting tweets with media.

import { Scraper } from "agent-twitter-client";
import axios from "axios";
import { TWITTER_EMAIL, TWITTER_PASSWORD, TWITTER_USERNAME } from "../config";

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
 * Downloads media from a given URL and returns an object containing the media data and its MIME type.
 */
export async function getMediaDataFromUrl(
  mediaUrl: string,
  mimeType?: string
): Promise<{ data: Buffer; mediaType: string }> {
  try {
    console.log(`[getMediaDataFromUrl] Downloading media from: ${mediaUrl}`);
    const response = await axios.get(mediaUrl, { responseType: "arraybuffer" });
    const mediaData = Buffer.from(response.data, "binary");
    return { data: mediaData, mediaType: mimeType || "image/png" };
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
  imageUrl?: string
): Promise<void> {
  try {
    if (!isInitialized) {
      await initTwitterClient();
    }

    // Fallback tweet text if no image
    let tweetText = `Hero #${tokenId} has met an untimely end. Rest in peace.`;

    let mediaDataObj: { data: Buffer; mediaType: string } | undefined;

    if (imageUrl) {
      const urlLower = imageUrl.toLowerCase();
      let mimeType = "image/png";
      if (urlLower.endsWith(".gif")) {
        mimeType = "image/gif";
      }
      mediaDataObj = await getMediaDataFromUrl(imageUrl, mimeType);
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
