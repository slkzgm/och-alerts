import mongoose from "mongoose";
import { Hero } from "../db/hero.model";
import { connectMongoDB } from "../db";
import { MONGO_URI } from "../config";

async function getUnique() {
  try {
    // On se connecte à MongoDB
    await connectMongoDB(MONGO_URI);
    const heroes = await Hero.find({
      attributes: {
        $elemMatch: { trait_type: "Type", value: "Unique" },
      },
    }).select("tokenId -_id");

    const tokenIds = heroes.map((hero) => hero.tokenId);
    console.log(tokenIds);
  } catch (e) {
    console.error("Error while getting uniques: ", e);
  } finally {
    // Ferme la connexion MongoDB
    await mongoose.disconnect();
  }
}

getUnique();
