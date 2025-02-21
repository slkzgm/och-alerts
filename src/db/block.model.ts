// path: src/db/block.model.ts
// Dev note: This schema is used to store the last processed block in a single key-value manner.

import { Schema, model } from 'mongoose';

interface IBlock {
    key: string;
    value: number;
}

const blockSchema = new Schema<IBlock>({
    key: { type: String, unique: true },
    value: { type: Number, default: 0 },
});

export const Block = model<IBlock>('Block', blockSchema);

/**
 * Retrieve the last processed block from the database.
 * Returns null if nothing is stored yet.
 */
export async function getLastProcessedBlock(): Promise<number | null> {
    const doc = await Block.findOne({ key: 'lastProcessedBlock' });
    return doc?.value || null;
}

/**
 * Update (or create if necessary) the last processed block in the database.
 */
export async function setLastProcessedBlock(blockNumber: number): Promise<void> {
    await Block.findOneAndUpdate(
        { key: 'lastProcessedBlock' },
        { value: blockNumber },
        { upsert: true }
    );
}
