// path: src/utils/heroRevealCheck.ts
// Dev note: Utility functions to check if a hero is revealed and to mark it as revealed.

import { Hero } from "../db/hero.model";

/**
 * Check if a hero is already revealed by reading from the Hero collection.
 */
export async function isHeroRevealed(tokenIdStr: string): Promise<boolean> {
  const tokenId = Number(tokenIdStr);
  const hero = await Hero.findOne({ tokenId });
  if (!hero) return false;
  return hero.isRevealed;
}

/**
 * Mark a hero as revealed in the Hero collection.
 */
export async function setHeroRevealed(tokenIdStr: string): Promise<void> {
  const tokenId = Number(tokenIdStr);
  await Hero.findOneAndUpdate(
    { tokenId },
    { isRevealed: true },
    { upsert: true }
  );
}
