// path: src/db/index.ts
// Dev note: This file manages the connection to MongoDB.

import mongoose from "mongoose";

export async function connectMongoDB(uri: string) {
  try {
    const db = await mongoose.connect(uri);
    console.log("[MongoDB] Connection success!");
    return db;
  } catch (err) {
    console.error("[MongoDB] Connection error:", err);
    process.exit(1);
  }
}
