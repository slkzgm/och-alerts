// path: src/db/hero.model.ts
// Dev note: This is the Mongoose schema/model for Heroes. It keeps track of metadata and whether a hero is revealed.

import { Schema, model } from 'mongoose';

interface IHero {
    tokenId: number;
    name: string;
    description?: string;
    image?: string;
    attributes?: any[];
    isRevealed: boolean;
}

const heroSchema = new Schema<IHero>({
    tokenId: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    image: { type: String },
    attributes: { type: Array, default: [] },
    isRevealed: { type: Boolean, default: false }
});

export const Hero = model<IHero>('Hero', heroSchema);
