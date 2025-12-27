const mongoose = require("mongoose");
const logger = require("../utils/logger");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: false, // Not everyone might want to provide a name initially
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    handle: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      sparse: true, // Allows null/undefined while maintaining uniqueness for non-null values
      index: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      default: "",
    },
    location: {
      city: String,
      neighborhood: String,
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },
    role: {
      type: String,
      enum: ["user", "tour_leader", "admin"],
      default: "user",
    },
    creatorType: {
      type: String,
      enum: ["artisan", "tour_leader"],
      default: "artisan",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    crafts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Craft",
      },
    ],
    favoriteCrafts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Craft",
      },
    ],
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
